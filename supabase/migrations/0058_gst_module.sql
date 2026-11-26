-- 0058: GST module (Priority 2, first vertical slice).
-- 1. Reference table of GST state and union territory codes.
-- 2. GSTIN format, state-code and check-digit validation. This is FORMAT validation only. It does not verify
--    registration with the GST portal.
-- 3. Store tax mode: 'taxed' (regular registration with a valid GSTIN), 'not_collected' (composition or
--    unregistered: no GST may be collected from the customer), or 'invalid_profile' (regular without a valid GSTIN).
-- 4. Component split: CGST + SGST (or UTGST) for intrastate supply, IGST for interstate supply. The total is always
--    the existing app.line_tax result, so components can never disagree with the line tax.
-- 5. guest_checkout_place is redefined (copy of 0054 with the tax policy, place of supply and component snapshots).
--    Released migrations 0001-0057 are not modified.
-- Assumptions for qualified review are in docs/TAX_ASSUMPTIONS.md.

-- 1. State and union territory codes -------------------------------------------------------------------------------
create table if not exists gst_state_codes (
  code        text primary key check (code ~ '^[0-9]{2}$'),
  name        text not null,
  -- 'state' = SGST applies on intrastate supply; 'ut' = UTGST applies. Delhi, Puducherry and Jammu and Kashmir are
  -- listed as 'state' pending review (see docs/TAX_ASSUMPTIONS.md).
  tax_regime  text not null check (tax_regime in ('state', 'ut'))
);

insert into gst_state_codes (code, name, tax_regime) values
  ('01', 'Jammu and Kashmir', 'state'), ('02', 'Himachal Pradesh', 'state'), ('03', 'Punjab', 'state'),
  ('04', 'Chandigarh', 'ut'), ('05', 'Uttarakhand', 'state'), ('06', 'Haryana', 'state'),
  ('07', 'Delhi', 'state'), ('08', 'Rajasthan', 'state'), ('09', 'Uttar Pradesh', 'state'),
  ('10', 'Bihar', 'state'), ('11', 'Sikkim', 'state'), ('12', 'Arunachal Pradesh', 'state'),
  ('13', 'Nagaland', 'state'), ('14', 'Manipur', 'state'), ('15', 'Mizoram', 'state'),
  ('16', 'Tripura', 'state'), ('17', 'Meghalaya', 'state'), ('18', 'Assam', 'state'),
  ('19', 'West Bengal', 'state'), ('20', 'Jharkhand', 'state'), ('21', 'Odisha', 'state'),
  ('22', 'Chhattisgarh', 'state'), ('23', 'Madhya Pradesh', 'state'), ('24', 'Gujarat', 'state'),
  ('26', 'Dadra and Nagar Haveli and Daman and Diu', 'ut'), ('27', 'Maharashtra', 'state'),
  ('29', 'Karnataka', 'state'), ('30', 'Goa', 'state'), ('31', 'Lakshadweep', 'ut'),
  ('32', 'Kerala', 'state'), ('33', 'Tamil Nadu', 'state'), ('34', 'Puducherry', 'state'),
  ('35', 'Andaman and Nicobar Islands', 'ut'), ('36', 'Telangana', 'state'),
  ('37', 'Andhra Pradesh', 'state'), ('38', 'Ladakh', 'ut'), ('97', 'Other Territory', 'ut')
on conflict (code) do nothing;

alter table gst_state_codes enable row level security;
revoke all on gst_state_codes from public;
grant select on gst_state_codes to anon, authenticated;

-- 2. GSTIN validation -----------------------------------------------------------------------------------------------
-- Returns null when the GSTIN is well formed, otherwise a short reason. Checks: 15 characters in the GSTIN shape,
-- a known state code in the first two characters, and the check digit (mod 36, weights 1 and 2 from the right).
create or replace function app.gstin_problem(p_gstin text)
returns text
language plpgsql stable set search_path = public as $$
declare
  v_chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_sum integer := 0;
  v_factor integer;
  v_cp integer;
  v_addend integer;
  i integer;
begin
  if p_gstin is null then return 'missing'; end if;
  if p_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then return 'format'; end if;
  if not exists (select 1 from gst_state_codes where code = substr(p_gstin, 1, 2)) then return 'state_code'; end if;
  -- Position 0 (leftmost) is weighted last. Weight 2 applies to the characters at odd 0-based index counted from
  -- the right, i.e. index 13, 11, ...; weight 1 to the others.
  for i in 0..13 loop
    v_cp := position(substr(p_gstin, i + 1, 1) in v_chars) - 1;
    v_factor := case when (13 - i) % 2 = 0 then 2 else 1 end;
    v_addend := v_cp * v_factor;
    v_sum := v_sum + (v_addend / 36) + (v_addend % 36);
  end loop;
  if substr(v_chars, ((36 - (v_sum % 36)) % 36) + 1, 1) <> substr(p_gstin, 15, 1) then
    return 'check_digit';
  end if;
  return null;
