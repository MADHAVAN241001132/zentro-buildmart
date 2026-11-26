-- ZENTRO BuildMart: tests for migration 0010 (POS held bills and placement).
-- Run after migrations 0001-0010 and the dev seed. Rolled back at the end.

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

create or replace function pg_temp.stock(p_variant uuid, out on_hand bigint, out reserved bigint)
language sql as $$
  select i.on_hand, i.reserved from inventory i where i.variant_id = p_variant
$$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  owner_b constant uuid := '00000000-0000-4000-8000-0000000000a3';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  store_b constant uuid := '22222222-2222-4222-8222-222222222222';
  v_var uuid;
  v_var_b uuid;
  v_price bigint;
  v_gst integer;
  v_cust uuid;
  v_bill1 uuid; v_bill2 uuid; v_bill3 uuid; v_bill4 uuid; v_bill5 uuid; v_bill6 uuid; v_bill7 uuid; v_bill8 uuid; v_bill9 uuid;
  v_quote jsonb;
  v_res jsonb;
  v_order uuid;
  v_on0 bigint; v_res0 bigint; v_on1 bigint; v_res1 bigint;
  v_count integer;
  v_status text;
  v_msg text;
  v_bal0 bigint; v_bal1 bigint;
  v_expected_total bigint;
  v_gross bigint;
  v_tax bigint;
  v_new_price bigint;
  v_orders0 integer;
