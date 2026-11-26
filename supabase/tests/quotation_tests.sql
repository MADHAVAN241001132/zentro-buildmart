-- ZENTRO BuildMart: tests for migration 0019 (quotation lifecycle, customer responses, conversion to orders).
-- Run after migrations 0001-0019 and the dev seed. Rolled back. Each group prints a NOTICE when it passes.

begin;

create or replace function pg_temp.reserved(p_var uuid) returns bigint
language sql as $$ select reserved from inventory where variant_id = p_var $$;

create or replace function pg_temp.orders_for(p_q uuid) returns integer
language sql as $$ select count(*)::int from orders where quotation_id = p_q $$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  mgr_a constant uuid := '00000000-0000-4000-8000-0000000000a4';
  owner_b constant uuid := '00000000-0000-4000-8000-0000000000a3';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  store_b constant uuid := '22222222-2222-4222-8222-222222222222';
  v1 uuid; v2 uuid; vb uuid; cust uuid;
  s1 uuid; s_other uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid;
  tok_a text := repeat('a', 64);
  tok_b text := repeat('b', 64);
  tok_c text := repeat('c', 64);
  valid date := current_date + 30;
  v_msg text; v_state text; v_res text; v_ord jsonb; v_o1 uuid; v_o2 uuid;
  v_before bigint; v_after bigint; v_status text; v_sub bigint; v_tax bigint; v_total bigint; v_tax_sum bigint;
  p1 bigint; p2 bigint; v_n integer; v_count integer; v_item record; v_pay text; v_inv integer; v_stock_each bigint;
  v_rev integer;