end $$;

-- 3. Store tax mode -------------------------------------------------------------------------------------------------
alter table stores add column if not exists state_code text references gst_state_codes(code);

-- Backfill the state code from a GSTIN that is well formed. Stores without one keep a null state code and cannot
-- place a taxed order until the Owner sets it (the settings screen does this in the next slice).
update stores set state_code = substr(gstin, 1, 2)
 where state_code is null and app.gstin_problem(gstin) is null;

create or replace function app.store_gst_mode(p_store uuid)
returns text
language sql stable set search_path = public as $$
  select case
           when s.gst_registration in ('composition', 'unregistered') then 'not_collected'
           when s.gst_registration = 'regular'
                and app.gstin_problem(s.gstin) is null
                and s.state_code is not null
                and s.state_code = substr(s.gstin, 1, 2) then 'taxed'
           else 'invalid_profile'
         end
    from stores s where s.id = p_store
$$;

-- 4. Component split ------------------------------------------------------------------------------------------------
-- total = app.line_tax(taxable, rate), the same figure the checkout already verifies.
-- Intrastate: CGST = tax at half the rate (rounded once), the other half (UTGST or SGST) is the remainder, so the
-- halves always add up to the total exactly. Interstate: IGST = total.
create or replace function app.gst_components(
  p_taxable bigint, p_rate_bps integer, p_collect boolean, p_interstate boolean, p_ut boolean
) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_total bigint;
  v_cgst bigint;
begin
  if not p_collect then
    return jsonb_build_object('cgst', 0, 'sgst', 0, 'utgst', 0, 'igst', 0, 'total', 0);
  end if;
  v_total := app.line_tax(p_taxable, p_rate_bps);
  if p_interstate then
    return jsonb_build_object('cgst', 0, 'sgst', 0, 'utgst', 0, 'igst', v_total, 'total', v_total);
  end if;
  v_cgst := app.line_tax(p_taxable, p_rate_bps / 2);
  if p_ut then
    return jsonb_build_object('cgst', v_cgst, 'sgst', 0, 'utgst', v_total - v_cgst, 'igst', 0, 'total', v_total);
  end if;
  return jsonb_build_object('cgst', v_cgst, 'sgst', v_total - v_cgst, 'utgst', 0, 'igst', 0, 'total', v_total);
end $$;

-- 5. Snapshot columns -----------------------------------------------------------------------------------------------
-- Recorded at the moment of sale. Later changes to the store's registration or state do not alter these figures.
alter table orders
  add column if not exists supply_state_code text references gst_state_codes(code),
  add column if not exists store_state_code text references gst_state_codes(code),
  add column if not exists tax_mode text check (tax_mode in ('taxed', 'not_collected')),
  add column if not exists is_interstate boolean,
  add column if not exists cgst_paise bigint not null default 0 check (cgst_paise >= 0),
  add column if not exists sgst_paise bigint not null default 0 check (sgst_paise >= 0),
  add column if not exists utgst_paise bigint not null default 0 check (utgst_paise >= 0),
  add column if not exists igst_paise bigint not null default 0 check (igst_paise >= 0),
  add column if not exists gst_registration_snapshot text;

alter table orders drop constraint if exists orders_gst_components_check;
alter table orders add constraint orders_gst_components_check check (
  supply_state_code is null
  or cgst_paise + sgst_paise + utgst_paise + igst_paise = tax_paise
) not valid;

alter table order_items
  add column if not exists cgst_paise bigint not null default 0 check (cgst_paise >= 0),
  add column if not exists sgst_paise bigint not null default 0 check (sgst_paise >= 0),
  add column if not exists utgst_paise bigint not null default 0 check (utgst_paise >= 0),
  add column if not exists igst_paise bigint not null default 0 check (igst_paise >= 0);

alter table order_items drop constraint if exists order_items_gst_components_check;
-- Rows written before 0058 carry no components (all zero); they are accepted so released data still validates.
alter table order_items add constraint order_items_gst_components_check check (
  cgst_paise + sgst_paise + utgst_paise + igst_paise in (0, tax_paise)
) not valid;

