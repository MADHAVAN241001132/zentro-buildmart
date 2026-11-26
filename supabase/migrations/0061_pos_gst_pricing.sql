-- 0061: POS GST pricing (GST Priority 2, POS integration).
-- The POS bill is priced by the same policy as Guest checkout (migration 0060):
--   * coupon and line discounts are calculated on the gross customer-paid amounts first;
--   * the line's taxable value and tax are then calculated from what remains (app.line_amounts, app.gst_split);
--   * the order ledger stays tax-exclusive: subtotal - discount + tax = total.
-- Place of supply for POS: an in-store sale or pickup is supplied from the store's own state; a delivery is supplied
-- at the delivery state recorded on the bill. The billing state is not used to decide GST treatment.
-- The server computes every figure. The bill carries no client-supplied tax amounts.
-- Released migrations 0001-0060 are not modified.

alter table pos_bills
  add column if not exists fulfilment_mode text not null default 'in_store' check (fulfilment_mode in ('in_store', 'delivery')),
  add column if not exists delivery_state_code text references gst_state_codes(code),
  add column if not exists buyer_gstin text;

alter table pos_bills drop constraint if exists pos_bills_delivery_state_check;
alter table pos_bills add constraint pos_bills_delivery_state_check
  check (fulfilment_mode = 'in_store' or delivery_state_code is not null);

alter table orders
  add column if not exists customer_gstin text check (customer_gstin is null or length(customer_gstin) = 15);

-- Staff set the fulfilment and tax details on a held bill. Re-pricing is explicit: the returned quote shows the
-- figures that placement will use.
create or replace function pos_set_tax_details(
  p_bill uuid, p_fulfilment text, p_delivery_state text, p_buyer_gstin text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_gstin text := nullif(upper(btrim(coalesce(p_buyer_gstin, ''))), '');
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_bill.store_id, array['owner','manager']);
  if v_bill.status <> 'HELD' then
    raise exception 'tax details can only be changed on a held bill' using errcode = 'P0001';
  end if;
  if p_fulfilment not in ('in_store', 'delivery') then
    raise exception 'choose in-store sale or delivery' using errcode = 'P0001';
  end if;
  if p_fulfilment = 'delivery' and nullif(btrim(coalesce(p_delivery_state, '')), '') is null then
    raise exception 'place of supply: choose the delivery state' using errcode = 'P0001';
  end if;
  if v_gstin is not null and app.gstin_problem(v_gstin) is not null then
    raise exception 'buyer GSTIN is not in the correct format: %', app.gstin_problem(v_gstin) using errcode = 'P0001';
  end if;
  update pos_bills set
      fulfilment_mode = p_fulfilment,
      delivery_state_code = case when p_fulfilment = 'delivery' then btrim(p_delivery_state) end,
      buyer_gstin = v_gstin,
      updated_at = now()
  where id = p_bill;
  return app.price_pos_bill(p_bill);
end $$;

