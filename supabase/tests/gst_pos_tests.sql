-- POS GST tests (migration 0061). Exact paise values match the Guest expectations in gst_pricing_mode_tests.sql
-- and tests/pricing-inclusive.test.ts. Rolled back at the end.
begin;

create or replace function pg_temp.sqlstate_of(p_sql text) returns text
language plpgsql as $$
declare v_code text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text;
  return v_code || ': ' || v_msg;
end $$;

create or replace function pg_temp.expect(p_label text, p_actual bigint, p_expected bigint) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '% FAILED: got %, expected %', p_label, p_actual, p_expected;
  end if;
end $$;

create or replace function pg_temp.new_bill(p_store uuid, p_owner uuid, p_var uuid) returns uuid
language plpgsql as $$
declare v_bill uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_owner::text)::text, true);
  execute 'set local role authenticated';
  v_bill := pos_save_bill(null, p_store, null,
    jsonb_build_array(jsonb_build_object('variant_id', p_var, 'quantity', 1, 'line_discount_paise', 0)), 'gst test');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_bill;
end $$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_var uuid; v_product uuid;
  v_bill uuid; v_res jsonb; v_order uuid; v_q jsonb; v_state text;
  v_o orders%rowtype;
  v_inv invoices%rowtype;
  v_coupon_id uuid;
