-- ZENTRO BuildMart: transaction-safe Guest checkout (Priority 1).
-- One database transaction places a Guest order: request claim, cart lock, plan verification against live
-- prices and tax basis, order and items, coupon redemption, stock reservation and (for cash) the payment attempt.
-- Any failure rolls the whole transaction back, so no partial order, reservation or coupon redemption survives.
-- Online payments are created by the application AFTER this commits, through guest_checkout_attach_payment.

-- ---------------------------------------------------------------------------
-- 1. Checkout request claims (idempotency), scoped to store and Guest session
-- ---------------------------------------------------------------------------
-- A row exists only when its placement committed (status 'completed'), because the claim and the placement share
-- one transaction. An in-progress row is therefore visible only to the attempt that owns it, so a duplicate
-- request waits on the unique index and then replays the committed result.
create table if not exists guest_checkout_requests (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  guest_session_id  uuid not null references guest_sessions(id) on delete cascade,
  request_key       text not null check (length(request_key) between 8 and 80),
  request_hash      text not null check (length(request_hash) = 64),
  status            text not null check (status in ('in_progress','completed')),
  order_id          uuid references orders(id) on delete set null,
  result            jsonb,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (store_id, guest_session_id, request_key),
  check ((status = 'completed') = (result is not null))
);
alter table guest_checkout_requests enable row level security;
revoke all on guest_checkout_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Atomic placement
-- ---------------------------------------------------------------------------
-- p_plan is built by the application from the cart it has just read. Every money, quantity, tax-basis and
-- price value in it is verified here against the live rows, under locks. A mismatch raises and rolls back;
-- the database never trusts the plan's totals on their own.
--
-- Lock order (deterministic): checkout request claim, guest session, cart, product variants (by variant id),
-- inventory (by variant id, inside reserve_order_stock), coupon (inside guest_redeem_coupon).
create or replace function public.guest_checkout_place(
  p_store uuid, p_session uuid, p_request_key text, p_plan jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_req_id uuid;
  v_req guest_checkout_requests%rowtype;
  v_cart uuid;
  v_method text;
  v_prefix text;
  v_coupon text;
  v_expires timestamptz;
  v_sub bigint := 0; v_disc bigint := 0; v_tax bigint := 0; v_total bigint;
  v_line_disc bigint := 0; v_line_tax bigint := 0; v_line_total bigint := 0;
  v_line_base bigint;
  v_order_id uuid; v_order_number text;
  v_result jsonb;
  v_l jsonb;
  v_cart_fp jsonb; v_plan_fp jsonb;
begin
  if not app.is_server() then raise exception 'checkout is server-only' using errcode = '42501'; end if;
  if p_request_key is null or length(p_request_key) not between 8 and 80 then
    raise exception 'invalid checkout request key' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan -> 'lines') <> 'array'
     or jsonb_array_length(p_plan -> 'lines') = 0 then
    raise exception 'invalid checkout plan' using errcode = '22023';
  end if;
  v_method := p_plan ->> 'method';
  if v_method not in ('online', 'cash') then raise exception 'invalid payment method' using errcode = '22023'; end if;

  v_hash := encode(sha256(convert_to(p_plan::text, 'UTF8')), 'hex');

  -- Claim the key. A duplicate with a committed result replays; a duplicate with different details is refused.
  insert into guest_checkout_requests (store_id, guest_session_id, request_key, request_hash, status)
  values (p_store, p_session, p_request_key, v_hash, 'in_progress')
  on conflict (store_id, guest_session_id, request_key) do nothing
  returning id into v_req_id;
  if v_req_id is null then
    select * into v_req from guest_checkout_requests
    where store_id = p_store and guest_session_id = p_session and request_key = p_request_key
    for update;
    if v_req.request_hash <> v_hash then
      raise exception 'request_key_reused: this key was used for different checkout details' using errcode = '22023';
    end if;
    if v_req.status = 'completed' then
      return v_req.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'checkout_in_progress' using errcode = '55000';
  end if;

  -- Store and Guest session.
  if not exists (select 1 from stores where id = p_store and status = 'active') then
    raise exception 'this showroom is not taking orders' using errcode = 'P0001';
  end if;
  perform 1 from guest_sessions
  where id = p_session and store_id = p_store and expires_at > now()
  for share;
  if not found then raise exception 'your session has expired; please reload the store' using errcode = 'P0001'; end if;

  -- Cart: lock it and confirm it is the same basket the plan describes (variant and quantity).
  select id into v_cart from carts
  where store_id = p_store and guest_session_id = p_session and status = 'active'
  for update;
  if v_cart is null then raise exception 'cart_empty: your cart is empty' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('variant_id', ci.variant_id, 'quantity', ci.quantity)
                            order by ci.variant_id), '[]'::jsonb)
    into v_cart_fp from cart_items ci where ci.cart_id = v_cart;
  select coalesce(jsonb_agg(jsonb_build_object('variant_id', (e.value ->> 'variant_id')::uuid,
                                               'quantity', (e.value ->> 'quantity')::numeric)
                            order by (e.value ->> 'variant_id')::uuid), '[]'::jsonb)
    into v_plan_fp from jsonb_array_elements(p_plan -> 'lines') e;
  if v_cart_fp <> v_plan_fp then
    raise exception 'cart_changed: your cart changed; review it and try again' using errcode = 'P0001';
  end if;

  -- Variants: lock in variant-id order, then verify price, cost, activity and GST rate against live rows.
  for v_l in
    select e.value from jsonb_array_elements(p_plan -> 'lines') e order by (e.value ->> 'variant_id')
  loop
    perform 1 from product_variants pv join products pr on pr.id = pv.product_id
    where pv.id = (v_l ->> 'variant_id')::uuid and pv.store_id = p_store
      and pv.is_active and pr.status = 'active' and pr.visibility = 'public'
      and pv.sale_price_paise = (v_l ->> 'unit_price_paise')::bigint
      and pv.cost_price_paise = (v_l ->> 'cost_price_paise')::bigint
      and pr.gst_rate_bps = (v_l ->> 'gst_rate_bps')::integer
    for update of pv;
    if not found then
      raise exception 'cart_changed: a price, tax rate or item changed; review your cart' using errcode = 'P0001';
    end if;

    -- Line arithmetic. Base = unit price x quantity, rounded to paise; the plan must agree exactly.
    v_line_base := round((v_l ->> 'unit_price_paise')::numeric * (v_l ->> 'quantity')::numeric)::bigint;
    if v_line_base <> (v_l ->> 'taxable_paise')::bigint + (v_l ->> 'discount_paise')::bigint then
      raise exception 'plan_mismatch: line amounts do not match the price' using errcode = 'P0001';
    end if;
    if (v_l ->> 'taxable_paise')::bigint + (v_l ->> 'tax_paise')::bigint <> (v_l ->> 'line_total_paise')::bigint then
      raise exception 'plan_mismatch: line total is inconsistent' using errcode = 'P0001';
    end if;

    v_sub := v_sub + v_line_base;
    v_line_disc := v_line_disc + (v_l ->> 'discount_paise')::bigint;
    v_line_tax := v_line_tax + (v_l ->> 'tax_paise')::bigint;
    v_line_total := v_line_total + (v_l ->> 'line_total_paise')::bigint;
  end loop;

  v_disc := (p_plan ->> 'discount_paise')::bigint;
  v_tax := (p_plan ->> 'tax_paise')::bigint;
  v_total := (p_plan ->> 'total_paise')::bigint;
  v_coupon := nullif(btrim(coalesce(p_plan ->> 'coupon_code', '')), '');
  if (p_plan ->> 'subtotal_paise')::bigint <> v_sub then
    raise exception 'plan_mismatch: subtotal does not match the lines' using errcode = 'P0001';
  end if;
  if v_line_disc <> v_disc or v_line_tax <> v_tax or v_line_total <> v_total then
    raise exception 'plan_mismatch: totals do not match the lines' using errcode = 'P0001';
  end if;
  if v_total <> v_sub - v_disc + v_tax then
    raise exception 'plan_mismatch: total is not subtotal less discount plus tax' using errcode = 'P0001';
  end if;
  if v_coupon is null and v_disc <> 0 then
    raise exception 'plan_mismatch: a discount needs a coupon' using errcode = 'P0001';
  end if;

  -- Payment window and order number.
  v_expires := (p_plan ->> 'expires_at')::timestamptz;
  if v_expires is null or v_expires <= now() then
    raise exception 'invalid payment window' using errcode = '22023';
  end if;
  select s.order_prefix into v_prefix from store_settings s where s.store_id = p_store;
  v_prefix := coalesce(v_prefix, 'ZBM');
  v_order_number := app.next_number(p_store, 'order', v_prefix);

  insert into orders (
    store_id, order_number, channel, guest_session_id, customer_name, customer_mobile, customer_email,
    fulfilment, payment_method, coupon_code, subtotal_paise, discount_paise, taxable_paise, tax_paise,
    delivery_paise, total_paise
  ) values (
    p_store, v_order_number, 'online', p_session, p_plan ->> 'customer_name', p_plan ->> 'customer_mobile',
    nullif(p_plan ->> 'customer_email', ''), 'pickup', v_method, v_coupon, v_sub, v_disc, v_sub - v_disc, v_tax,
    0, v_total
  ) returning id into v_order_id;

  insert into order_items (
    order_id, store_id, variant_id, product_name_snapshot, variant_label_snapshot, sku_snapshot, hsn_code_snapshot,
    quantity, stock_units, cost_price_paise_snapshot, unit_price_paise, discount_paise, gst_rate_bps,
    taxable_paise, tax_paise, line_total_paise
  )
  select v_order_id, p_store, (e.value ->> 'variant_id')::uuid, e.value ->> 'product_name',
         e.value ->> 'variant_label', e.value ->> 'sku', nullif(e.value ->> 'hsn_code', ''),
         (e.value ->> 'quantity')::numeric, ceil((e.value ->> 'quantity')::numeric)::bigint,
         (e.value ->> 'cost_price_paise')::bigint, (e.value ->> 'unit_price_paise')::bigint,
         (e.value ->> 'discount_paise')::bigint, (e.value ->> 'gst_rate_bps')::integer,
         (e.value ->> 'taxable_paise')::bigint, (e.value ->> 'tax_paise')::bigint,
         (e.value ->> 'line_total_paise')::bigint
  from jsonb_array_elements(p_plan -> 'lines') e
  order by (e.value ->> 'variant_id');

  -- Coupon: re-derives the discount from the stored order and refuses a mismatch or an exhausted coupon.
  if v_coupon is not null then
    perform guest_redeem_coupon(v_order_id);
  end if;

  -- Stock: refuses oversell; reservations are exactly once per order (reserve_order_stock checks for an active one).
  perform reserve_order_stock(v_order_id);

  -- Cash is recorded now. Online payments are attached after this commits (guest_checkout_attach_payment).
  if v_method = 'cash' then
    perform create_payment_attempt(v_order_id, 'cash', 'cash', 'cash_' || v_order_id::text, v_total, v_expires);
  end if;

  update carts set status = 'converted', updated_at = now() where id = v_cart;

  v_result := jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'method', v_method,
    'total_paise', v_total, 'cart_id', v_cart, 'payment_attached', v_method = 'cash'
  );
  update guest_checkout_requests
     set status = 'completed', order_id = v_order_id, result = v_result, completed_at = now()
   where id = v_req_id;
  return v_result || jsonb_build_object('replayed', false);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Online payment attachment (runs after the provider order is created)