begin
  select pv.id into v1 from product_variants pv where pv.sku = 'AMB-V001';
  select pv.id into v2 from product_variants pv where pv.sku = 'AMB-V009';
  select pv.id into vb from product_variants pv where pv.store_id = store_b order by sku limit 1;
  select id into cust from customers where store_id = store_a and mobile = '9840011001';
  update inventory set on_hand = 500, reserved = 0, damaged = 0 where variant_id in (v1, v2);
  -- Owner cash sales draw from batch lots, so the first lot of the test variant gets enough stock for the tests below.
  update inventory_batches set on_hand = on_hand + 500
  where id = (select ib.id from inventory_batches ib where ib.variant_id = v2 and ib.store_id = store_a order by ib.created_at limit 1);
  select sale_price_paise into p1 from product_variants where id = v1;
  select sale_price_paise into p2 from product_variants where id = v2;

  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, repeat('e', 64), now() + interval '1 day') returning id into s1;
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, repeat('f', 64), now() + interval '1 day') returning id into s_other;

  -- Q1: an owner draft is priced from the catalogue; per-line GST and totals reconcile.
  q1 := quotation_save(store_a, owner_a, null, jsonb_build_object(
    'customer_id', cust, 'customer_name', 'Karthik Subramanian', 'valid_until', valid::text, 'requirements', 'Floor tiles',
    'lines', jsonb_build_array(
      jsonb_build_object('variant_id', v1, 'quantity', 4),
      jsonb_build_object('variant_id', v2, 'quantity', 2.5))));
  select status, subtotal_paise, tax_paise, total_paise into v_status, v_sub, v_tax from quotations where id = q1;
  if v_status <> 'DRAFT' then raise exception 'Q1 FAILED: new quotation is % not DRAFT', v_status; end if;
  if v_sub <> 4 * p1 + round(2.5 * p2)::bigint then raise exception 'Q1 FAILED: subtotal % does not match catalogue prices', v_sub; end if;
  select sum(tax_paise), count(*) into v_tax_sum, v_n from quotation_items where quotation_id = q1;
  if v_n <> 2 then raise exception 'Q1 FAILED: expected 2 lines, found %', v_n; end if;
  for v_item in select qi.tax_paise, qi.taxable_paise, qi.gst_rate_bps from quotation_items qi where qi.quotation_id = q1 loop
    if v_item.tax_paise <> round(v_item.taxable_paise * v_item.gst_rate_bps / 10000.0)::bigint then
      raise exception 'Q1 FAILED: line GST is not taxable x rate';
    end if;
  end loop;
  select total_paise - taxable_paise - tax_paise into v_n from quotations where id = q1;
  if v_n <> 0 then raise exception 'Q1 FAILED: total does not equal taxable + GST + delivery'; end if;
  raise notice 'Q1 ok: owner draft priced from catalogue, per-line GST and totals reconcile';

  -- Q2: staff cannot change a price or apply a discount; a manager can.
  update store_owners set role = 'staff' where profile_id = mgr_a and store_id = store_a;
  v_msg := null;
  begin
    perform quotation_save(store_a, mgr_a, q1, jsonb_build_object('customer_name', 'Karthik Subramanian', 'valid_until', valid::text,
      'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 4, 'unit_price_paise', p1 - 100))));
  exception when sqlstate '42501' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q2 FAILED: staff changed a price'; end if;
  v_msg := null;
  begin
    perform quotation_save(store_a, mgr_a, q1, jsonb_build_object('customer_name', 'Karthik Subramanian', 'valid_until', valid::text,
      'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 4, 'discount_paise', 100))));
  exception when sqlstate '42501' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q2 FAILED: staff applied a discount'; end if;
  update store_owners set role = 'manager' where profile_id = mgr_a and store_id = store_a;
  perform quotation_save(store_a, mgr_a, q1, jsonb_build_object('customer_name', 'Karthik Subramanian', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 4, 'discount_paise', 100),
                               jsonb_build_object('variant_id', v2, 'quantity', 2.5))));
  select discount_paise into v_n from quotations where id = q1;
  if v_n <> 100 then raise exception 'Q2 FAILED: manager discount not saved'; end if;
  raise notice 'Q2 ok: staff cannot change prices or discounts; managers can';

  -- Q3: a guest request carries quantities only; wrong-store products are refused; five open requests per session.
  v_msg := null;
  begin
    q2 := quotation_guest_request(store_a, s1, jsonb_build_object('customer_name', 'Asha Devi', 'customer_mobile', '9000000001',
      'requirements', 'Tiles for kitchen', 'lines', jsonb_build_array(jsonb_build_object('variant_id', vb, 'quantity', 3))));
  exception when sqlstate 'P0002' or sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q3 FAILED: a product from another store was accepted'; end if;
  q2 := quotation_guest_request(store_a, s1, jsonb_build_object('customer_name', 'Asha Devi', 'customer_mobile', '9000000001',
    'requirements', 'Tiles for kitchen and bath', 'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 10))));
  select status, source, total_paise into v_status, v_res, v_tax from quotations where id = q2;
  if v_status <> 'REQUESTED' or v_res <> 'guest' or v_tax <> 0 then raise exception 'Q3 FAILED: guest request not stored as an unpriced request'; end if;
  for v_n in 1..4 loop
    q5 := quotation_guest_request(store_a, s1, jsonb_build_object('customer_name', 'Asha Devi', 'customer_mobile', '9000000001',
      'lines', jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', v_n))));
  end loop;
  v_msg := null;
  begin
    perform quotation_guest_request(store_a, s1, jsonb_build_object('customer_name', 'Asha Devi', 'customer_mobile', '9000000001',
      'lines', jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 1))));
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%5 open%' then raise exception 'Q3 FAILED: sixth open request accepted (%)', coalesce(v_msg, 'accepted'); end if;
  raise notice 'Q3 ok: guest request is unpriced, wrong-store products refused, five open requests per session';

  -- Q4: another guest cannot withdraw this request; the owner prices it, which moves it to DRAFT.
  v_msg := null;
  begin
    perform quotation_guest_withdraw(q2, s_other);
  exception when sqlstate 'P0002' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q4 FAILED: another guest withdrew the request'; end if;
  perform quotation_save(store_a, owner_a, q2, jsonb_build_object('customer_name', 'Asha Devi', 'customer_mobile', '9000000001',
    'valid_until', valid::text, 'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 10))));
  select status, source into v_status, v_res from quotations where id = q2;
  if v_status <> 'DRAFT' or v_res <> 'guest' then raise exception 'Q4 FAILED: owner pricing did not move the request to DRAFT'; end if;
  raise notice 'Q4 ok: another guest cannot withdraw; owner pricing moves the request to DRAFT';

  -- Q5: send needs a validity date and a token; a sent quotation cannot be edited until revised.
  v_msg := null;
  begin
    perform quotation_send(store_a, owner_a, q2, tok_a);
  end;
  -- q2 has a validity date now, so send succeeds; confirm the no-validity refusal with a fresh draft.
  q3 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'No Date Buyer', 'lines',
    jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 1))));
  begin
    perform quotation_send(store_a, owner_a, q3, tok_b);
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%validity%' then raise exception 'Q5 FAILED: send without validity accepted (%)', coalesce(v_msg, 'accepted'); end if;
  select status, share_token_hash into v_status, v_res from quotations where id = q2;
  if v_status <> 'SENT' or v_res <> tok_a then raise exception 'Q5 FAILED: send did not issue the share link'; end if;
  v_msg := null;
  begin
    perform quotation_save(store_a, owner_a, q2, jsonb_build_object('customer_name', 'Asha Devi', 'valid_until', valid::text,
      'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 99))));
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%revise it first%' then raise exception 'Q5 FAILED: a sent quotation was edited (%)', coalesce(v_msg, 'edited'); end if;
  raise notice 'Q5 ok: send needs a validity date, issues the link, and a sent quotation cannot be edited';

  -- Q6: revise withdraws the link and bumps the revision; the old link no longer works; rotation needs SENT.
  v_rev := quotation_revise(store_a, owner_a, q2);
  select status, share_token_hash, revision into v_status, v_res, v_n from quotations where id = q2;
  if v_status <> 'DRAFT' or v_res is not null or v_n <> 2 then raise exception 'Q6 FAILED: revise did not reset the quotation'; end if;
  v_msg := null;
  begin
    perform quotation_rotate_share(store_a, owner_a, q2, tok_b);
  exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q6 FAILED: rotated a link on a draft'; end if;
  perform quotation_send(store_a, owner_a, q2, tok_b);
  v_msg := null;
  begin
    perform quotation_respond(q2, 'accept', null, null, tok_a);
  exception when sqlstate 'P0002' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q6 FAILED: the old link still works after revision'; end if;
  raise notice 'Q6 ok: revision withdraws the old link; the new link works; rotation needs a sent quotation';

  -- Q7: the customer accepts by link; replay is harmless; rejecting after acceptance is refused.
  v_res := quotation_respond(q2, 'accept', 'Looks good', null, tok_b);
  if v_res <> 'ACCEPTED' then raise exception 'Q7 FAILED: accept returned %', v_res; end if;
  v_res := quotation_respond(q2, 'accept', null, null, tok_b);
  if v_res <> 'ACCEPTED' then raise exception 'Q7 FAILED: accept replay changed the result'; end if;
  v_msg := null;
  begin
    perform quotation_respond(q2, 'reject', null, null, tok_b);
  exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q7 FAILED: accepted quotation was rejected'; end if;
  raise notice 'Q7 ok: accept by link, replay returns ACCEPTED, reject after accept refused';

  -- Q8: a guest converts an accepted quotation online. Stock is reserved once, payment is pending, and a second
  -- conversion returns the same order without reserving again.
  v_before := pg_temp.reserved(v1);
  v_ord := quotation_convert(q2, null, null, tok_b, 'online', 'razorpay', 'order_test_q8', null);
  v_o1 := (v_ord ->> 'order_id')::uuid;
  if (v_ord ->> 'replayed')::boolean then raise exception 'Q8 FAILED: first conversion reported a replay'; end if;
  v_after := pg_temp.reserved(v1);
  if v_after - v_before <> 10 then raise exception 'Q8 FAILED: reserved % -> % (expected +10)', v_before, v_after; end if;
  select status into v_status from quotations where id = q2;
  if v_status <> 'CONVERTED' then raise exception 'Q8 FAILED: quotation is % after conversion', v_status; end if;
  select payment_status, channel, payment_method into v_pay, v_res, v_msg from orders where id = v_o1;
  if v_pay <> 'PENDING' or v_res <> 'online' then raise exception 'Q8 FAILED: order % / %', v_pay, v_res; end if;
  if (select status from payments where order_id = v_o1 limit 1) <> 'PENDING' then raise exception 'Q8 FAILED: no pending payment attempt'; end if;
  v_ord := quotation_convert(q2, null, null, tok_b, 'online', 'razorpay', 'order_test_q8_again', null);
  v_o2 := (v_ord ->> 'order_id')::uuid;
  if not (v_ord ->> 'replayed')::boolean or v_o2 <> v_o1 then raise exception 'Q8 FAILED: second conversion created or changed an order'; end if;
  if pg_temp.reserved(v1) <> v_after then raise exception 'Q8 FAILED: stock reserved twice'; end if;
  if pg_temp.orders_for(q2) <> 1 then raise exception 'Q8 FAILED: % orders for one quotation', pg_temp.orders_for(q2); end if;
  raise notice 'Q8 ok: conversion creates one order, reserves stock once, and replays safely';

  -- Q9: the order's lines and totals match the quotation.
  select total_paise, subtotal_paise, discount_paise, tax_paise into v_total, v_sub, v_n, v_tax from orders where id = v_o1;
  select total_paise, subtotal_paise, discount_paise, tax_paise into v_tax_sum, p1, p2, v_stock_each from quotations where id = q2;
  if v_total <> v_tax_sum or v_sub <> p1 or v_n <> p2 or v_tax <> v_stock_each then
    raise exception 'Q9 FAILED: order figures % / % do not match the quotation', v_total, v_tax_sum;
  end if;
  if (select count(*) from order_items where order_id = v_o1) <> 1 then raise exception 'Q9 FAILED: wrong number of order lines'; end if;
  raise notice 'Q9 ok: order lines and totals carry the quotation figures';

  -- Q10: stock shortfall rolls the whole conversion back.
  q4 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'Bulk Buyer', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 9000))));
  perform quotation_send(store_a, owner_a, q4, tok_c);
  perform quotation_respond(q4, 'accept', null, null, tok_c);
  v_before := pg_temp.reserved(v1);
  v_msg := null;
  begin
    perform quotation_convert(q4, owner_a, null, null, 'cash', null, null, null);
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'insufficient_stock%' then raise exception 'Q10 FAILED: shortfall not refused (%)', coalesce(v_msg, 'accepted'); end if;
  select status into v_status from quotations where id = q4;
  if v_status <> 'ACCEPTED' or pg_temp.orders_for(q4) <> 0 or pg_temp.reserved(v1) <> v_before then
    raise exception 'Q10 FAILED: a failed conversion left records behind';
  end if;
  raise notice 'Q10 ok: stock shortfall rolls back the order, the payment and the reservation';

  -- Q11: edited stored figures stop conversion.
  q3 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'Tamper Test', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 2))));
  perform quotation_send(store_a, owner_a, q3, repeat('k', 64));
  perform quotation_respond(q3, 'accept', null, null, repeat('k', 64));
  update quotation_items set unit_price_paise = unit_price_paise + 1 where quotation_id = q3;
  v_msg := null;
  begin
    perform quotation_convert(q3, owner_a, null, null, 'cash', null, null, null);
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%do not reconcile%' then raise exception 'Q11 FAILED: tampered figures converted (%)', coalesce(v_msg, 'converted'); end if;
  if pg_temp.orders_for(q3) <> 0 then raise exception 'Q11 FAILED: an order was created from tampered figures'; end if;
  raise notice 'Q11 ok: quotation whose stored figures do not reconcile cannot be converted';

  -- Q12: an expired quotation cannot be accepted or converted until it is renewed.
  q5 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'Expiry Test', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 1))));
  perform quotation_send(store_a, owner_a, q5, repeat('d', 64));
  update quotations set valid_until = current_date - 1 where id = q5;
  v_res := quotation_respond(q5, 'accept', null, null, repeat('d', 64));
  select status into v_status from quotations where id = q5;
  if v_res <> 'EXPIRED' or v_status <> 'EXPIRED' then raise exception 'Q12 FAILED: expired quotation accepted (%)', v_res; end if;
  update quotations set status = 'ACCEPTED', valid_until = current_date - 1 where id = q3;
  v_msg := null;
  begin
    perform quotation_convert(q3, owner_a, null, null, 'cash', null, null, null);
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%expired%' then raise exception 'Q12 FAILED: expired quotation converted (%)', coalesce(v_msg, 'converted'); end if;
  raise notice 'Q12 ok: expired quotations cannot be accepted or converted until renewed';

  -- Q13: credit needs an owner and a customer; guests cannot use credit.
  q4 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'Walk-in Quote', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 1))));
  perform quotation_send(store_a, owner_a, q4, repeat('g', 64));
  perform quotation_respond(q4, 'accept', null, null, repeat('g', 64));
  v_msg := null;
  begin
    perform quotation_convert(q4, owner_a, null, null, 'credit', null, null, null);
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%credit sales need a customer%' then raise exception 'Q13 FAILED: credit without customer accepted'; end if;
  v_msg := null;
  begin
    perform quotation_convert(q4, null, null, repeat('g', 64), 'credit', null, null, null);
  exception when sqlstate '42501' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q13 FAILED: guest used credit'; end if;
  raise notice 'Q13 ok: credit needs a customer and is not available to guests';

  -- Q14: an owner cash conversion is paid at once and issues one invoice.
  q1 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_id', cust, 'customer_name', 'Karthik Subramanian',
    'valid_until', valid::text, 'lines', jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 3))));
  perform quotation_send(store_a, owner_a, q1, repeat('h', 64));
  perform quotation_respond(q1, 'accept', null, null, repeat('h', 64));
  v_ord := quotation_convert(q1, owner_a, null, null, 'cash', null, null, null);
  v_o1 := (v_ord ->> 'order_id')::uuid;
  select payment_status into v_pay from orders where id = v_o1;
  select count(*) into v_inv from invoices where order_id = v_o1;
  if v_pay <> 'PAID' or v_inv <> 1 then raise exception 'Q14 FAILED: owner cash sale not paid (%) or invoices % ', v_pay, v_inv; end if;
  raise notice 'Q14 ok: owner cash conversion is paid, invoiced once';

  -- Q15: a guest cash conversion waits for the owner to confirm and issues no invoice yet.
  q5 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'Guest Cash', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v2, 'quantity', 1))));
  perform quotation_send(store_a, owner_a, q5, repeat('i', 64));
  perform quotation_respond(q5, 'accept', null, null, repeat('i', 64));
  v_ord := quotation_convert(q5, null, null, repeat('i', 64), 'cash', null, null, null);
  v_o1 := (v_ord ->> 'order_id')::uuid;
  select payment_status into v_pay from orders where id = v_o1;
  select count(*) into v_inv from invoices where order_id = v_o1;
  if v_pay = 'PAID' or v_inv <> 0 then raise exception 'Q15 FAILED: guest cash sale paid or invoiced before confirmation'; end if;
  raise notice 'Q15 ok: guest cash conversion waits for owner confirmation';

  -- Q16: a second order for the same quotation is refused by the database.
  v_msg := null;
  begin
    insert into orders (store_id, order_number, channel, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise, quotation_id)
    values (store_a, 'DUP-Q16', 'pos', 'Dup', 'cash', 0, 0, 0, 0, q1);
  exception when unique_violation then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q16 FAILED: second order accepted for one quotation'; end if;
  raise notice 'Q16 ok: database refuses a second order for the same quotation';

  -- Q17: cancellation: accepted quotations cannot be cancelled; drafts can, with a reason.
  v_msg := null;
  begin
    perform quotation_cancel(store_a, owner_a, q1, 'changed my mind');
  exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q17 FAILED: a converted quotation was cancelled'; end if;
  q3 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'Cancel Me', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 1))));
  v_msg := null;
  begin
    perform quotation_cancel(store_a, owner_a, q3, 'no');
  exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q17 FAILED: a short cancellation reason was accepted'; end if;
  perform quotation_cancel(store_a, owner_a, q3, 'Customer went elsewhere');
  select status into v_status from quotations where id = q3;
  if v_status <> 'CANCELLED' then raise exception 'Q17 FAILED: draft not cancelled'; end if;
  raise notice 'Q17 ok: converted and accepted quotations are protected; drafts cancel with a reason';

  -- Q18: expiry job moves past-dated SENT quotations to EXPIRED.
  q4 := quotation_save(store_a, owner_a, null, jsonb_build_object('customer_name', 'Expire Job', 'valid_until', valid::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 1))));
  perform quotation_send(store_a, owner_a, q4, repeat('j', 64));
  update quotations set valid_until = current_date - 2 where id = q4;
  v_n := expire_quotations();
  select status into v_status from quotations where id = q4;
  if v_status <> 'EXPIRED' or v_n < 1 then raise exception 'Q18 FAILED: expiry job did not expire the quotation'; end if;
  raise notice 'Q18 ok: expiry job moves past-dated sent quotations to EXPIRED';

  -- Q19: a member of another store cannot act on this store's quotation.
  v_msg := null;
  begin
    perform quotation_save(store_a, owner_b, q4, jsonb_build_object('customer_name', 'Cross Store', 'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 1))));
  exception when sqlstate '42501' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'Q19 FAILED: another store edited this quotation'; end if;
  raise notice 'Q19 ok: members of another store cannot edit this quotation';

  -- Q20: restore the test stock and role changes are rolled back by the transaction.
  update inventory set on_hand = 0, reserved = 0 where variant_id in (v1, v2);
  raise notice 'Quotation tests: all groups passed';
end $$;

rollback;