-- The POS quote. Same shape as before (lines, totals, coupon fields) plus the GST policy fields.
create or replace function app.price_pos_bill(p_bill uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_store stores%rowtype;
  v_mode text;
  v_collect boolean;
  v_incl boolean;
  v_ut boolean := false;
  v_supply text;
  v_inter boolean := false;
  v_coupon coupons%rowtype;
  v_coupon_code text;
  v_item record;
  v_meta jsonb := '[]'::jsonb;
  v_gross bigint[] := '{}';
  v_disc bigint[] := '{}';
  v_pre bigint[] := '{}';
  v_gst integer[] := '{}';
  v_alloc bigint[] := '{}';
  v_count integer := 0;
  v_gross_i bigint;
  v_pre_i bigint;
  v_s bigint := 0;
  v_gross_sub bigint := 0;
  v_coupon_d bigint := 0;
  v_alloc_sum bigint := 0;
  v_rem bigint;
  v_i integer;
  v_before bigint; v_post bigint; v_am jsonb; v_split jsonb;
  v_taxable_after bigint; v_tax_i bigint; v_ledger_disc bigint;
  v_lines jsonb := '[]'::jsonb;
  v_sub bigint := 0;
  v_taxable bigint := 0;
  v_tax_total bigint := 0;
  v_disc_total bigint := 0;
  v_total_total bigint := 0;
  v_cgst bigint := 0; v_sgst bigint := 0; v_utgst bigint := 0; v_igst bigint := 0;
  v_line_disc_total bigint := 0;
begin
  select * into v_bill from pos_bills where id = p_bill;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  select * into v_store from stores where id = v_bill.store_id;

  -- Tax policy: the same rules as Guest checkout.
  v_mode := app.store_gst_mode(v_bill.store_id);
  if v_mode = 'invalid_profile' then
    raise exception 'gst_profile_incomplete: this showroom''s GST details are incomplete; POS billing is unavailable'
      using errcode = 'P0001';
  end if;
  v_collect := v_mode = 'taxed';
  v_incl := coalesce(v_store.prices_include_gst, false) and v_collect;
  select r.tax_regime = 'ut' into v_ut from gst_state_codes r where r.code = v_store.state_code;
  v_ut := coalesce(v_ut, false);

  -- Place of supply: in-store and pickup are supplied from the store's state; a delivery is supplied at its state.
  if v_bill.fulfilment_mode = 'delivery' then
    v_supply := v_bill.delivery_state_code;
    if v_supply is null then
      raise exception 'place of supply: choose the delivery state before placing this bill' using errcode = 'P0001';
    end if;
  else
    v_supply := v_store.state_code;
  end if;
  if v_collect or v_store.gst_registration = 'composition' then
    if v_supply is null then
      raise exception 'place of supply could not be determined for this showroom' using errcode = 'P0001';
    end if;
    v_inter := v_supply <> v_store.state_code;
    if v_store.gst_registration = 'composition' and v_inter then
      raise exception 'gst_composition_interstate: a composition showroom cannot make outward interstate supplies'
        using errcode = 'P0001';
    end if;
  end if;
  if v_bill.buyer_gstin is not null and app.gstin_problem(v_bill.buyer_gstin) is not null then
    raise exception 'buyer GSTIN is not in the correct format' using errcode = 'P0001';
  end if;

  for v_item in
    select pi.variant_id, pi.quantity, pi.line_discount_paise,
           pv.sku, pv.label, pv.sale_price_paise, pv.cost_price_paise, pv.is_active,
           pr.name as product_name, pr.hsn_code, pr.gst_rate_bps, pr.status as product_status
    from pos_bill_items pi
    join product_variants pv on pv.id = pi.variant_id
    join products pr on pr.id = pv.product_id
    where pi.bill_id = p_bill
    order by pi.sort_order, pv.sku
  loop
    v_count := v_count + 1;
    if not v_item.is_active or v_item.product_status <> 'active' then
      raise exception 'product % is no longer available for sale', v_item.sku using errcode = 'P0001';
    end if;
    v_gross_i := round(v_item.quantity * v_item.sale_price_paise)::bigint;
    if v_item.line_discount_paise > v_gross_i then
      raise exception 'discount on % is larger than the line amount', v_item.sku using errcode = 'P0001';
    end if;
    v_pre_i := v_gross_i - v_item.line_discount_paise;

    v_meta := v_meta || jsonb_build_object(
      'variant_id', v_item.variant_id,
      'sku', v_item.sku,
      'product_name', v_item.product_name,
      'variant_label', v_item.label,
      'hsn_code', v_item.hsn_code,
      'quantity', v_item.quantity,
      'stock_units', ceil(v_item.quantity)::bigint,
      'unit_price_paise', v_item.sale_price_paise,
      'cost_price_paise', v_item.cost_price_paise);
    v_gross := v_gross || v_gross_i;
    v_disc := v_disc || v_item.line_discount_paise;
    v_line_disc_total := v_line_disc_total + v_item.line_discount_paise;
    v_pre := v_pre || v_pre_i;
    v_gst := v_gst || v_item.gst_rate_bps::integer;
    v_s := v_s + v_pre_i;
    v_gross_sub := v_gross_sub + v_gross_i;
  end loop;

  -- Order coupon on the gross amount after line discounts, as before (the same basis Guest checkout uses).
  if v_bill.coupon_id is not null then
    select * into v_coupon from coupons where id = v_bill.coupon_id;
    if not found then raise exception 'the coupon on this bill no longer exists' using errcode = 'P0001'; end if;
    v_coupon_code := v_coupon.code;
    v_coupon_d := app.coupon_discount(v_coupon, v_s);
  end if;

  -- Largest-remainder allocation of the coupon across lines, proportional to each line's pre-coupon amount.
  for v_i in 1..v_count loop
    v_alloc := v_alloc || (case when v_coupon_d > 0 and v_s > 0
                                then floor(v_coupon_d::numeric * v_pre[v_i] / v_s)::bigint
                                else 0 end);
    v_alloc_sum := v_alloc_sum + v_alloc[v_i];
  end loop;
  v_rem := v_coupon_d - v_alloc_sum;
  for v_i in 1..v_count loop
    exit when v_rem <= 0;
    if v_pre[v_i] - v_alloc[v_i] > 0 then
      v_alloc[v_i] := v_alloc[v_i] + 1;
      v_rem := v_rem - 1;
    end if;
  end loop;
  if v_rem <> 0 then raise exception 'the coupon could not be allocated to the lines' using errcode = 'P0001'; end if;

  for v_i in 1..v_count loop
    v_post := v_pre[v_i] - v_alloc[v_i];
    v_before := (app.line_amounts(v_gross[v_i], v_gst[v_i], v_incl, v_collect) ->> 'taxable')::bigint;
    v_am := app.line_amounts(v_post, v_gst[v_i], v_incl, v_collect);
    v_taxable_after := (v_am ->> 'taxable')::bigint;
    v_tax_i := (v_am ->> 'tax')::bigint;
    v_ledger_disc := v_before - v_taxable_after;
    v_split := app.gst_split(v_taxable_after, v_tax_i, v_gst[v_i], v_collect, v_inter, v_ut);

    v_sub := v_sub + v_before;
    v_disc_total := v_disc_total + v_ledger_disc;
    v_taxable := v_taxable + v_taxable_after;
    v_tax_total := v_tax_total + v_tax_i;
    v_total_total := v_total_total + (v_am ->> 'total')::bigint;
    v_cgst := v_cgst + (v_split ->> 'cgst')::bigint;
    v_sgst := v_sgst + (v_split ->> 'sgst')::bigint;
    v_utgst := v_utgst + (v_split ->> 'utgst')::bigint;
    v_igst := v_igst + (v_split ->> 'igst')::bigint;

    v_lines := v_lines || ((v_meta -> (v_i - 1)) || jsonb_build_object(
      'gross_paise', v_gross[v_i],
      'discount_paise', v_ledger_disc,
      'coupon_discount_paise', v_alloc[v_i],
      'gross_discount_paise', v_disc[v_i] + v_alloc[v_i],
      'gst_rate_bps', v_gst[v_i],
      'taxable_paise', v_taxable_after,
      'tax_paise', v_tax_i,
      'line_total_paise', (v_am ->> 'total')::bigint,
      'cgst_paise', (v_split ->> 'cgst')::bigint,
      'sgst_paise', (v_split ->> 'sgst')::bigint,
      'utgst_paise', (v_split ->> 'utgst')::bigint,
      'igst_paise', (v_split ->> 'igst')::bigint));
  end loop;

  return jsonb_build_object(
    'lines', v_lines,
    'line_count', v_count,
    'subtotal_paise', v_sub,
    'discount_paise', v_disc_total,
    'gross_subtotal_paise', v_gross_sub,
    'gross_discount_paise', v_line_disc_total + v_coupon_d,
    'coupon_discount_paise', v_coupon_d,
    'coupon_code', v_coupon_code,
    'taxable_paise', v_taxable,
    'tax_paise', v_tax_total,
    'total_paise', v_total_total,
    'tax_mode', case when v_collect then 'taxed' else 'not_collected' end,
    'pricing_mode', case when not v_collect then 'not_collected' when v_incl then 'inclusive' else 'exclusive' end,
    'is_interstate', case when v_collect or v_store.gst_registration = 'composition' then v_inter end,
    'supply_state_code', case when v_collect or v_store.gst_registration = 'composition' then v_supply end,
    'store_state_code', v_store.state_code,
    'gst_registration', v_store.gst_registration,
    'cgst_paise', v_cgst, 'sgst_paise', v_sgst, 'utgst_paise', v_utgst, 'igst_paise', v_igst);
end $$;

-- Pricing guard. Inclusive taxed orders may now come from two paths: the Guest checkout (0060) and the integrated
-- POS placement below, which sets app.pos_gst_path for its own transaction only. Quotation conversion is not integrated
-- yet, so any inclusive taxed order that carries a quotation_id is refused. Other direct inserts are refused.
create or replace function app.guard_pricing_mode()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_inclusive boolean;
begin
  if new.tax_mode <> 'taxed' then return new; end if;
  select s.prices_include_gst into v_inclusive from stores s where s.id = new.store_id;
  if not coalesce(v_inclusive, false) then return new; end if;
  if new.quotation_id is not null then
    raise exception 'pricing_mode_unsupported: tax-inclusive quotations are not yet available'
      using errcode = 'P0001';
  end if;
  if new.channel = 'online' and new.guest_session_id is not null then return new; end if;
  if new.channel = 'pos' and coalesce(current_setting('app.pos_gst_path', true), '') = 'on' then return new; end if;
  raise exception 'pricing_mode_unsupported: tax-inclusive pricing is not available for this sales channel'
    using errcode = 'P0001';
end $$;

-- POS placement, extended from 0010 with GST: the quote carries the tax policy; the order stores the tax snapshot,
-- place of supply, components and gross columns. The ledger totals are unchanged in meaning (tax-exclusive).
create or replace function pos_place_bill(
  p_bill uuid, p_actor uuid, p_method text, p_provider_order_id text default null, p_expires_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_quote jsonb;
  v_line jsonb;
  v_order uuid;
  v_number text;
  v_prefix text;
  v_total bigint;
  v_cust_name text := 'Walk-in customer';
  v_cust_mobile text;
  v_cust_email text;
  v_invoice text;
  v_due date := current_date + 30;
  v_fulfilment text;
begin
  if not app.is_server() then raise exception 'POS placement is server-only' using errcode = '42501'; end if;
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from store_owners so
    where so.store_id = v_bill.store_id and so.profile_id = p_actor and so.is_active and so.role in ('owner','manager')
  ) then
    raise exception 'actor is not a member of this store' using errcode = '42501';
  end if;

  if v_bill.status in ('COMPLETED','AWAITING_PAYMENT') then
    return jsonb_build_object('order_id', v_bill.order_id, 'replayed', true, 'status', v_bill.status);
  end if;
  if v_bill.status <> 'HELD' then raise exception 'bill is %, it cannot be placed', v_bill.status using errcode = 'P0001'; end if;
  if p_method not in ('cash','online','credit') then raise exception 'unknown payment method' using errcode = 'P0001'; end if;
  if p_method = 'online' and coalesce(p_provider_order_id, '') = '' then
    raise exception 'an online payment needs a gateway order' using errcode = 'P0001';
  end if;
  if p_method = 'credit' and v_bill.customer_id is null then
    raise exception 'credit sales need a customer' using errcode = 'P0001';
  end if;

  v_quote := app.price_pos_bill(p_bill);
  if (v_quote ->> 'line_count')::integer = 0 then raise exception 'the bill has no items' using errcode = 'P0001'; end if;
  v_total := (v_quote ->> 'total_paise')::bigint;
  v_fulfilment := case when v_bill.fulfilment_mode = 'delivery' then 'delivery' else 'pickup' end;

  if v_bill.customer_id is not null then
    select full_name, mobile, email into v_cust_name, v_cust_mobile, v_cust_email from customers where id = v_bill.customer_id;
  end if;
  select order_prefix, invoice_prefix into v_prefix, v_invoice from store_settings where store_id = v_bill.store_id;
  v_number := app.next_number(v_bill.store_id, 'order', v_prefix);

  -- Server-owned marker, transaction-local: lets the pricing guard admit this integrated POS path only.
  perform set_config('app.pos_gst_path', 'on', true);

  insert into orders (store_id, order_number, channel, customer_id, customer_name, customer_mobile, customer_email,
                      fulfilment, payment_method, payment_status, order_status,
                      subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise,
                      supply_state_code, store_state_code, tax_mode, is_interstate,
                      cgst_paise, sgst_paise, utgst_paise, igst_paise, gst_registration_snapshot,
                      gross_subtotal_paise, gross_discount_paise, customer_gstin)
  values (v_bill.store_id, v_number, 'pos', v_bill.customer_id,
          v_cust_name, v_cust_mobile, v_cust_email,
          v_fulfilment, p_method, 'PENDING', 'PLACED',
          (v_quote ->> 'subtotal_paise')::bigint, (v_quote ->> 'discount_paise')::bigint,
          (v_quote ->> 'taxable_paise')::bigint, (v_quote ->> 'tax_paise')::bigint, 0, v_total,
          v_quote ->> 'supply_state_code', v_quote ->> 'store_state_code', v_quote ->> 'tax_mode',
          (v_quote ->> 'is_interstate')::boolean,
          (v_quote ->> 'cgst_paise')::bigint, (v_quote ->> 'sgst_paise')::bigint,
          (v_quote ->> 'utgst_paise')::bigint, (v_quote ->> 'igst_paise')::bigint,
          v_quote ->> 'gst_registration',
          (v_quote ->> 'gross_subtotal_paise')::bigint, (v_quote ->> 'gross_discount_paise')::bigint,
          v_bill.buyer_gstin)
  returning id into v_order;
  -- Clear the marker straight after the insert it admits, so it cannot carry into later statements in this transaction.
  perform set_config('app.pos_gst_path', '', true);

  for v_line in select * from jsonb_array_elements(v_quote -> 'lines') loop
    insert into order_items (order_id, store_id, variant_id, product_name_snapshot, variant_label_snapshot, sku_snapshot,
                             hsn_code_snapshot, quantity, stock_units, cost_price_paise_snapshot, unit_price_paise,
                             discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise,
                             cgst_paise, sgst_paise, utgst_paise, igst_paise)
    values (v_order, v_bill.store_id, (v_line ->> 'variant_id')::uuid, v_line ->> 'product_name', v_line ->> 'variant_label',
            v_line ->> 'sku', v_line ->> 'hsn_code', (v_line ->> 'quantity')::numeric, (v_line ->> 'stock_units')::bigint,
            (v_line ->> 'cost_price_paise')::bigint, (v_line ->> 'unit_price_paise')::bigint,
            (v_line ->> 'discount_paise')::bigint, (v_line ->> 'gst_rate_bps')::integer,
            (v_line ->> 'taxable_paise')::bigint, (v_line ->> 'tax_paise')::bigint, (v_line ->> 'line_total_paise')::bigint,
            (v_line ->> 'cgst_paise')::bigint, (v_line ->> 'sgst_paise')::bigint,
            (v_line ->> 'utgst_paise')::bigint, (v_line ->> 'igst_paise')::bigint);
  end loop;

  -- Stock is reserved first; a shortfall aborts the whole bill, leaving it held.
  perform reserve_order_stock(v_order);

  if p_method = 'cash' then
    perform create_payment_attempt(v_order, 'cash', 'cash', 'cash_' || v_order::text, v_total, null, null);
    perform confirm_cash_payment(v_order, v_total, 'POS cash sale', p_actor);
  elsif p_method = 'online' then
    perform create_payment_attempt(v_order, 'online', 'razorpay', p_provider_order_id, v_total,
      coalesce(p_expires_at, now() + interval '15 minutes'), null);
  else
    perform record_credit_entry(v_bill.customer_id, 'sale', v_total, v_due, 'POS credit sale ' || v_number);
    perform consume_order_stock(v_order);
    perform app.set_order_status(v_order, 'CONFIRMED', 'POS credit sale');
  end if;

  -- Cash and credit sales are complete now and get an invoice. Online sales get one once payment settles.
  if p_method <> 'online' then
    insert into invoices (store_id, order_id, invoice_number, invoice_date, taxable_paise, tax_paise, total_paise)
    values (v_bill.store_id, v_order, app.next_number(v_bill.store_id, 'invoice', coalesce(v_invoice, 'INV')),
            current_date, (v_quote ->> 'taxable_paise')::bigint, (v_quote ->> 'tax_paise')::bigint, v_total);
  end if;

  update pos_bills set
      status = case when p_method = 'online' then 'AWAITING_PAYMENT' else 'COMPLETED' end,
      order_id = v_order,
      completed_by = p_actor,
      completed_at = case when p_method = 'online' then null else now() end,
      updated_at = now()
  where id = p_bill;

  perform app.audit(v_bill.store_id, 'pos.placed', 'orders', v_order, null,
    jsonb_build_object('bill', v_bill.bill_reference, 'method', p_method, 'total_paise', v_total));
  return jsonb_build_object('order_id', v_order, 'order_number', v_number, 'total_paise', v_total,
                            'method', p_method, 'replayed', false, 'status', case when p_method = 'online' then 'AWAITING_PAYMENT' else 'COMPLETED' end);
end $$;