-- ---------------------------------------------------------------------------
-- Idempotent for the same provider order. A second, different provider order on the same Guest order is refused,
-- so no provider order is created or attached automatically to replace an uncertain one.
create or replace function public.guest_checkout_attach_payment(
  p_order uuid, p_provider text, p_provider_order_id text, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  v_existing uuid;
begin
  if not app.is_server() then raise exception 'payment attachment is server-only' using errcode = '42501'; end if;
  if p_provider not in ('razorpay', 'simulator') then raise exception 'unknown payment provider' using errcode = '22023'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.payment_method <> 'online' then raise exception 'order is not an online payment' using errcode = 'P0001'; end if;

  select id into v_existing from payments
  where order_id = p_order and provider = p_provider and provider_order_id = p_provider_order_id;
  if v_existing is not null then return v_existing; end if;

  if exists (select 1 from payments where order_id = p_order) then
    raise exception 'payment_already_attached: this order already has a payment attempt' using errcode = 'P0001';
  end if;
  return create_payment_attempt(p_order, 'online', p_provider, p_provider_order_id, o.total_paise, p_expires_at);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Grants: server only
-- ---------------------------------------------------------------------------
revoke execute on function public.guest_checkout_place(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.guest_checkout_attach_payment(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.guest_checkout_place(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.guest_checkout_attach_payment(uuid, text, text, timestamptz) to service_role;
