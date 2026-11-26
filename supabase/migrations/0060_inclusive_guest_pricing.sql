-- 0060: Tax-inclusive pricing for Guest checkout (GST Priority 2, pricing integration).
--
-- Policy (applies to every mode, reusing app.line_amounts from 0059):
--   1. The configured price is the customer's gross price for the line.
--   2. The coupon discount is calculated on the gross (customer-paid) amounts, exactly as before, and is allocated
--      to lines by the existing allocation (app.cart_coupon_allocation).
--   3. The taxable value and tax of each line are then calculated on the discounted gross amount:
--        exclusive: taxable = discounted gross, tax = GST on it, payable = taxable + tax.
--        inclusive: taxable = discounted gross extracted from GST, tax = gross - taxable, payable = discounted gross.
--        not collecting (composition, unregistered): taxable = payable = discounted gross, tax = 0.
--   4. The order ledger stays tax-exclusive for every mode, so the existing invariant holds:
--        total = subtotal - discount + tax.
--      subtotal_paise  = taxable value before discount (tax-exclusive)
--      discount_paise  = discount on that taxable basis (tax-exclusive)
--      gross_subtotal_paise / gross_discount_paise keep the customer-paid basis the coupon used.
-- Released migrations 0001-0059 are not modified. Only Guest checkout is integrated here; POS and quotations remain
-- refused for inclusive stores by the channel-specific guard below.

alter table orders
  add column if not exists gross_subtotal_paise bigint check (gross_subtotal_paise is null or gross_subtotal_paise >= 0),
  add column if not exists gross_discount_paise bigint check (gross_discount_paise is null or gross_discount_paise >= 0);

-- Component split from a line's taxable value and tax. Intrastate: CGST is the tax at half the rate (capped at the
-- tax so rounding can never make a part negative); the remainder is SGST or UTGST. Interstate: IGST = tax.
create or replace function app.gst_split(
  p_taxable bigint, p_tax bigint, p_rate_bps integer, p_collect boolean, p_interstate boolean, p_ut boolean
) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_cgst bigint;
begin
  if not p_collect or p_tax = 0 then
    return jsonb_build_object('cgst', 0, 'sgst', 0, 'utgst', 0, 'igst', 0, 'total', 0);
  end if;
  if p_interstate then
    return jsonb_build_object('cgst', 0, 'sgst', 0, 'utgst', 0, 'igst', p_tax, 'total', p_tax);
  end if;
  v_cgst := least(app.line_tax(p_taxable, p_rate_bps / 2), p_tax);
  if p_ut then
    return jsonb_build_object('cgst', v_cgst, 'sgst', 0, 'utgst', p_tax - v_cgst, 'igst', 0, 'total', p_tax);
  end if;
  return jsonb_build_object('cgst', v_cgst, 'sgst', p_tax - v_cgst, 'utgst', 0, 'igst', 0, 'total', p_tax);
end $$;

-- Channel-specific safeguard. Guest checkout (channel online with a guest session) implements inclusive pricing.
-- POS and any other order path do not, so an inclusive store that collects GST is refused there.
create or replace function app.guard_pricing_mode()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_inclusive boolean;
begin
  if new.tax_mode <> 'taxed' then return new; end if;
  select s.prices_include_gst into v_inclusive from stores s where s.id = new.store_id;
  if coalesce(v_inclusive, false)
     and not (new.channel = 'online' and new.guest_session_id is not null) then
    raise exception 'pricing_mode_unsupported: tax-inclusive pricing is not yet available for this sales channel'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Coupon redemption uses the gross basis the coupon was calculated on (falls back to the ledger for older orders).
