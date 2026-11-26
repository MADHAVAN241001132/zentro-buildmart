-- 0054: Checkout pricing validation and invoice numbering.
-- 1. The database recomputes each line's coupon share, taxable value and tax (previously the plan's tax was trusted
--    whenever its lines added up). One tax rule, app.line_tax, is shared with the later GST work.
-- 2. ensure_invoice locks the order before numbering, so concurrent generation cannot consume two invoice numbers
--    and leave a gap in the sequence. Released migrations 0001-0052 are not modified.

create or replace function app.line_tax(p_taxable bigint, p_gst_rate_bps integer)
returns bigint
language sql immutable
set search_path = public
as $$
  select round(p_taxable * p_gst_rate_bps / 10000.0)::bigint
$$;

create or replace function public.guest_checkout_place(
  p_store uuid, p_session uuid, p_request_key text, p_plan jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_minutes integer;
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
  v_quote jsonb; v_exp_disc bigint; v_exp_taxable bigint; v_exp_tax bigint;
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

  -- The fingerprint excludes the payment window: it is derived here, so a client retry never changes the request.
  v_hash := encode(sha256(convert_to((p_plan - 'expires_at')::text, 'UTF8')), 'hex');

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
  -- Subtotal is recomputed from live prices. The database then recomputes each line's coupon share, taxable value
  -- and tax with the shared rule app.line_tax, and refuses any figure in the plan that differs. Client amounts are
  -- never trusted merely because they add up.
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
    v_sub := v_sub + round((v_l ->> 'unit_price_paise')::numeric * (v_l ->> 'quantity')::numeric)::bigint;
  end loop;

  v_coupon := nullif(btrim(coalesce(p_plan ->> 'coupon_code', '')), '');
  if (p_plan ->> 'subtotal_paise')::bigint <> v_sub then
    raise exception 'plan_mismatch: subtotal does not match the live prices' using errcode = 'P0001';
  end if;

  -- The coupon share of each cart line, from the same allocation the cart quote uses. Raises if the coupon is not
  -- valid now (switched off, expired, exhausted, below the minimum); the coupon row is locked for this transaction.
  if v_coupon is not null then
    v_quote := app.cart_coupon_allocation(v_cart, v_coupon);
  else
    v_quote := jsonb_build_object('discount_paise', 0, 'lines', '[]'::jsonb);
  end if;

  for v_l in
    select e.value from jsonb_array_elements(p_plan -> 'lines') e order by (e.value ->> 'variant_id')
  loop
    v_line_base := round((v_l ->> 'unit_price_paise')::numeric * (v_l ->> 'quantity')::numeric)::bigint;
    select coalesce(sum((a ->> 'discount_paise')::bigint), 0) into v_exp_disc
      from jsonb_array_elements(v_quote -> 'lines') a
      join cart_items ci on ci.id = (a ->> 'cart_item_id')::uuid
     where ci.cart_id = v_cart and ci.variant_id = (v_l ->> 'variant_id')::uuid;
    v_exp_taxable := v_line_base - v_exp_disc;
    v_exp_tax := app.line_tax(v_exp_taxable, (v_l ->> 'gst_rate_bps')::integer);
    if (v_l ->> 'discount_paise')::bigint <> v_exp_disc
       or (v_l ->> 'taxable_paise')::bigint <> v_exp_taxable
       or (v_l ->> 'tax_paise')::bigint <> v_exp_tax
       or (v_l ->> 'line_total_paise')::bigint <> v_exp_taxable + v_exp_tax then
      raise exception 'plan_mismatch: a line discount or tax does not match the server calculation' using errcode = 'P0001';
    end if;
    v_line_disc := v_line_disc + v_exp_disc;
    v_line_tax := v_line_tax + v_exp_tax;
    v_line_total := v_line_total + v_exp_taxable + v_exp_tax;
  end loop;

  v_disc := v_line_disc;
  v_tax := v_line_tax;
  v_total := v_line_total;
  if v_disc <> coalesce((v_quote ->> 'discount_paise')::bigint, 0) then
    raise exception 'plan_mismatch: the coupon allocation does not add up' using errcode = 'P0001';
  end if;
  if (p_plan ->> 'discount_paise')::bigint <> v_disc or (p_plan ->> 'tax_paise')::bigint <> v_tax
     or (p_plan ->> 'total_paise')::bigint <> v_total then
    raise exception 'plan_mismatch: totals do not match the server calculation' using errcode = 'P0001';
  end if;
  if v_total <> v_sub - v_disc + v_tax then
    raise exception 'plan_mismatch: total is not subtotal less discount plus tax' using errcode = 'P0001';
  end if;
  if v_coupon is null and v_disc <> 0 then
    raise exception 'plan_mismatch: a discount needs a coupon' using errcode = 'P0001';
  end if;

  -- Payment window and order number.
  -- The payment window is set by the database from the store's own setting, never by the client.
  select coalesce(s.payment_expiry_minutes, 15) into v_minutes from store_settings s where s.store_id = p_store;
  v_expires := now() + make_interval(mins => coalesce(v_minutes, 15));
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

create or replace function app.ensure_invoice(p_order uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o orders%rowtype;
  v_id uuid;
  v_prefix text;
begin
  -- Lock the order first: a concurrent caller waits here and then finds the invoice that was just issued.
  select * into o from orders where id = p_order for update;
  if not found then return null; end if;
  if o.payment_status <> 'PAID' or o.order_status = 'CANCELLED' then return null; end if;

  select id into v_id from invoices where order_id = p_order;
  if v_id is not null then return v_id; end if;

  select invoice_prefix into v_prefix from store_settings where store_id = o.store_id;
  insert into invoices (store_id, order_id, invoice_number, invoice_date, taxable_paise, tax_paise, total_paise)
  values (o.store_id, o.id, app.next_number(o.store_id, 'invoice', coalesce(v_prefix, 'INV')),
          current_date, o.taxable_paise, o.tax_paise, o.total_paise)
  on conflict (order_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from invoices where order_id = p_order;
  else
    perform app.audit(o.store_id, 'invoice.issued', 'orders', o.id, null,
      jsonb_build_object('total_paise', o.total_paise, 'channel', o.channel));
  end if;
  return v_id;
end $function$;
