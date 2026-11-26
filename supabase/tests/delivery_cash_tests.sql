-- ZENTRO BuildMart: tests for migration 0011 (delivery, coupon validation, cash-day close).
-- Run after migrations 0001-0011 and the dev seed. Rolled back at the end.

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
  v_delivery_order uuid;
  v_pickup_order uuid;
  v_payment uuid;
  v_status text;
  v_total bigint;
  v_msg text;
  v_summary jsonb;
  v_close jsonb;
  v_opening bigint;
  v_expected bigint;
  v_quote jsonb;
  v_cash_payment uuid;
  v_quote_msg text;
begin
  -- ----- Setup: a packed delivery order (cash on delivery) and a packed pickup order.
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_a, 'TEST-DEL-1', 'online', 'Delivery Test', 'delivery', 'cash', 'PENDING', 'PACKED',
          10000, 0, 10000, 1800, 0, 11800)
  returning id into v_delivery_order;

  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_a, 'TEST-PICK-1', 'online', 'Pickup Test', 'pickup', 'cash', 'PENDING', 'PACKED',
          10000, 0, 10000, 1800, 0, 11800)
  returning id into v_pickup_order;

  -- D1: scheduling a delivery order works and records the schedule.
  perform pg_temp.act_as(owner_a);
  perform delivery_schedule(v_delivery_order, date '2031-02-01', 'Ravi', 'TN 01 AB 1234', 0);
  perform pg_temp.reset_session();
  select status into v_status from deliveries where order_id = v_delivery_order;
  if v_status <> 'scheduled' then raise exception 'D1 FAILED: delivery status is %', v_status; end if;
  raise notice 'D1 ok: delivery scheduled';

  -- D2: a delivery charge can change before any payment is started, and the total stays consistent.
  perform pg_temp.act_as(owner_a);
  perform delivery_schedule(v_delivery_order, date '2031-02-01', 'Ravi', 'TN 01 AB 1234', 20000);
  perform pg_temp.reset_session();
  select total_paise into v_total from orders where id = v_delivery_order;
  if v_total <> 10000 + 1800 + 20000 then raise exception 'D2 FAILED: total % after charge change', v_total; end if;
  raise notice 'D2 ok: charge change before payment updates the total';

  -- D3: the lifecycle. Dispatch works from PACKED; delivery needs the payment recorded first.
  perform pg_temp.act_as(owner_a);
  perform delivery_set_status(v_delivery_order, 'assigned');
  v_msg := pg_temp.try(format('select delivery_set_status(%L, %L)', v_delivery_order, 'out_for_delivery'));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'D3 FAILED: dispatched without payment'; end if;

  insert into payments (store_id, order_id, method, provider, provider_order_id, status, amount_paise, paid_at)
  values (store_a, v_delivery_order, 'cash', 'cash', 'cash_test_d3', 'PAID', 32000, now())
  returning id into v_payment;
  update orders set payment_status = 'PAID' where id = v_delivery_order;

  perform pg_temp.act_as(owner_a);
  perform delivery_set_status(v_delivery_order, 'out_for_delivery');
  perform delivery_set_status(v_delivery_order, 'delivered');
  perform pg_temp.reset_session();
  select order_status into v_status from orders where id = v_delivery_order;
  if v_status <> 'COMPLETED' then raise exception 'D3 FAILED: order is % after delivery', v_status; end if;
  raise notice 'D3 ok: delivery lifecycle completes the order only after payment';

  -- D4: a paid delivery cannot change its charge.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select delivery_schedule(%L, %L, %L, %L, %s)', v_delivery_order, date '2031-02-02', 'Ravi', 'X', 5000));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'D4 FAILED: delivered order rescheduled'; end if;
  raise notice 'D4 ok: delivered orders cannot be rescheduled (%)', v_msg;

  -- D5: a pickup order cannot be scheduled as a delivery.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select delivery_schedule(%L, %L, %L, %L, %s)', v_pickup_order, date '2031-02-01', null, null, 0));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'D5 FAILED: pickup order scheduled for delivery'; end if;
  raise notice 'D5 ok: pickup orders are refused (%)', v_msg;

  -- D6: cash-day close. Create cash activity on a dedicated day, far from seed data.
  insert into payments (store_id, order_id, method, provider, provider_order_id, status, amount_paise, paid_at)
  values (store_a, v_pickup_order, 'cash', 'cash', 'cash_test_d6', 'PAID', 50000, '2031-01-15 10:00:00+05:30')
  returning id into v_cash_payment;
  insert into refunds (store_id, payment_id, order_id, amount_paise, status, reason, processed_at)
  values (store_a, v_cash_payment, v_pickup_order, 1000, 'succeeded', 'test refund', '2031-01-15 12:00:00+05:30');
  insert into expenses (store_id, category, amount_paise, expense_on, paid_from, note)
  values (store_a, 'Tea', 2000, date '2031-01-15', 'cash', 'test');

  perform pg_temp.act_as(owner_a);
  v_summary := cash_day_summary(store_a, date '2031-01-15');
  perform pg_temp.reset_session();
  if (v_summary ->> 'cash_sales_paise')::bigint <> 50000
     or (v_summary ->> 'cash_refunds_paise')::bigint <> 1000
     or (v_summary ->> 'cash_expenses_paise')::bigint <> 2000 then
    raise exception 'D6 FAILED: summary %', v_summary;
  end if;
  raise notice 'D6 ok: cash-day summary counts sales, refunds and expenses on the Kolkata business day';

  -- D7: closing computes expected cash from the carried-forward opening, and stores the difference.
  -- The 5000 deposit is a recorded cash movement; the close takes its total from the movements.
  insert into cash_movements (store_id, business_date, movement_type, amount_paise, reason)
  values (store_a, date '2031-01-15', 'deposit', 5000, 'test bank deposit');
  perform pg_temp.act_as(owner_a);
  v_close := close_cash_day(store_a, date '2031-01-15', 10000, 51500);
  perform pg_temp.reset_session();
  v_opening := (v_close ->> 'opening_paise')::bigint;
  v_expected := v_opening + 50000 - 1000 - 2000 - 5000;
  if (v_close ->> 'expected_paise')::bigint <> v_expected then
    raise exception 'D7 FAILED: expected % but close computed %', v_expected, v_close ->> 'expected_paise';
  end if;
  if (v_close ->> 'difference_paise')::bigint <> 51500 - v_expected then raise exception 'D7 FAILED: difference wrong'; end if;
  raise notice 'D7 ok: day closed with expected % and difference %', v_expected, 51500 - v_expected;

  -- D8: a closed day cannot be closed again.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select close_cash_day(%L, %L, %s, %s)', store_a, date '2031-01-15', 10000, 51500));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'D8 FAILED: day closed twice'; end if;
  raise notice 'D8 ok: second close refused (%)', v_msg;

  -- D9: the next day opens with the previous closing.
  perform pg_temp.act_as(owner_a);
  v_summary := cash_day_summary(store_a, date '2031-01-16');
  perform pg_temp.reset_session();
  if (v_summary ->> 'previous_closing_paise')::bigint <> 51500 then
    raise exception 'D9 FAILED: next day opening is % not 51500', v_summary ->> 'previous_closing_paise';
  end if;
  raise notice 'D9 ok: opening cash carries forward from the previous closing';

  -- D10: another store's owner cannot read or close this store's cash day.
  perform pg_temp.act_as(owner_b);
  v_msg := pg_temp.try(format('select cash_day_summary(%L, %L)', store_a, date '2031-01-16'));
  v_msg := v_msg || ' | ' || pg_temp.try(format('select close_cash_day(%L, %L, %s, %s)', store_a, date '2031-01-17', 0, 0));
  perform pg_temp.reset_session();
  if position('42501' in v_msg) = 0 then raise exception 'D10 FAILED: cross-store cash access allowed (%)', v_msg; end if;
  raise notice 'D10 ok: cross-store cash access refused';

  -- ----- Coupons (validation only).
  insert into coupons (store_id, code, discount_type, discount_bps, discount_paise, min_order_paise, is_active, ends_at) values
    (store_a, 'ZTEN10', 'percent', 1000, null, 0, true, null),
    (store_a, 'ZFLAT500', 'flat', null, 50000, 100000, true, null),
    (store_a, 'ZOFF', 'percent', 500, null, 0, false, null),
    (store_a, 'ZOLD', 'percent', 500, null, 0, true, '2020-01-01');

  perform pg_temp.act_as(owner_a);
  v_quote := coupon_quote(store_a, 'zten10', 12345);
  perform pg_temp.reset_session();
  if (v_quote ->> 'discount_paise')::bigint <> 1235 then raise exception 'C1 FAILED: percent discount %', v_quote; end if;
  raise notice 'C1 ok: percentage coupon rounds half-up and codes are case-insensitive';

  perform pg_temp.act_as(owner_a);
  v_quote := coupon_quote(store_a, 'ZFLAT500', 120000);
  perform pg_temp.reset_session();
  if (v_quote ->> 'discount_paise')::bigint <> 50000 then raise exception 'C2 FAILED: flat discount %', v_quote; end if;
  raise notice 'C2 ok: flat coupon applies when the minimum is met';

  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select coupon_quote(%L, %L, %s)', store_a, 'ZFLAT500', 80000));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'C3 FAILED: minimum order ignored'; end if;

  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select coupon_quote(%L, %L, %s)', store_a, 'ZOFF', 10000));
  v_quote_msg := pg_temp.try(format('select coupon_quote(%L, %L, %s)', store_a, 'ZOLD', 10000));
  v_status := pg_temp.try(format('select coupon_quote(%L, %L, %s)', store_a, 'NOPE', 10000));
  perform pg_temp.reset_session();
  if v_msg = 'ok' or v_quote_msg = 'ok' or v_status = 'ok' then
    raise exception 'C4 FAILED: inactive, expired or unknown coupon accepted (% | % | %)', v_msg, v_quote_msg, v_status;
  end if;
  raise notice 'C4 ok: inactive, expired and unknown coupons refused';

  perform pg_temp.act_as(owner_b);
  v_msg := pg_temp.try(format('select coupon_quote(%L, %L, %s)', store_a, 'ZTEN10', 10000));
  perform pg_temp.reset_session();
  if left(v_msg, 5) <> '42501' then raise exception 'C5 FAILED: cross-store coupon read allowed (%)', v_msg; end if;
  raise notice 'C5 ok: cross-store coupon lookup refused';

  raise notice 'Delivery, coupon and cash-day tests: all groups passed';
end $$;

rollback;
