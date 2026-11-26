-- 0011: delivery management, coupon validation and the daily cash reconciliation.
-- Coupons are validated here; they are NOT yet applied to order totals (that needs line-level discount
-- allocation so GST stays correct). Every function enforces store access and writes an audit entry.

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------

-- Schedules a delivery for a delivery order. The delivery charge can change only before any payment is started,
-- because a started payment is tied to the total it was created with.
create or replace function delivery_schedule(
  p_order uuid, p_scheduled_on date, p_assigned_to text, p_vehicle text, p_charge_paise bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_delivery uuid;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_order.store_id, array['owner','manager']);
  if v_order.fulfilment <> 'delivery' then raise exception 'this order is for pickup' using errcode = 'P0001'; end if;
  if v_order.order_status in ('COMPLETED','CANCELLED') then
    raise exception 'this order is %', v_order.order_status using errcode = 'P0001';
  end if;
  if p_charge_paise is null or p_charge_paise < 0 or p_charge_paise > 10000000 then
    raise exception 'delivery charge must be between 0 and 1,00,000 rupees' using errcode = 'P0001';
  end if;
  if exists (select 1 from deliveries where order_id = p_order and status = 'delivered') then
    raise exception 'this delivery is already delivered' using errcode = 'P0001';
  end if;

  if p_charge_paise <> v_order.delivery_paise then
    if exists (select 1 from payments where order_id = p_order) then
      raise exception 'the delivery charge is fixed once a payment has been started' using errcode = 'P0001';
    end if;
    update orders
       set delivery_paise = p_charge_paise,
           total_paise = subtotal_paise - discount_paise + tax_paise + p_charge_paise,
           updated_at = now()
     where id = p_order;
  end if;

  insert into deliveries (store_id, order_id, status, scheduled_on, delivery_charge_paise, assigned_to, vehicle_number)
  values (v_order.store_id, p_order, 'scheduled', p_scheduled_on, p_charge_paise,
          nullif(btrim(coalesce(p_assigned_to, '')), ''), nullif(btrim(coalesce(p_vehicle, '')), ''))
  on conflict (order_id) do update
     set scheduled_on = excluded.scheduled_on,
         assigned_to = excluded.assigned_to,
         vehicle_number = excluded.vehicle_number,
         delivery_charge_paise = excluded.delivery_charge_paise
  returning id into v_delivery;

  perform app.audit(v_order.store_id, 'delivery.scheduled', 'orders', p_order, null,
    jsonb_build_object('scheduled_on', p_scheduled_on, 'charge_paise', p_charge_paise));
  return v_delivery;
end $$;

-- Moves a delivery through scheduled -> assigned -> out_for_delivery -> delivered | failed (failed -> assigned to reschedule).
-- The order follows: OUT_FOR_DELIVERY on dispatch, COMPLETED on delivery (which needs the payment recorded as PAID).
create or replace function delivery_set_status(p_order uuid, p_to text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_delivery deliveries%rowtype;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_order.store_id, array['owner','manager','staff']);
  if v_order.fulfilment <> 'delivery' then raise exception 'this order is for pickup' using errcode = 'P0001'; end if;

  select * into v_delivery from deliveries where order_id = p_order for update;
  if not found then raise exception 'schedule the delivery first' using errcode = 'P0001'; end if;

  if not (
       (v_delivery.status = 'scheduled' and p_to = 'assigned')
    or (v_delivery.status = 'assigned' and p_to = 'out_for_delivery')
    or (v_delivery.status = 'out_for_delivery' and p_to in ('delivered','failed'))
    or (v_delivery.status = 'failed' and p_to = 'assigned')
  ) then
    raise exception 'cannot move a delivery from % to %', v_delivery.status, p_to using errcode = 'P0001';
  end if;

  -- Nothing leaves the shop unpaid: dispatch and delivery both need the payment recorded as PAID.
  if p_to in ('out_for_delivery','delivered') and v_order.payment_status <> 'PAID' then
    raise exception 'record the payment as received before dispatch or delivery' using errcode = 'P0001';
  end if;

  if p_to = 'out_for_delivery' and v_order.order_status <> 'OUT_FOR_DELIVERY' then
    perform transition_order_status(p_order, 'OUT_FOR_DELIVERY', p_note);
  elsif p_to = 'delivered' then
    perform transition_order_status(p_order, 'COMPLETED', p_note);
  end if;

  update deliveries
     set status = p_to,
         delivered_at = case when p_to = 'delivered' then now() else delivered_at end
   where id = v_delivery.id;

  perform app.audit(v_order.store_id, 'delivery.' || p_to, 'orders', p_order,
    jsonb_build_object('from', v_delivery.status), jsonb_build_object('to', p_to, 'note', p_note));
  return p_to;
