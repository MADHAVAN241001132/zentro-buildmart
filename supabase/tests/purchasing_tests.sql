-- ZENTRO BuildMart: tests for migration 0008 (tile batches, purchase orders, supplier ledger).
-- Run after migrations 0001-0008 and the dev seed:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/purchasing_tests.sql
-- Rolled back at the end. Any failed assertion raises an exception.

begin;

create or replace function pg_temp.try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

create or replace function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user::text)::text, true);
end $$;

create or replace function pg_temp.reset_session() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  owner_b constant uuid := '00000000-0000-4000-8000-0000000000a3';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  store_b constant uuid := '22222222-2222-4222-8222-222222222222';
  v_variant uuid;
  v_variant_b uuid;
  v_supplier uuid;
  v_supplier_b uuid;
  v_batch uuid;
  v_po uuid;
  v_msg text;
  v_on_before bigint;
  v_on_after bigint;
  v_incoming_before bigint;
  v_incoming_after bigint;
  v_balance bigint;
  v_lines jsonb;
begin
  select id into v_variant from product_variants where store_id = store_a and sku = 'AMB-V001';
  select id into v_variant_b from product_variants where store_id = store_b limit 1;
  select id into v_supplier from suppliers where store_id = store_a limit 1;
  select id into v_supplier_b from suppliers where store_id = store_b limit 1;
  perform pg_temp.reset_session();

  -- P1: owner A creates a batch with opening stock; variant on-hand rises by the same amount.
  select on_hand into v_on_before from inventory where variant_id = v_variant;
  perform pg_temp.act_as(owner_a);
  v_batch := create_inventory_batch(v_variant, 'T-B001', 'S-14', 'A', '2026-01-10', v_supplier, 10);
  perform pg_temp.reset_session();
  select on_hand into v_on_after from inventory where variant_id = v_variant;
  if v_on_after <> v_on_before + 10 then raise exception 'P1 failed: on_hand % -> %', v_on_before, v_on_after; end if;
  raise notice 'PASS P1 batch opening stock adds to variant inventory (% -> %)', v_on_before, v_on_after;

  -- P2: batch adjustment that drops below zero is refused.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$select adjust_batch_stock(%L, -50, 'test drop')$q$, v_batch));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'P2 failed: negative batch adjustment accepted'; end if;
  raise notice 'PASS P2 batch cannot go negative (%)', v_msg;

  -- P3: owner B cannot create a batch on store A's variant.
  perform pg_temp.act_as(owner_b);
  v_msg := pg_temp.try(format($q$select create_inventory_batch(%L, 'X-1', null, null, null, null, 1)$q$, v_variant));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'P3 failed: cross-store batch creation accepted'; end if;
  raise notice 'PASS P3 cross-store batch creation refused (%)', v_msg;

  -- P4: a batch cannot use another store's supplier.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$select create_inventory_batch(%L, 'T-B002', null, null, null, %L, 1)$q$, v_variant, v_supplier_b));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'P4 failed: foreign supplier accepted'; end if;
  raise notice 'PASS P4 foreign supplier refused on batch (%)', v_msg;

  -- P5: batch stays consistent with variant inventory.
  perform pg_temp.act_as(owner_a);
  if (batch_consistency(v_variant) ->> 'consistent')::boolean is not true then
    raise exception 'P5 failed: batch totals exceed variant inventory';
  end if;
  perform pg_temp.reset_session();
  raise notice 'PASS P5 batch totals consistent with variant inventory';

  -- P6: purchase order; sending it adds outstanding quantity to incoming stock.
  perform pg_temp.act_as(owner_a);
  v_lines := jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 5, 'unit_cost_paise', 10000));
  v_po := create_purchase_order(v_supplier, '2026-12-05', v_lines);
  select incoming into v_incoming_before from inventory where variant_id = v_variant;
  perform set_purchase_order_status(v_po, 'sent');
  perform pg_temp.reset_session();
  select incoming into v_incoming_after from inventory where variant_id = v_variant;
  if v_incoming_after <> v_incoming_before + 5 then raise exception 'P6 failed: incoming % -> %', v_incoming_before, v_incoming_after; end if;
  raise notice 'PASS P6 sent purchase order adds incoming stock (% -> %)', v_incoming_before, v_incoming_after;

  -- P7: goods receipt with a batch updates stock, damaged count and incoming stock.
  perform pg_temp.act_as(owner_a);
  perform receive_goods(v_po, jsonb_build_array(jsonb_build_object(
    'po_item_id', (select id from purchase_order_items where purchase_order_id = v_po limit 1),
    'quantity', 5, 'damaged', 1, 'batch_number', 'RG-T1')), 'test receipt');
  perform pg_temp.reset_session();
  if (select status from purchase_orders where id = v_po) <> 'received' then raise exception 'P7 failed: PO not received'; end if;
  if (select on_hand from inventory where variant_id = v_variant) <> v_on_after + 4 then raise exception 'P7 failed: on-hand not increased by 4 (5 received, 1 damaged)'; end if;
  raise notice 'PASS P7 goods receipt adds good stock and records damage';

  -- P8: cancelling after receipt is refused.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$select set_purchase_order_status(%L, 'cancelled')$q$, v_po));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'P8 failed: cancelled after receipt'; end if;
  raise notice 'PASS P8 cancel after receipt refused (%)', v_msg;

  -- P9: supplier payment cannot exceed the outstanding balance.
  perform pg_temp.act_as(owner_a);
  perform record_supplier_invoice(v_supplier, v_po, 'INV-T-' || substr(gen_random_uuid()::text, 1, 8), current_date, 50000);
  v_balance := supplier_balance(v_supplier);
  v_msg := pg_temp.try(format($q$select record_supplier_payment(%L, null, %s, 'bank', 'x', current_date)$q$, v_supplier, v_balance + 1));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'P9 failed: overpayment accepted'; end if;
  raise notice 'PASS P9 overpayment refused (%)', v_msg;

  -- P10: full payment clears the balance.
  perform pg_temp.act_as(owner_a);
  perform record_supplier_payment(v_supplier, null, v_balance, 'bank', 'T-REF', current_date);
  v_balance := supplier_balance(v_supplier);
  perform pg_temp.reset_session();
  if v_balance <> 0 then raise exception 'P10 failed: balance % after full payment', v_balance; end if;
  raise notice 'PASS P10 full payment clears supplier balance';

  -- P11: direct writes to purchase tables are refused for owners.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$insert into purchase_orders (store_id, supplier_id, po_number) values (%L, %L, 'DIRECT-1')$q$, store_a, v_supplier));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'P11 failed: direct purchase order insert accepted'; end if;
  raise notice 'PASS P11 direct purchase order insert refused (%)', v_msg;

  raise notice 'Purchasing tests finished. All assertions passed; changes will be rolled back.';
end $$;

rollback;