begin
  select pv.id, pv.sale_price_paise, pr.gst_rate_bps into v_var, v_price, v_gst
  from product_variants pv join products pr on pr.id = pv.product_id
  where pv.sku = 'AMB-V001';
  select pv.id into v_var_b from product_variants pv where pv.store_id = store_b and pv.is_active limit 1;
  if v_var is null or v_var_b is null then raise exception 'POS tests need seeded variants AMB-V001 and a store B variant'; end if;

  -- Known starting stock for store A's variant (service-side setup, rolled back at the end).
  update inventory set on_hand = 50, reserved = 0 where variant_id = v_var;

  insert into customers (store_id, full_name, mobile, is_credit_approved, credit_limit_paise)
  values (store_a, 'POS Test Credit Customer', '9876500001', true, 10000000)
  returning id into v_cust;

  select count(*) into v_orders0 from orders where store_id = store_a;

  -- ----- P1: holding a bill moves no stock and creates no order.
  perform pg_temp.act_as(owner_a);
  v_bill1 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 2, 'line_discount_paise', 0)), 'hold one');
  perform pg_temp.reset_session();
  select on_hand, reserved into v_on1, v_res1 from pg_temp.stock(v_var);
  select count(*) into v_count from orders where store_id = store_a;
  if v_on1 <> 50 or v_res1 <> 0 then raise exception 'P1 FAILED: holding changed stock (on_hand %, reserved %)', v_on1, v_res1; end if;
  if v_count <> v_orders0 then raise exception 'P1 FAILED: holding created an order'; end if;
  select status into v_status from pos_bills where id = v_bill1;
  if v_status <> 'HELD' then raise exception 'P1 FAILED: status is %', v_status; end if;
  raise notice 'P1 ok: holding a bill leaves stock and orders unchanged';

  -- ----- P2: quote is computed from the database with GST applied.
  perform pg_temp.act_as(owner_a);
  v_quote := pos_quote_bill(v_bill1);
  perform pg_temp.reset_session();
  v_gross := 2 * v_price;
  v_tax := round((v_gross * v_gst / 10000.0))::bigint;
  v_expected_total := v_gross + v_tax;
  if (v_quote ->> 'total_paise')::bigint <> v_expected_total then
    raise exception 'P2 FAILED: quote total % expected %', v_quote ->> 'total_paise', v_expected_total;
  end if;
  raise notice 'P2 ok: quote total % with GST computed server-side', v_expected_total;

  -- ----- P3: an owner cannot save a bill for another store, nor use another store's variant.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select pos_save_bill(null, %L, null, %L::jsonb, null)', store_b,
    jsonb_build_array(jsonb_build_object('variant_id', v_var_b, 'quantity', 1))::text));
  perform pg_temp.reset_session();
  if left(v_msg, 5) <> '42501' then raise exception 'P3 FAILED: cross-store bill allowed (%)', v_msg; end if;
  raise notice 'P3 ok: cross-store save refused (%)', v_msg;

  -- ----- P4: pos_bills cannot be written directly by an authenticated user.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('insert into pos_bills (store_id, bill_reference) values (%L, %L)', store_a, 'DIRECT-1'));
  perform pg_temp.reset_session();
  if left(v_msg, 5) <> '42501' then raise exception 'P4 FAILED: direct insert allowed (%)', v_msg; end if;
  raise notice 'P4 ok: direct writes to pos_bills denied';

  -- ----- P5: placement is not callable by signed-in users.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select pos_place_bill(%L, %L, %L, null, null)', v_bill1, owner_a, 'cash'));
  perform pg_temp.reset_session();
  if left(v_msg, 5) <> '42501' then raise exception 'P5 FAILED: authenticated placement allowed (%)', v_msg; end if;
  raise notice 'P5 ok: placement denied to signed-in users';

  -- ----- P6: a cash placement creates a PAID POS order, consumes stock once and issues an invoice.
  perform pg_temp.reset_session();
  select on_hand, reserved into v_on0, v_res0 from pg_temp.stock(v_var);
  v_res := pos_place_bill(v_bill1, owner_a, 'cash', null, null);
  v_order := (v_res ->> 'order_id')::uuid;
  select on_hand, reserved into v_on1, v_res1 from pg_temp.stock(v_var);
  if v_on1 <> v_on0 - 2 or v_res1 <> v_res0 then
    raise exception 'P6 FAILED: stock after cash sale on_hand % (was %), reserved % (was %)', v_on1, v_on0, v_res1, v_res0;
  end if;
  if not exists (select 1 from orders where id = v_order and channel = 'pos' and payment_status = 'PAID'
                   and order_status = 'CONFIRMED' and total_paise = v_expected_total) then
    raise exception 'P6 FAILED: cash order not PAID/CONFIRMED with the quoted total';
  end if;
  if (select count(*) from invoices where order_id = v_order) <> 1 then raise exception 'P6 FAILED: no invoice issued'; end if;
  select status into v_status from pos_bills where id = v_bill1;
  if v_status <> 'COMPLETED' then raise exception 'P6 FAILED: bill status % after placement', v_status; end if;
  raise notice 'P6 ok: cash POS sale paid, stock consumed once, invoice issued';

  -- ----- P7: placing the same bill again is idempotent.
  v_res := pos_place_bill(v_bill1, owner_a, 'cash', null, null);
  select on_hand into v_on1 from pg_temp.stock(v_var);
  if (v_res ->> 'replayed')::boolean is not true then raise exception 'P7 FAILED: repeat placement not reported as replayed'; end if;
  if (select count(*) from orders where id = v_order) <> 1 or v_on1 <> v_on0 - 2 then
    raise exception 'P7 FAILED: repeat placement created an order or moved stock again';
  end if;
  raise notice 'P7 ok: repeat placement returns the existing order';

  -- ----- P8: prices are revalidated at placement, not taken from the earlier quote.
  perform pg_temp.act_as(owner_a);
  v_bill2 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)), 'price change');
  perform pg_temp.reset_session();
  v_new_price := v_price + 500;
  update product_variants set sale_price_paise = v_new_price where id = v_var;
  v_quote := pos_quote_bill(v_bill2);
  v_expected_total := v_new_price + round((v_new_price * v_gst / 10000.0))::bigint;
  if (v_quote ->> 'total_paise')::bigint <> v_expected_total then raise exception 'P8 FAILED: quote ignored the new price'; end if;
  v_res := pos_place_bill(v_bill2, owner_a, 'cash', null, null);
  if (v_res ->> 'total_paise')::bigint <> v_expected_total then raise exception 'P8 FAILED: placed total did not use the revalidated price'; end if;
  update product_variants set sale_price_paise = v_price where id = v_var;
  raise notice 'P8 ok: placement uses revalidated prices';

  -- ----- P9: cancelling a held bill works; cancelling a completed bill is refused.
  perform pg_temp.act_as(owner_a);
  v_bill3 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)), null);
  perform pos_cancel_bill(v_bill3, 'customer changed mind');
  v_msg := pg_temp.try(format('select pos_cancel_bill(%L, %L)', v_bill1, 'too late'));
  perform pg_temp.reset_session();
  select status into v_status from pos_bills where id = v_bill3;
  if v_status <> 'CANCELLED' then raise exception 'P9 FAILED: held bill not cancelled'; end if;
  if left(v_msg, 5) = 'ok' or v_msg = 'ok' then raise exception 'P9 FAILED: completed bill was cancelled'; end if;
  raise notice 'P9 ok: held bills cancel, completed bills do not';

  -- ----- P10: a stock shortfall aborts placement and leaves the bill held with no order.
  perform pg_temp.act_as(owner_a);
  v_bill4 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 999)), 'too many');
  perform pg_temp.reset_session();
  select on_hand, reserved into v_on0, v_res0 from pg_temp.stock(v_var);
  v_msg := pg_temp.try(format('select pos_place_bill(%L, %L, %L, null, null)', v_bill4, owner_a, 'cash'));
  select on_hand, reserved into v_on1, v_res1 from pg_temp.stock(v_var);
  select status into v_status from pos_bills where id = v_bill4;
  if left(v_msg, 5) = 'ok' or v_msg = 'ok' then raise exception 'P10 FAILED: oversold stock'; end if;
  if v_status <> 'HELD' or v_on1 <> v_on0 or v_res1 <> v_res0 then
    raise exception 'P10 FAILED: failed placement changed the bill or stock';
  end if;
  raise notice 'P10 ok: shortfall refused, bill remains held (%)', v_msg;

  -- ----- P11: credit placement needs an approved customer and records a ledger sale.
  perform pg_temp.act_as(owner_a);
  v_bill5 := pos_save_bill(null, store_a, v_cust,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)), null);
  v_bill6 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)), null);
  perform pg_temp.reset_session();
  v_bal0 := customer_balance(v_cust);
  v_msg := pg_temp.try(format('select pos_place_bill(%L, %L, %L, null, null)', v_bill6, owner_a, 'credit'));
  if left(v_msg, 5) = 'ok' or v_msg = 'ok' then raise exception 'P11 FAILED: credit sale without a customer allowed'; end if;
  v_res := pos_place_bill(v_bill5, owner_a, 'credit', null, null);
  v_bal1 := customer_balance(v_cust);
  if v_bal1 - v_bal0 <> (v_res ->> 'total_paise')::bigint then
    raise exception 'P11 FAILED: ledger balance rose by % not %', v_bal1 - v_bal0, v_res ->> 'total_paise';
  end if;
  raise notice 'P11 ok: credit sale recorded against the customer ledger';

  -- ----- P12: a placement actor must belong to the bill's store.
  perform pg_temp.act_as(owner_a);
  v_bill7 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)), null);
  perform pg_temp.reset_session();
  v_msg := pg_temp.try(format('select pos_place_bill(%L, %L, %L, null, null)', v_bill7, owner_b, 'cash'));
  if left(v_msg, 5) = 'ok' or v_msg = 'ok' then raise exception 'P12 FAILED: outsider placed a bill'; end if;
  raise notice 'P12 ok: non-member actor refused (%)', v_msg;

  -- ----- P13: an online bill waits for payment, has no invoice, and is not a sale yet.
  perform pg_temp.act_as(owner_a);
  v_bill8 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)), null);
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill8, owner_a, 'online', 'order_pos_test_' || replace(v_bill8::text, '-', ''), null);
  if (v_res ->> 'status') <> 'AWAITING_PAYMENT' then raise exception 'P13 FAILED: online bill status %', v_res ->> 'status'; end if;
  if (select count(*) from invoices where order_id = (v_res ->> 'order_id')::uuid) <> 0 then
    raise exception 'P13 FAILED: invoice issued before payment';
  end if;
  if pos_sync_bill(v_bill8) <> 'AWAITING_PAYMENT' then raise exception 'P13 FAILED: bill completed without payment'; end if;
  raise notice 'P13 ok: online bill waits for payment';

  -- P13b: once the payment is PAID, the bill completes and exactly one invoice is issued (idempotent on repeat).
  update payments set status = 'PAID', paid_at = now() where order_id = (v_res ->> 'order_id')::uuid;
  update orders set payment_status = 'PAID', paid_at = now() where id = (v_res ->> 'order_id')::uuid;
  if pos_sync_bill(v_bill8) <> 'COMPLETED' then raise exception 'P13b FAILED: paid bill did not complete'; end if;
  if pos_sync_bill(v_bill8) <> 'COMPLETED' then raise exception 'P13b FAILED: repeat sync changed the bill'; end if;
  if (select count(*) from invoices where order_id = (v_res ->> 'order_id')::uuid) <> 1 then
    raise exception 'P13b FAILED: expected exactly one invoice after payment';
  end if;
  raise notice 'P13b ok: paid online bill completes and is invoiced once';

  -- ----- P14: expiry only moves held bills older than 7 days; expired bills cannot be placed.
  perform pg_temp.act_as(owner_a);
  v_bill9 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)), null);
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try('select expire_pos_bills()');
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'P14 FAILED: expiry callable by a signed-in role'; end if;
  update pos_bills set created_at = now() - interval '8 days' where id = v_bill9;
  select expire_pos_bills() into v_count;
  select status into v_status from pos_bills where id = v_bill9;
  if v_status <> 'EXPIRED' then raise exception 'P14 FAILED: stale held bill not expired (status %)', v_status; end if;
  v_msg := pg_temp.try(format('select pos_place_bill(%L, %L, %L, null, null)', v_bill9, owner_a, 'cash'));
  if left(v_msg, 5) = 'ok' or v_msg = 'ok' then raise exception 'P14 FAILED: expired bill was placed'; end if;
  raise notice 'P14 ok: stale held bills expire and cannot be placed';

  -- ----- P15: quantities are validated.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select pos_save_bill(null, %L, null, %L::jsonb, null)', store_a,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 0))::text));
  perform pg_temp.reset_session();
  if v_msg = 'ok' or left(v_msg, 5) = 'ok' then raise exception 'P15 FAILED: zero quantity saved'; end if;
  raise notice 'P15 ok: zero quantity refused';

  raise notice 'POS tests: all 15 groups passed';
end $$;

rollback;