-- 6. Checkout with the tax policy and place of supply ---------------------------------------------------------------
-- Changes from 0054:
--  * the store's tax mode decides whether tax is collected at all. Composition and unregistered stores collect
--    no GST: every line tax must be 0. A regular store without a valid GSTIN or state code is refused.
--  * plan.supply_state_code is required for taxed and composition stores. Unknown codes are refused.
--  * a composition store cannot supply outside its state.
--  * line and order component snapshots are written.
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
  v_mode text;
  v_reg text;
  v_collect boolean;
  v_store_state text;
  v_supply text;
  v_inter boolean := false;
  v_ut boolean := false;
  v_comp jsonb;
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

  -- Tax policy and place of supply. The store profile is read here, inside the transaction.
  select s.gst_registration, s.state_code, r.tax_regime = 'ut'
    into v_reg, v_store_state, v_ut
    from stores s left join gst_state_codes r on r.code = s.state_code
   where s.id = p_store;
  v_mode := app.store_gst_mode(p_store);
  if v_mode = 'invalid_profile' then
    raise exception 'gst_profile_incomplete: this showroom''s GST details are incomplete; checkout is unavailable'
      using errcode = 'P0001';
  end if;
  v_collect := v_mode = 'taxed';
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

  -- Variants: lock in variant-id order, then verify price, cost, activity and GST rate against live rows.
  -- Subtotal is recomputed from live prices. The database then recomputes each line's coupon share, taxable value,
  -- tax and components with the shared rules, and refuses any figure in the plan that differs.
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
    v_comp := app.gst_components(v_exp_taxable, (v_l ->> 'gst_rate_bps')::integer, v_collect, v_inter, v_ut);
    v_exp_tax := (v_comp ->> 'total')::bigint;
    if (v_l ->> 'discount_paise')::bigint <> v_exp_disc
       or (v_l ->> 'taxable_paise')::bigint <> v_exp_taxable
       or (v_l ->> 'tax_paise')::bigint <> v_exp_tax
       or (v_l ->> 'line_total_paise')::bigint <> v_exp_taxable + v_exp_tax then
      raise exception 'plan_mismatch: a line discount or tax does not match the server calculation' using errcode = 'P0001';
    end if;
    v_line_disc := v_line_disc + v_exp_disc;
    v_line_tax := v_line_tax + v_exp_tax;
    v_line_total := v_line_total + v_exp_taxable + v_exp_tax;
    v_cgst := v_cgst + (v_comp ->> 'cgst')::bigint;
    v_sgst := v_sgst + (v_comp ->> 'sgst')::bigint;
    v_utgst := v_utgst + (v_comp ->> 'utgst')::bigint;
    v_igst := v_igst + (v_comp ->> 'igst')::bigint;
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
    delivery_paise, total_paise,
    supply_state_code, store_state_code, tax_mode, is_interstate,
    cgst_paise, sgst_paise, utgst_paise, igst_paise, gst_registration_snapshot
  ) values (
    p_store, v_order_number, 'online', p_session, p_plan ->> 'customer_name', p_plan ->> 'customer_mobile',
    nullif(p_plan ->> 'customer_email', ''), 'pickup', v_method, v_coupon, v_sub, v_disc, v_sub - v_disc, v_tax,
    0, v_total,
    case when v_collect or v_reg = 'composition' then v_supply end,
    v_store_state,
    case when v_collect then 'taxed' else 'not_collected' end,
    case when v_collect or v_reg = 'composition' then v_inter end,
    v_cgst, v_sgst, v_utgst, v_igst, v_reg
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
         (app.gst_components((e.value ->> 'taxable_paise')::bigint, (e.value ->> 'gst_rate_bps')::integer,
                             v_collect, v_inter, v_ut) ->> 'cgst')::bigint,
         (app.gst_components((e.value ->> 'taxable_paise')::bigint, (e.value ->> 'gst_rate_bps')::integer,
                             v_collect, v_inter, v_ut) ->> 'sgst')::bigint,
         (app.gst_components((e.value ->> 'taxable_paise')::bigint, (e.value ->> 'gst_rate_bps')::integer,
                             v_collect, v_inter, v_ut) ->> 'utgst')::bigint,
         (app.gst_components((e.value ->> 'taxable_paise')::bigint, (e.value ->> 'gst_rate_bps')::integer,
                             v_collect, v_inter, v_ut) ->> 'igst')::bigint
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

-- The order-level component check is validated once the 0058 backfill is settled (existing orders carry no
-- components yet and have supply_state_code null, so the check already passes for them).
alter table orders validate constraint orders_gst_components_check;
alter table order_items validate constraint order_items_gst_components_check;