end $$;

-- ---------------------------------------------------------------------------
-- Coupons (validation only; not applied to order totals yet)
-- ---------------------------------------------------------------------------

create or replace function coupon_quote(p_store uuid, p_code text, p_subtotal_paise bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c coupons%rowtype;
  v_discount bigint;
begin
  perform app.assert_store_access(p_store, array['owner','manager','staff']);
  if p_subtotal_paise is null or p_subtotal_paise < 0 then raise exception 'subtotal is invalid' using errcode = 'P0001'; end if;
  select * into c from coupons where store_id = p_store and code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'coupon code not recognised' using errcode = 'P0001'; end if;
  if not c.is_active then raise exception 'this coupon is switched off' using errcode = 'P0001'; end if;
  if c.starts_at is not null and now() < c.starts_at then raise exception 'this coupon is not valid yet' using errcode = 'P0001'; end if;
  if c.ends_at is not null and now() > c.ends_at then raise exception 'this coupon has expired' using errcode = 'P0001'; end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then raise exception 'this coupon has been fully used' using errcode = 'P0001'; end if;
  if p_subtotal_paise < c.min_order_paise then
    raise exception 'the order must be at least % paise to use this coupon', c.min_order_paise using errcode = 'P0001';
  end if;

  if c.discount_type = 'percent' then
    v_discount := round(p_subtotal_paise * c.discount_bps / 10000.0)::bigint;
  else
    v_discount := c.discount_paise;
  end if;
  v_discount := least(v_discount, p_subtotal_paise);
  return jsonb_build_object('coupon_id', c.id, 'code', c.code, 'discount_paise', v_discount);
end $$;

-- ---------------------------------------------------------------------------
-- Cash day reconciliation (Asia/Kolkata business day)
-- ---------------------------------------------------------------------------

create or replace function cash_day_summary(p_store uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sales bigint;
  v_refunds bigint;
  v_expenses bigint;
  v_previous bigint;
  v_has_previous boolean;
  v_closed boolean;
begin
  perform app.assert_store_access(p_store, array['owner','manager']);

  select coalesce(sum(p.amount_paise), 0) into v_sales
    from payments p
   where p.store_id = p_store and p.method = 'cash' and p.status = 'PAID'
     and (p.paid_at at time zone 'Asia/Kolkata')::date = p_date;

  select coalesce(sum(r.amount_paise), 0) into v_refunds
    from refunds r join payments p on p.id = r.payment_id
   where r.store_id = p_store and p.method = 'cash' and r.status = 'succeeded'
     and (r.processed_at at time zone 'Asia/Kolkata')::date = p_date;

  select coalesce(sum(e.amount_paise), 0) into v_expenses
    from expenses e
   where e.store_id = p_store and e.paid_from = 'cash' and e.expense_on = p_date;

  select actual_closing_paise into v_previous
    from cash_reconciliations
   where store_id = p_store and business_date < p_date
   order by business_date desc limit 1;
  v_has_previous := v_previous is not null;

  select exists (select 1 from cash_reconciliations where store_id = p_store and business_date = p_date) into v_closed;

  return jsonb_build_object(
    'business_date', p_date,
    'previous_closing_paise', coalesce(v_previous, 0),
    'has_previous_closing', v_has_previous,
    'cash_sales_paise', v_sales,
    'cash_refunds_paise', v_refunds,
    'cash_expenses_paise', v_expenses,
    'already_closed', v_closed);
end $$;

-- Closes a business day. Opening cash carries forward from the previous closing; the difference is stored.
-- A day can be closed once; a second close is refused by the unique (store, business_date) constraint and an explicit check.
create or replace function close_cash_day(
  p_store uuid, p_date date, p_opening_paise bigint, p_actual_paise bigint, p_deposits_paise bigint, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_summary jsonb;
  v_opening bigint;
  v_expected bigint;
  v_id uuid;
  v_actor uuid := coalesce(auth.uid(), p_actor);
begin
  if app.is_server() then
    if not exists (
      select 1 from store_owners so
      where so.store_id = p_store and so.profile_id = p_actor and so.is_active and so.role in ('owner','manager')
    ) then
      raise exception 'actor is not an owner or manager of this store' using errcode = '42501';
    end if;
  else
    perform app.assert_store_access(p_store, array['owner','manager']);
  end if;

  if p_actual_paise is null or p_actual_paise < 0 then raise exception 'enter the counted cash' using errcode = 'P0001'; end if;
  if p_deposits_paise is null or p_deposits_paise < 0 then raise exception 'deposits cannot be negative' using errcode = 'P0001'; end if;

  v_summary := cash_day_summary(p_store, p_date);
  if (v_summary ->> 'already_closed')::boolean then
    raise exception 'this day is already closed' using errcode = 'P0001';
  end if;
  if (v_summary ->> 'has_previous_closing')::boolean then
    v_opening := (v_summary ->> 'previous_closing_paise')::bigint;
  else
    if p_opening_paise is null or p_opening_paise < 0 then raise exception 'enter the opening cash' using errcode = 'P0001'; end if;
    v_opening := p_opening_paise;
  end if;

  v_expected := v_opening
              + (v_summary ->> 'cash_sales_paise')::bigint
              - (v_summary ->> 'cash_refunds_paise')::bigint
              - (v_summary ->> 'cash_expenses_paise')::bigint
              - p_deposits_paise;

  insert into cash_reconciliations (
    store_id, business_date, opening_paise, cash_sales_paise, cash_refunds_paise, cash_expenses_paise,
    cash_deposits_paise, expected_closing_paise, actual_closing_paise, difference_paise, closed_by)
  values (
    p_store, p_date, v_opening, (v_summary ->> 'cash_sales_paise')::bigint, (v_summary ->> 'cash_refunds_paise')::bigint,
    (v_summary ->> 'cash_expenses_paise')::bigint, p_deposits_paise, v_expected, p_actual_paise,
    p_actual_paise - v_expected, v_actor)
  returning id into v_id;

  perform app.audit(p_store, 'cash.day_closed', 'cash_reconciliations', v_id, null,
    jsonb_build_object('business_date', p_date, 'expected_paise', v_expected, 'actual_paise', p_actual_paise,
                       'difference_paise', p_actual_paise - v_expected));

  return jsonb_build_object('id', v_id, 'expected_paise', v_expected, 'actual_paise', p_actual_paise,
                            'difference_paise', p_actual_paise - v_expected, 'opening_paise', v_opening);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  delivery_schedule(uuid, date, text, text, bigint), delivery_set_status(uuid, text, text),
  coupon_quote(uuid, text, bigint), cash_day_summary(uuid, date), close_cash_day(uuid, date, bigint, bigint, bigint, uuid)
from public, anon;

grant execute on function
  delivery_schedule(uuid, date, text, text, bigint), delivery_set_status(uuid, text, text),
  coupon_quote(uuid, text, bigint), cash_day_summary(uuid, date), close_cash_day(uuid, date, bigint, bigint, bigint, uuid)
to authenticated;
