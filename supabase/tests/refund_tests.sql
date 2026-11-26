-- ZENTRO BuildMart: tests for migration 0016 (refunds, restocking, damaged returns, coupon release,
-- gateway settlement, credit refunds, cash movements). Run after migrations 0001-0016 and the dev seed. Rolled back.

begin;

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

create or replace function pg_temp.onhand(p_var uuid) returns bigint
language sql as $$ select on_hand from inventory where variant_id = p_var $$;

create or replace function pg_temp.damaged(p_var uuid) returns bigint
language sql as $$ select damaged from inventory where variant_id = p_var $$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  owner_b constant uuid := '00000000-0000-4000-8000-0000000000a3';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v1 uuid; v2 uuid;
  v_coupon uuid;
  v_bill uuid; v_res jsonb;
  v_order uuid; v_item1 uuid; v_item2 uuid; v_line1 bigint; v_line2 bigint; v_total bigint;
  v_ref jsonb; v_ref2 jsonb;
  v_msg text;
  v_amt bigint; v_sum bigint; v_before bigint; v_used integer; v_red integer;
  v_order_b uuid; v_order_c uuid; v_order_d uuid; v_order_e uuid; v_order_f uuid;
  v_cust uuid; v_bal0 bigint; v_bal1 bigint; v_bal2 bigint; v_etotal bigint;
  v_summary jsonb; v_mv jsonb;
  v_status text;