begin
  -- Test setup, rolled back: a known price and rate for one variant, and store profile switches.
  alter table stores disable trigger stores_guard_legal_profile;
  select pv.id, pv.product_id into v_var, v_product from product_variants pv where pv.sku = 'AMB-V001';
  update product_variants set sale_price_paise = 118000 where id = v_var;
  update products set gst_rate_bps = 1800 where id = v_product;
  update inventory set on_hand = 50, reserved = 0 where variant_id = v_var;
  update stores set gst_registration = 'regular', state_code = '33', prices_include_gst = true,
                    gstin = '33AAAAA1234A1ZV'
    where id = store_a;

  -- POS-A: inclusive 1,180 in store, cash. Taxable 1,000, GST 180 (CGST 90, SGST 90), payable 1,180.
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  select * into v_o from orders where id = (v_res ->> 'order_id')::uuid;
  perform pg_temp.expect('POS-A total', v_o.total_paise, 118000);
  perform pg_temp.expect('POS-A taxable', v_o.taxable_paise, 100000);
  perform pg_temp.expect('POS-A tax', v_o.tax_paise, 18000);
  perform pg_temp.expect('POS-A subtotal', v_o.subtotal_paise, 100000);
  perform pg_temp.expect('POS-A discount', v_o.discount_paise, 0);
  perform pg_temp.expect('POS-A cgst', v_o.cgst_paise, 9000);
  perform pg_temp.expect('POS-A sgst', v_o.sgst_paise, 9000);
  perform pg_temp.expect('POS-A igst', v_o.igst_paise, 0);
  if v_o.is_interstate or v_o.tax_mode <> 'taxed' or v_o.supply_state_code <> '33' then
    raise exception 'POS-A FAILED: place of supply or tax mode wrong';
  end if;
  select * into v_inv from invoices where order_id = v_o.id;
  perform pg_temp.expect('POS-A invoice total', v_inv.total_paise, 118000);
  perform pg_temp.expect('POS-A invoice tax', v_inv.tax_paise, 18000);
  raise notice 'POS-A ok: inclusive 1180 -> taxable 1000, tax 180, payable 1180';

  -- POS-B: exclusive 1,180 in store, cash. GST 212.40, payable 1,392.40.
  update stores set prices_include_gst = false where id = store_a;
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  select * into v_o from orders where id = (v_res ->> 'order_id')::uuid;
  perform pg_temp.expect('POS-B taxable', v_o.taxable_paise, 118000);
  perform pg_temp.expect('POS-B tax', v_o.tax_paise, 21240);
  perform pg_temp.expect('POS-B total', v_o.total_paise, 139240);
  perform pg_temp.expect('POS-B cgst', v_o.cgst_paise, 10620);
  raise notice 'POS-B ok: exclusive 1180 -> tax 212.40, payable 1392.40';

  -- POS-C: inclusive 1,180 with 10% coupon. Taxable 900, GST 162, payable 1,062.
  update stores set prices_include_gst = true where id = store_a;
  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, is_active)
  values (store_a, 'POSGST10', 'percent', 1000, 0, true) returning id into v_coupon_id;
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', owner_a::text)::text, true);
  execute 'set local role authenticated';
  perform pos_set_coupon(v_bill, 'POSGST10');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  select * into v_o from orders where id = (v_res ->> 'order_id')::uuid;
  perform pg_temp.expect('POS-C total', v_o.total_paise, 106200);
  perform pg_temp.expect('POS-C taxable', v_o.taxable_paise, 90000);
  perform pg_temp.expect('POS-C tax', v_o.tax_paise, 16200);
  perform pg_temp.expect('POS-C ledger discount', v_o.discount_paise, 10000);
  perform pg_temp.expect('POS-C gross discount (coupon basis)', v_o.gross_discount_paise, 11800);
  perform pg_temp.expect('POS-C gross subtotal', v_o.gross_subtotal_paise, 118000);
  perform pg_temp.expect('POS-C redemption on gross basis',
    (select discount_paise from coupon_redemptions where order_id = v_o.id), 11800);
  raise notice 'POS-C ok: inclusive 1180 with 10%% coupon -> taxable 900, tax 162, payable 1062';

  -- POS-D: a store that does not collect GST. No tax, payable 1,180.
  update stores set gst_registration = 'unregistered' where id = store_a;
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  select * into v_o from orders where id = (v_res ->> 'order_id')::uuid;
  perform pg_temp.expect('POS-D total', v_o.total_paise, 118000);
  perform pg_temp.expect('POS-D tax', v_o.tax_paise, 0);
  perform pg_temp.expect('POS-D cgst', v_o.cgst_paise, 0);
  if v_o.tax_mode <> 'not_collected' then raise exception 'POS-D FAILED: tax mode %', v_o.tax_mode; end if;
  raise notice 'POS-D ok: non-collecting store -> GST 0, payable 1180';
  update stores set gst_registration = 'regular' where id = store_a;

  -- POS-E: inclusive delivery to Karnataka (29): interstate, so IGST 180 only.
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', owner_a::text)::text, true);
  execute 'set local role authenticated';
  perform pos_set_tax_details(v_bill, 'delivery', '29', null);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  select * into v_o from orders where id = (v_res ->> 'order_id')::uuid;
  perform pg_temp.expect('POS-E igst', v_o.igst_paise, 18000);
  perform pg_temp.expect('POS-E cgst', v_o.cgst_paise, 0);
  perform pg_temp.expect('POS-E tax', v_o.tax_paise, 18000);
  if not v_o.is_interstate or v_o.supply_state_code <> '29' or v_o.fulfilment <> 'delivery' then
    raise exception 'POS-E FAILED: interstate delivery not recorded';
  end if;
  raise notice 'POS-E ok: interstate delivery -> IGST 180';

  -- POS-F: union territory intrastate (store in UT Chandigarh 04): UTGST replaces SGST.
  update stores set state_code = '04', gstin = '04AAAAA1234A1ZW' where id = store_a;
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  select * into v_o from orders where id = (v_res ->> 'order_id')::uuid;
  perform pg_temp.expect('POS-F utgst', v_o.utgst_paise, 9000);
  perform pg_temp.expect('POS-F sgst', v_o.sgst_paise, 0);
  perform pg_temp.expect('POS-F cgst', v_o.cgst_paise, 9000);
  update stores set state_code = '33', gstin = '33AAAAA1234A1ZV' where id = store_a;
  raise notice 'POS-F ok: UT intrastate -> CGST 90 + UTGST 90';

  -- POS-G: a composition store cannot make an outward interstate supply.
  update stores set gst_registration = 'composition' where id = store_a;
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  -- The setter refuses at save time (it prices the bill), so nothing is stored.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', owner_a::text)::text, true);
  execute 'set local role authenticated';
  v_state := pg_temp.sqlstate_of(format('select pos_set_tax_details(%L, %L, %L, null)', v_bill, 'delivery', '29'));
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_state not like 'P0001: gst_composition_interstate%' then raise exception 'POS-G1 FAILED: %', v_state; end if;
  -- The pricer refuses independently, for a bill whose delivery state was written without the setter.
  update pos_bills set fulfilment_mode = 'delivery', delivery_state_code = '29' where id = v_bill;
  v_state := pg_temp.sqlstate_of(format('select app.price_pos_bill(%L)', v_bill));
  if v_state not like 'P0001: gst_composition_interstate%' then raise exception 'POS-G2 FAILED: %', v_state; end if;
  update stores set gst_registration = 'regular', gstin = '33AAAAA1234A1ZV' where id = store_a;
  raise notice 'POS-G ok: composition interstate delivery refused';

  -- POS-H: a regular store with no valid GSTIN is refused (invalid profile), and nothing is placed.
  update stores set gstin = null where id = store_a;
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  v_state := pg_temp.sqlstate_of(format('select pos_place_bill(%L, %L, %L, null, null)', v_bill, owner_a, 'cash'));
  if v_state not like 'P0001: gst_profile_incomplete%' then raise exception 'POS-H FAILED: %', v_state; end if;
  if (select status from pos_bills where id = v_bill) <> 'HELD' then raise exception 'POS-H FAILED: bill not held'; end if;
  update stores set gstin = '33AAAAA1234A1ZV' where id = store_a;
  raise notice 'POS-H ok: invalid GST profile refused, bill left held';

  -- POS-I: delivery without a delivery state, and a malformed buyer GSTIN, are refused at setting time.
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', owner_a::text)::text, true);
  execute 'set local role authenticated';
  v_state := pg_temp.sqlstate_of(format('select pos_set_tax_details(%L, %L, %L, null)', v_bill, 'delivery', null));
  if v_state not like 'P0001: place of supply%' then raise exception 'POS-I1 FAILED: %', v_state; end if;
  v_state := pg_temp.sqlstate_of(format('select pos_set_tax_details(%L, %L, %L, %L)', v_bill, 'in_store', null, 'BADGSTIN'));
  if v_state not like 'P0001: buyer GSTIN%' then raise exception 'POS-I2 FAILED: %', v_state; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'POS-I ok: missing delivery state and malformed buyer GSTIN refused';

  -- POS-J: the guard refuses direct inserts. A POS-channel inclusive order without the placement marker is refused,
  -- and so is any inclusive taxed order that carries a quotation id (quotation conversion is not integrated yet).
  update stores set prices_include_gst = true where id = store_a;
  v_state := pg_temp.sqlstate_of(format(
    $f$insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise, tax_mode, is_interstate, supply_state_code, store_state_code)
       values (%L, 'POSDIRECT-1', 'pos', 'Direct test', 'pickup', 'cash', 100000, 0, 100000, 0, 0, 100000, 'taxed', false, '33', '33')$f$, store_a));
  if v_state not like 'P0001: pricing_mode_unsupported%' then raise exception 'POS-J1 FAILED: %', v_state; end if;
  v_state := pg_temp.sqlstate_of(format(
    $f$insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise, tax_mode, is_interstate, supply_state_code, store_state_code, quotation_id)
       values (%L, 'POSDIRECT-2', 'online', 'Direct test', 'pickup', 'cash', 100000, 0, 100000, 0, 0, 100000, 'taxed', false, '33', '33', gen_random_uuid())$f$, store_a));
  if v_state not like 'P0001: pricing_mode_unsupported%' then raise exception 'POS-J2 FAILED: %', v_state; end if;
  raise notice 'POS-J ok: direct inclusive inserts refused, including quotation-bearing orders';

  -- POS-K: held-bill repricing. A bill held while exclusive is priced at placement with the current setting.
  update stores set prices_include_gst = false where id = store_a;
  v_bill := pg_temp.new_bill(store_a, owner_a, v_var);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', owner_a::text)::text, true);
  execute 'set local role authenticated';
  v_q := pos_quote_bill(v_bill);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.expect('POS-K exclusive quote', (v_q ->> 'total_paise')::bigint, 139240);
  update stores set prices_include_gst = true where id = store_a;
  v_q := app.price_pos_bill(v_bill);
  perform pg_temp.expect('POS-K repriced after setting change', (v_q ->> 'total_paise')::bigint, 118000);
  raise notice 'POS-K ok: held bill repriced to the current setting';

  raise notice 'GST POS tests: all passed';
end $$;

rollback;