create or replace function public.guest_redeem_coupon(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  c coupons%rowtype;
  v_d bigint;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.coupon_code is null or btrim(o.coupon_code) = '' then
    return jsonb_build_object('redeemed', false);
  end if;

  select * into c from coupons where store_id = o.store_id and code = upper(btrim(o.coupon_code)) for update;
  if not found then raise exception 'coupon code not recognised' using errcode = 'P0001'; end if;
  v_d := app.coupon_discount(c, coalesce(o.gross_subtotal_paise, o.subtotal_paise));
  if v_d <> coalesce(o.gross_discount_paise, o.discount_paise) then
    raise exception 'the coupon no longer gives this discount; review your cart' using errcode = 'P0001';
  end if;

  insert into coupon_redemptions (store_id, coupon_id, order_id, discount_paise)
  values (o.store_id, c.id, o.id, v_d);
  update coupons set used_count = used_count + 1 where id = c.id;
  return jsonb_build_object('redeemed', true, 'coupon_id', c.id, 'discount_paise', v_d);
end $$;

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
  v_gross_sub bigint := 0; v_sub bigint := 0; v_gross_disc bigint := 0;
  v_disc bigint := 0; v_tax bigint := 0; v_total bigint;
  v_line_disc bigint := 0; v_line_tax bigint := 0; v_line_total bigint := 0;
  v_line_base bigint; v_post_gross bigint; v_pre_taxable bigint;
  v_quote jsonb; v_exp_disc_gross bigint; v_exp_disc bigint; v_exp_taxable bigint; v_exp_tax bigint;
  v_am jsonb;
  v_order_id uuid; v_order_number text;
  v_result jsonb;
  v_l jsonb;
  v_cart_fp jsonb; v_plan_fp jsonb;
  v_mode text;
  v_reg text;
  v_collect boolean;
  v_incl boolean := false;
  v_store_state text;
  v_supply text;
  v_inter boolean := false;
  v_ut boolean := false;
  v_cgst bigint := 0; v_sgst bigint := 0; v_utgst bigint := 0; v_igst bigint := 0;
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

  -- Tax policy, pricing mode and place of supply. The store profile is read here, inside the transaction.
  select s.gst_registration, s.state_code, s.prices_include_gst, r.tax_regime = 'ut'
    into v_reg, v_store_state, v_incl, v_ut
    from stores s left join gst_state_codes r on r.code = s.state_code
   where s.id = p_store;
  v_mode := app.store_gst_mode(p_store);
  if v_mode = 'invalid_profile' then
    raise exception 'gst_profile_incomplete: this showroom''s GST details are incomplete; checkout is unavailable'
      using errcode = 'P0001';
  end if;
  v_collect := v_mode = 'taxed';
  v_incl := coalesce(v_incl, false) and v_collect;
  v_supply := nullif(btrim(coalesce(p_plan ->> 'supply_state_code', '')), '');
  if v_collect or v_reg = 'composition' then
    if v_supply is null then
      raise exception 'plan_mismatch: place of supply (customer state) is required' using errcode = 'P0001';
    end if;
    if not exists (select 1 from gst_state_codes where code = v_supply) then
      raise exception 'plan_mismatch: unknown place of supply' using errcode = 'P0001';
    end if;
    v_inter := v_supply <> v_store_state;
    if v_reg = 'composition' and v_inter then
      raise exception 'gst_composition_interstate: a composition store cannot supply outside its state'
        using errcode = 'P0001';
    end if;
  end if;

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

  -- Variants: lock in variant-id order, verify price, cost, activity and GST rate against live rows, and accumulate
  -- the gross and tax-exclusive subtotals.
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
    v_line_base := round((v_l ->> 'unit_price_paise')::numeric * (v_l ->> 'quantity')::numeric)::bigint;
    v_gross_sub := v_gross_sub + v_line_base;
    v_sub := v_sub + (app.line_amounts(v_line_base, (v_l ->> 'gst_rate_bps')::integer, v_incl, v_collect) ->> 'taxable')::bigint;
  end loop;

  v_coupon := nullif(btrim(coalesce(p_plan ->> 'coupon_code', '')), '');
  if (p_plan ->> 'subtotal_paise')::bigint <> v_sub then
    raise exception 'plan_mismatch: subtotal does not match the live prices' using errcode = 'P0001';
  end if;

  -- The gross coupon share of each cart line, from the same allocation the cart quote uses.
  if v_coupon is not null then
    v_quote := app.cart_coupon_allocation(v_cart, v_coupon);
  else
    v_quote := jsonb_build_object('discount_paise', 0, 'lines', '[]'::jsonb);
  end if;

  for v_l in
    select e.value from jsonb_array_elements(p_plan -> 'lines') e order by (e.value ->> 'variant_id')
  loop
    v_line_base := round((v_l ->> 'unit_price_paise')::numeric * (v_l ->> 'quantity')::numeric)::bigint;
    select coalesce(sum((a ->> 'discount_paise')::bigint), 0) into v_exp_disc_gross
      from jsonb_array_elements(v_quote -> 'lines') a
      join cart_items ci on ci.id = (a ->> 'cart_item_id')::uuid
     where ci.cart_id = v_cart and ci.variant_id = (v_l ->> 'variant_id')::uuid;
    -- Discount first, then the tax treatment of what remains.
    v_post_gross := v_line_base - v_exp_disc_gross;
    v_am := app.line_amounts(v_post_gross, (v_l ->> 'gst_rate_bps')::integer, v_incl, v_collect);
    v_exp_taxable := (v_am ->> 'taxable')::bigint;
    v_exp_tax := (v_am ->> 'tax')::bigint;
    -- The ledger discount is on the tax-exclusive basis: pre-discount taxable less post-discount taxable.
    v_pre_taxable := (app.line_amounts(v_line_base, (v_l ->> 'gst_rate_bps')::integer, v_incl, v_collect) ->> 'taxable')::bigint;
    v_exp_disc := v_pre_taxable - v_exp_taxable;
    if (v_l ->> 'discount_paise')::bigint <> v_exp_disc
       or (v_l ->> 'taxable_paise')::bigint <> v_exp_taxable
       or (v_l ->> 'tax_paise')::bigint <> v_exp_tax
       or (v_l ->> 'line_total_paise')::bigint <> (v_am ->> 'total')::bigint then
      raise exception 'plan_mismatch: a line discount or tax does not match the server calculation' using errcode = 'P0001';
    end if;
    v_gross_disc := v_gross_disc + v_exp_disc_gross;
    v_line_disc := v_line_disc + v_exp_disc;
    v_line_tax := v_line_tax + v_exp_tax;
    v_line_total := v_line_total + (v_am ->> 'total')::bigint;
    v_cgst := v_cgst + (app.gst_split(v_exp_taxable, v_exp_tax, (v_l ->> 'gst_rate_bps')::integer, v_collect, v_inter, v_ut) ->> 'cgst')::bigint;
    v_sgst := v_sgst + (app.gst_split(v_exp_taxable, v_exp_tax, (v_l ->> 'gst_rate_bps')::integer, v_collect, v_inter, v_ut) ->> 'sgst')::bigint;
    v_utgst := v_utgst + (app.gst_split(v_exp_taxable, v_exp_tax, (v_l ->> 'gst_rate_bps')::integer, v_collect, v_inter, v_ut) ->> 'utgst')::bigint;
    v_igst := v_igst + (app.gst_split(v_exp_taxable, v_exp_tax, (v_l ->> 'gst_rate_bps')::integer, v_collect, v_inter, v_ut) ->> 'igst')::bigint;
  end loop;

  v_disc := v_line_disc;
  v_tax := v_line_tax;
  v_total := v_line_total;
  if v_gross_disc <> coalesce((v_quote ->> 'discount_paise')::bigint, 0) then
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
    delivery_paise, total_paise,
    supply_state_code, store_state_code, tax_mode, is_interstate,
    cgst_paise, sgst_paise, utgst_paise, igst_paise, gst_registration_snapshot,
    gross_subtotal_paise, gross_discount_paise
  ) values (
    p_store, v_order_number, 'online', p_session, p_plan ->> 'customer_name', p_plan ->> 'customer_mobile',
    nullif(p_plan ->> 'customer_email', ''), 'pickup', v_method, v_coupon, v_sub, v_disc, v_sub - v_disc, v_tax,
    0, v_total,
    case when v_collect or v_reg = 'composition' then v_supply end,
    v_store_state,
    case when v_collect then 'taxed' else 'not_collected' end,
    case when v_collect or v_reg = 'composition' then v_inter end,
    v_cgst, v_sgst, v_utgst, v_igst, v_reg,
    v_gross_sub, v_gross_disc
  ) returning id into v_order_id;

  insert into order_items (
    order_id, store_id, variant_id, product_name_snapshot, variant_label_snapshot, sku_snapshot, hsn_code_snapshot,
    quantity, stock_units, cost_price_paise_snapshot, unit_price_paise, discount_paise, gst_rate_bps,
    taxable_paise, tax_paise, line_total_paise, cgst_paise, sgst_paise, utgst_paise, igst_paise
  )
  select v_order_id, p_store, (e.value ->> 'variant_id')::uuid, e.value ->> 'product_name',
         e.value ->> 'variant_label', e.value ->> 'sku', nullif(e.value ->> 'hsn_code', ''),
         (e.value ->> 'quantity')::numeric, ceil((e.value ->> 'quantity')::numeric)::bigint,
         (e.value ->> 'cost_price_paise')::bigint, (e.value ->> 'unit_price_paise')::bigint,
         (e.value ->> 'discount_paise')::bigint, (e.value ->> 'gst_rate_bps')::integer,
         (e.value ->> 'taxable_paise')::bigint, (e.value ->> 'tax_paise')::bigint,
         (e.value ->> 'line_total_paise')::bigint,
         (g.split ->> 'cgst')::bigint, (g.split ->> 'sgst')::bigint, (g.split ->> 'utgst')::bigint, (g.split ->> 'igst')::bigint
  from jsonb_array_elements(p_plan -> 'lines') e
  cross join lateral (select app.gst_split((e.value ->> 'taxable_paise')::bigint, (e.value ->> 'tax_paise')::bigint,
                                           (e.value ->> 'gst_rate_bps')::integer, v_collect, v_inter, v_ut) as split) g
  order by (e.value ->> 'variant_id');

  -- Coupon: re-derives the discount from the stored order's gross basis and refuses a mismatch or an exhausted coupon.
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