begin
  select pv.id into v1 from product_variants pv where pv.sku = 'AMB-V001';
  select pv.id into v2 from product_variants pv where pv.store_id = store_a and pv.is_active and pv.id <> v1 order by pv.sku limit 1;
  update inventory set on_hand = 50, reserved = 0, damaged = 0 where variant_id in (v1, v2);
  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, is_active)
  values (store_a, 'ZREF10', 'percent', 1000, 0, true) returning id into v_coupon;

  -- Order A: cash POS sale of 3 x AMB-V001 and 1 x the second variant.
  perform pg_temp.act_as(owner_a);
  v_bill := pos_save_bill(null, store_a, null, jsonb_build_array(
    jsonb_build_object('variant_id', v1, 'quantity', 3, 'line_discount_paise', 0),
    jsonb_build_object('variant_id', v2, 'quantity', 1, 'line_discount_paise', 0)), 'refund test A');
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  v_order := (v_res ->> 'order_id')::uuid;
  select id, line_total_paise into v_item1, v_line1 from order_items where order_id = v_order and variant_id = v1;
  select id, line_total_paise into v_item2, v_line2 from order_items where order_id = v_order and variant_id = v2;
  select total_paise into v_total from orders where id = v_order;
  if pg_temp.onhand(v1) <> 47 or pg_temp.onhand(v2) <> 49 then
    raise exception 'SETUP FAILED: stock after sale is % and %', pg_temp.onhand(v1), pg_temp.onhand(v2);
  end if;

  -- R1: a partial cash refund of one unit returns it to stock, succeeds at once, and carries the line share.
  v_ref := create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item1, 'quantity', 1, 'condition', 'restock')),
                         'Customer changed mind', 'refund-key-r1', owner_a);
  v_amt := round(v_line1::numeric * 1 / 3)::bigint;
  if (v_ref ->> 'status') <> 'succeeded' or (v_ref ->> 'amount_paise')::bigint <> v_amt or (v_ref ->> 'method') <> 'cash' then
    raise exception 'R1 FAILED: %', v_ref;
  end if;
  if pg_temp.onhand(v1) <> 48 then raise exception 'R1 FAILED: stock is % not 48', pg_temp.onhand(v1); end if;
  if (select refund_type from refunds where id = (v_ref ->> 'refund_id')::uuid) <> 'partial' then
    raise exception 'R1 FAILED: refund not marked partial';
  end if;
  if (select payment_status from orders where id = v_order) <> 'PARTIALLY_REFUNDED' then
    raise exception 'R1 FAILED: order payment status not PARTIALLY_REFUNDED';
  end if;
  raise notice 'R1 ok: partial cash refund returned one unit, succeeded at the line share %', v_amt;

  -- R2: the same request key again returns the first refund and moves nothing.
  v_ref2 := create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item1, 'quantity', 1, 'condition', 'restock')),
                          'Customer changed mind', 'refund-key-r1', owner_a);
  if (v_ref2 ->> 'replayed')::boolean is not true or (v_ref2 ->> 'refund_id') <> (v_ref ->> 'refund_id') then
    raise exception 'R2 FAILED: repeated key created another refund';
  end if;
  if pg_temp.onhand(v1) <> 48 then raise exception 'R2 FAILED: replay moved stock'; end if;
  raise notice 'R2 ok: a repeated request key returns the first refund and changes nothing';

  -- R3: more units than remain on the line are refused. Two units of the first line remain.
  v_msg := null;
  begin
    perform create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item1, 'quantity', 3, 'condition', 'restock')),
                          'Too many', 'refund-key-r3', owner_a);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like 'only % unit(s)%' then raise exception 'R3 FAILED: over-return accepted (%)', coalesce(v_msg, 'accepted'); end if;
  raise notice 'R3 ok: over-return refused (%)', v_msg;

  -- R4: a damaged return does not go back to sellable stock; it is counted as damaged.
  v_ref := create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item2, 'quantity', 1, 'condition', 'damaged')),
                         'Damaged on arrival', 'refund-key-r4', owner_a);
  if (v_ref ->> 'amount_paise')::bigint <> v_line2 then raise exception 'R4 FAILED: amount % not the full line %', v_ref ->> 'amount_paise', v_line2; end if;
  if pg_temp.onhand(v2) <> 49 or pg_temp.damaged(v2) <> 1 then
    raise exception 'R4 FAILED: on_hand % damaged %', pg_temp.onhand(v2), pg_temp.damaged(v2);
  end if;
  raise notice 'R4 ok: damaged return counted as damaged, not sellable';

  -- R5a: the line-quantity ceiling is enforced while the order is still partly refunded. The order is not yet
  -- REFUNDED, so this refusal cannot come from the order-status rule.
  if (select payment_status from orders where id = v_order) <> 'PARTIALLY_REFUNDED' then
    raise exception 'R5 FAILED: setup expected a partly refunded order';
  end if;
  v_msg := null;
  begin
    perform create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item1, 'quantity', 3, 'condition', 'restock')),
                          'Too many units', 'refund-key-r5a', owner_a);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like 'only % unit(s)%' then
    raise exception 'R5 FAILED: excess quantity not refused on a partly refunded order (%)', coalesce(v_msg, 'accepted');
  end if;
  if (select payment_status from orders where id = v_order) <> 'PARTIALLY_REFUNDED' then
    raise exception 'R5 FAILED: refused request changed the order';
  end if;
  raise notice 'R5a ok: excess line quantity refused while the order is partly refunded (%)', v_msg;

  -- R5: returning the remainder of the first line closes the order. The refunds add up to the order total exactly.
  v_ref := create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item1, 'quantity', 2, 'condition', 'restock')),
                         'Balance return', 'refund-key-r5', owner_a);
  select coalesce(sum(amount_paise), 0) into v_sum from refund_items where order_item_id = v_item1;
  if v_sum <> v_line1 then raise exception 'R5 FAILED: line refunded % of %', v_sum, v_line1; end if;
  if (select coalesce(sum(amount_paise), 0) from refunds where order_id = v_order and status = 'succeeded') <> v_total then
    raise exception 'R5 FAILED: refunds do not add up to the order total';
  end if;
  if pg_temp.onhand(v1) <> 50 then raise exception 'R5 FAILED: stock is % not 50', pg_temp.onhand(v1); end if;
  if (select refund_type from refunds where id = (v_ref ->> 'refund_id')::uuid) <> 'full' then
    raise exception 'R5 FAILED: fully returned order not marked full';
  end if;
  if (select payment_status from orders where id = v_order) <> 'REFUNDED' then
    raise exception 'R5 FAILED: fully refunded order not REFUNDED';
  end if;
  v_msg := null;
  begin
    perform create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item1, 'quantity', 1, 'condition', 'restock')),
                          'Again', 'refund-key-r5b', owner_a);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then raise exception 'R5 FAILED: a fully returned line was refunded again'; end if;
  raise notice 'R5 ok: remainder refunded, totals reconcile, a second refund is refused (%)', v_msg;

  -- R6: a fully returned order releases its coupon use.
  perform pg_temp.act_as(owner_a);
  v_bill := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 2, 'line_discount_paise', 0)), 'refund test B');
  perform pos_set_coupon(v_bill, 'ZREF10');
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  v_order_b := (v_res ->> 'order_id')::uuid;
  select used_count into v_used from coupons where id = v_coupon;
  if v_used <> 1 then raise exception 'R6 FAILED: coupon not counted before the refund (%)', v_used; end if;
  v_ref := create_refund(v_order_b, (select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity, 'condition', 'restock'))
                                    from order_items where order_id = v_order_b),
                         'Full return', 'refund-key-r6', owner_a);
  select used_count into v_used from coupons where id = v_coupon;
  select count(*) into v_red from coupon_redemptions where order_id = v_order_b;
  if v_used <> 0 or v_red <> 0 then raise exception 'R6 FAILED: coupon still used (% uses, % redemptions)', v_used, v_red; end if;
  if pg_temp.onhand(v1) <> 50 then raise exception 'R6 FAILED: stock is % not 50', pg_temp.onhand(v1); end if;
  raise notice 'R6 ok: full return releases the coupon and restocks the units';

  -- R7: a Razorpay refund is not counted as returned until the gateway confirms it.
  perform pg_temp.act_as(owner_a);
  v_bill := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 1, 'line_discount_paise', 0)), 'refund test C');
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, owner_a, 'online', 'order_refund_c_test', null);
  v_order_c := (v_res ->> 'order_id')::uuid;
  select total_paise into v_total from orders where id = v_order_c;
  perform settle_online_payment('razorpay', 'order_refund_c_test', 'pay_refund_c', v_total, true, null);
  if (select payment_status from orders where id = v_order_c) <> 'PAID' then raise exception 'R7 FAILED: online order not paid'; end if;
  v_before := pg_temp.onhand(v1);
  v_ref := create_refund(v_order_c, (select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity, 'condition', 'restock'))
                                    from order_items where order_id = v_order_c),
                         'Gateway return', 'refund-key-r7', owner_a);
  if (v_ref ->> 'status') <> 'requested' or (v_ref ->> 'gateway_refund_needed')::boolean is not true then
    raise exception 'R7 FAILED: online refund not pending (%)', v_ref;
  end if;
  if pg_temp.onhand(v1) <> v_before then raise exception 'R7 FAILED: stock moved before the gateway confirmed'; end if;
  if mark_refund_processing((v_ref ->> 'refund_id')::uuid, 'rfnd_test_c') <> 'processing' then
    raise exception 'R7 FAILED: refund not marked processing';
  end if;
  if settle_refund('rfnd_test_c', true, null) <> 'succeeded' then raise exception 'R7 FAILED: confirmed refund not settled'; end if;
  if pg_temp.onhand(v1) <> v_before + 1 then raise exception 'R7 FAILED: stock not returned after confirmation'; end if;
  if settle_refund('rfnd_test_c', true, null) <> 'duplicate' then raise exception 'R7 FAILED: repeated gateway event applied twice'; end if;
  if (select payment_status from orders where id = v_order_c) <> 'REFUNDED' then raise exception 'R7 FAILED: payment status not REFUNDED'; end if;
  raise notice 'R7 ok: gateway refund pending until confirmed, applied once, repeat event ignored';

  -- R8: a refused gateway refund changes nothing, and the units can be refunded again afterwards.
  perform pg_temp.act_as(owner_a);
  v_bill := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 1, 'line_discount_paise', 0)), 'refund test D');
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, owner_a, 'online', 'order_refund_d_test', null);
  v_order_d := (v_res ->> 'order_id')::uuid;
  select total_paise into v_total from orders where id = v_order_d;
  perform settle_online_payment('razorpay', 'order_refund_d_test', 'pay_refund_d', v_total, true, null);
  v_before := pg_temp.onhand(v2);
  v_ref := create_refund(v_order_d, (select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity, 'condition', 'restock'))
                                    from order_items where order_id = v_order_d),
                         'Gateway return D', 'refund-key-r8', owner_a);
  perform mark_refund_processing((v_ref ->> 'refund_id')::uuid, 'rfnd_test_d');
  if settle_refund('rfnd_test_d', false, 'declined by bank') <> 'failed' then raise exception 'R8 FAILED: refusal not recorded'; end if;
  if pg_temp.onhand(v2) <> v_before then raise exception 'R8 FAILED: refused refund moved stock'; end if;
  if (select status from refunds where id = (v_ref ->> 'refund_id')::uuid) <> 'failed' then
    raise exception 'R8 FAILED: refund status not failed';
  end if;
  v_ref2 := create_refund(v_order_d, (select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity, 'condition', 'restock'))
                                     from order_items where order_id = v_order_d),
                          'Retry after refusal', 'refund-key-r8b', owner_a);
  if (v_ref2 ->> 'status') <> 'requested' then raise exception 'R8 FAILED: units not available after a refused refund (%)', v_ref2; end if;
  raise notice 'R8 ok: refused gateway refund changes nothing and frees the units for a new request';

  -- R9: a credit sale refunded in full reduces the customer ledger back to where it was.
  select id into v_cust from customers where store_id = store_a and is_credit_approved order by full_name limit 1;
  update customers set credit_limit_paise = 100000000 where id = v_cust;
  v_bal0 := customer_balance(v_cust);
  perform pg_temp.act_as(owner_a);
  v_bill := pos_save_bill(null, store_a, v_cust,
    jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 1, 'line_discount_paise', 0)), 'refund test E');
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, owner_a, 'credit', null, null);
  v_order_e := (v_res ->> 'order_id')::uuid;
  select total_paise into v_etotal from orders where id = v_order_e;
  v_bal1 := customer_balance(v_cust);
  if v_bal1 - v_bal0 <> v_etotal then raise exception 'R9 FAILED: ledger did not rise by the sale'; end if;
  v_ref := create_refund(v_order_e, (select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity, 'condition', 'restock'))
                                    from order_items where order_id = v_order_e),
                         'Credit sale returned', 'refund-key-r9', owner_a);
  v_bal2 := customer_balance(v_cust);
  if (v_ref ->> 'method') <> 'credit' or (v_ref ->> 'status') <> 'succeeded' then raise exception 'R9 FAILED: %', v_ref; end if;
  if v_bal2 <> v_bal0 then raise exception 'R9 FAILED: ledger balance % not back to %', v_bal2, v_bal0; end if;
  raise notice 'R9 ok: credit refund reduces the customer ledger and succeeds';

  -- R10: cash movements are recorded for today, counted in the day summary, and typed correctly.
  perform pg_temp.act_as(owner_a);
  v_mv := record_cash_movement(store_a, 'manual_in', 1000, 'Float top-up', owner_a);
  v_mv := record_cash_movement(store_a, 'deposit', 500, 'Bank deposit', owner_a);
  v_summary := cash_day_summary(store_a, v_today);
  perform pg_temp.reset_session();
  if (v_summary ->> 'cash_manual_in_paise')::bigint <> 1000 or (v_summary ->> 'cash_deposits_paise')::bigint <> 500 then
    raise exception 'R10 FAILED: summary %', v_summary;
  end if;
  raise notice 'R10 ok: manual cash in and a bank deposit recorded and summarised';

  -- R11: another store's owner cannot record a cash movement here.
  v_msg := null;
  perform pg_temp.act_as(owner_b);
  begin
    perform record_cash_movement(store_a, 'manual_out', 100, 'Not mine', owner_b);
  exception when sqlstate '42501' then v_msg := 'refused';
  end;
  perform pg_temp.reset_session();
  if v_msg is distinct from 'refused' then raise exception 'R11 FAILED: cross-store movement accepted'; end if;
  raise notice 'R11 ok: cross-store cash movement refused';

  -- R12: a closed day takes no further movements.
  insert into cash_reconciliations (store_id, business_date, opening_paise, cash_sales_paise, cash_refunds_paise,
                                    cash_expenses_paise, cash_deposits_paise, expected_closing_paise, actual_closing_paise, difference_paise)
  values (store_a, v_today, 0, 0, 0, 0, 0, 0, 0, 0);
  v_msg := null;
  perform pg_temp.act_as(owner_a);
  begin
    perform record_cash_movement(store_a, 'manual_in', 100, 'After close', owner_a);
  exception when others then v_msg := sqlerrm;
  end;
  perform pg_temp.reset_session();
  if v_msg is null or v_msg not like '%already closed%' then raise exception 'R12 FAILED: movement accepted on a closed day (%)', coalesce(v_msg, 'accepted'); end if;
  raise notice 'R12 ok: movement refused on a closed day (%)', v_msg;

  -- R13: a gateway event whose amount differs from the refund is refused and leaves the refund processing.
  perform pg_temp.act_as(owner_a);
  v_bill := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 1, 'line_discount_paise', 0)), 'refund test F');
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, owner_a, 'online', 'order_refund_f_test', null);
  v_order_f := (v_res ->> 'order_id')::uuid;
  select total_paise into v_total from orders where id = v_order_f;
  perform settle_online_payment('razorpay', 'order_refund_f_test', 'pay_refund_f', v_total, true, null);
  v_ref := create_refund(v_order_f, (select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity, 'condition', 'restock'))
                                    from order_items where order_id = v_order_f),
                         'Gateway return F', 'refund-key-r13', owner_a);
  perform mark_refund_processing((v_ref ->> 'refund_id')::uuid, 'rfnd_test_f');
  v_msg := null;
  begin
    perform settle_refund('rfnd_test_f', true, null, (v_ref ->> 'amount_paise')::bigint + 1);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%does not match%' then
    raise exception 'R13 FAILED: mismatched gateway amount accepted (%)', coalesce(v_msg, 'accepted');
  end if;
  if (select status from refunds where id = (v_ref ->> 'refund_id')::uuid) <> 'processing' then
    raise exception 'R13 FAILED: refund changed after a mismatched event';
  end if;
  if settle_refund('rfnd_test_f', true, null, (v_ref ->> 'amount_paise')::bigint) <> 'succeeded' then
    raise exception 'R13 FAILED: correct gateway amount not settled after the refusal';
  end if;
  raise notice 'R13 ok: mismatched gateway amount refused, refund stays processing until the correct amount arrives';

  raise notice 'Refund tests: all groups passed';
end $$;

rollback;
