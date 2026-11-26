-- 0039: sensitive database operations check the permission they belong to, not a role list.
-- Server paths (service role or a direct postgres session) keep their existing bypass; the actor on those paths
-- must hold the permission. Owners hold every permission implicitly. Platform administrators are not restricted.

create or replace function app.assert_store_permission(p_store uuid, p_key text)
returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  if app.is_server() or app.is_platform_admin() then
    return;
  end if;
  if not app.has_store_permission(p_store, p_key) then
    raise exception 'forbidden: the % permission is required for this store', p_key using errcode = '42501';
  end if;
end $$;

create or replace function app.assert_store_manager_permission(p_store uuid, p_actor uuid, p_key text)
returns uuid
language plpgsql stable security definer set search_path = public, app as $$
begin
  if app.is_server() then
    if not exists (
      select 1 from store_owners so
      where so.store_id = p_store and so.profile_id = p_actor and so.is_active
        and (so.role = 'owner' or exists (
          select 1 from store_member_permissions smp
          where smp.store_id = so.store_id and smp.profile_id = so.profile_id and smp.permission_key = p_key))
    ) then
      raise exception 'actor does not hold the % permission for this store', p_key using errcode = '42501';
    end if;
    return p_actor;
  end if;
  perform app.assert_store_permission(p_store, p_key);
  return coalesce(auth.uid(), p_actor);
end $$;

CREATE OR REPLACE FUNCTION public.adjust_stock(p_variant uuid, p_delta bigint, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_row inventory%rowtype;
begin
  select store_id into v_store from product_variants where id = p_variant;
  if v_store is null then raise exception 'unknown variant' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'inventory_management');

  select * into v_row from inventory where variant_id = p_variant for update;
  if v_row.on_hand + p_delta < v_row.reserved then
    raise exception 'adjustment would drop on-hand (%) below reserved stock (%)',
      v_row.on_hand + p_delta, v_row.reserved using errcode = 'P0001';
  end if;

  update inventory set on_hand = on_hand + p_delta, updated_at = now() where id = v_row.id;
  insert into stock_movements (store_id, variant_id, movement_type, quantity, actor_id, note)
  values (v_store, p_variant, 'adjustment', p_delta, auth.uid(), p_reason);
  perform app.audit(v_store, 'inventory.adjusted', 'inventory', v_row.id,
    jsonb_build_object('on_hand', v_row.on_hand), jsonb_build_object('on_hand', v_row.on_hand + p_delta, 'reason', p_reason));
  return v_row.on_hand + p_delta;
end $function$;

CREATE OR REPLACE FUNCTION public.adjust_batch_stock(p_batch uuid, p_delta bigint, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch inventory_batches%rowtype;
  v_inv inventory%rowtype;
begin
  select * into v_batch from inventory_batches where id = p_batch for update;
  if not found then raise exception 'batch not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_batch.store_id, 'inventory_management');
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000000000 then
    raise exception 'adjustment must be a non-zero whole number' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason of at least 3 characters' using errcode = 'P0001';
  end if;
  if v_batch.on_hand + p_delta < v_batch.reserved then
    raise exception 'adjustment would drop batch on-hand (%) below reserved (%)', v_batch.on_hand + p_delta, v_batch.reserved
      using errcode = 'P0001';
  end if;

  select * into v_inv from inventory where variant_id = v_batch.variant_id and store_id = v_batch.store_id for update;
  if not found then raise exception 'inventory row missing for variant' using errcode = 'P0001'; end if;
  if v_inv.on_hand + p_delta < v_inv.reserved then
    raise exception 'adjustment would drop variant on-hand (%) below reserved (%)', v_inv.on_hand + p_delta, v_inv.reserved
      using errcode = 'P0001';
  end if;
  if v_inv.on_hand + p_delta < 0 then
    raise exception 'inventory cannot become negative' using errcode = 'P0001';
  end if;

  update inventory_batches set on_hand = on_hand + p_delta, updated_at = now() where id = p_batch;
  update inventory set on_hand = on_hand + p_delta, updated_at = now() where id = v_inv.id;
  insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, actor_id, note)
  values (v_batch.store_id, v_batch.variant_id, p_batch, 'adjustment', p_delta, auth.uid(), p_reason);
  perform app.audit(v_batch.store_id, 'batch.adjusted', 'inventory_batches', p_batch,
    jsonb_build_object('on_hand', v_batch.on_hand), jsonb_build_object('on_hand', v_batch.on_hand + p_delta, 'reason', p_reason));
  return v_batch.on_hand + p_delta;
end $function$;

CREATE OR REPLACE FUNCTION public.batch_consistency(p_variant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_on bigint;
  v_batch_on bigint;
begin
  select store_id into v_store from product_variants where id = p_variant;
  if v_store is null then raise exception 'unknown variant' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'inventory_management');
  select coalesce(on_hand, 0) into v_on from inventory where variant_id = p_variant;
  select coalesce(sum(on_hand), 0) into v_batch_on from inventory_batches where variant_id = p_variant;
  return jsonb_build_object(
    'variant_on_hand', coalesce(v_on, 0),
    'batch_on_hand', v_batch_on,
    'untracked_on_hand', coalesce(v_on, 0) - v_batch_on,
    'consistent', v_batch_on <= coalesce(v_on, 0));
end $function$;

CREATE OR REPLACE FUNCTION public.mark_damaged(p_variant uuid, p_qty bigint, p_reason text, p_batch uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_row inventory%rowtype;
begin
  select store_id into v_store from product_variants where id = p_variant;
  perform app.assert_store_permission(v_store, 'inventory_management');

  select * into v_row from inventory where variant_id = p_variant for update;
  if v_row.on_hand - v_row.reserved < p_qty then
    raise exception 'cannot mark % damaged: only % unreserved units', p_qty, v_row.on_hand - v_row.reserved using errcode = 'P0001';
  end if;

  update inventory set on_hand = on_hand - p_qty, damaged = damaged + p_qty, updated_at = now() where id = v_row.id;
  if p_batch is not null then
    update inventory_batches set on_hand = on_hand - p_qty, damaged = damaged + p_qty, updated_at = now()
    where id = p_batch and variant_id = p_variant and on_hand >= p_qty;
  end if;

  insert into damaged_stock (store_id, variant_id, batch_id, quantity, reason, reported_by)
  values (v_store, p_variant, p_batch, p_qty, p_reason, auth.uid());
  insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, actor_id, note)
  values (v_store, p_variant, p_batch, 'damage', -p_qty, auth.uid(), p_reason);
end $function$;

CREATE OR REPLACE FUNCTION public.create_inventory_batch(p_variant uuid, p_batch_number text, p_shade text, p_calibre text, p_manufacturing_date date, p_supplier uuid, p_opening_quantity bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_batch uuid;
  v_number text := btrim(coalesce(p_batch_number, ''));
begin
  select store_id into v_store from product_variants where id = p_variant;
  if v_store is null then raise exception 'unknown variant' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'tile_batch_management');
  if length(v_number) < 1 or length(v_number) > 60 then
    raise exception 'batch number must be 1 to 60 characters' using errcode = 'P0001';
  end if;
  if p_opening_quantity is null or p_opening_quantity < 0 or p_opening_quantity > 1000000000 then
    raise exception 'opening quantity must be between 0 and 1000000000' using errcode = 'P0001';
  end if;
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and store_id = v_store) then
    raise exception 'supplier does not belong to this store' using errcode = 'P0001';
  end if;

  insert into inventory_batches (store_id, variant_id, supplier_id, batch_number, shade_code, calibre, manufacturing_date, on_hand)
  values (v_store, p_variant, p_supplier, v_number,
          nullif(btrim(coalesce(p_shade, '')), ''), nullif(btrim(coalesce(p_calibre, '')), ''),
          p_manufacturing_date, p_opening_quantity)
  returning id into v_batch;

  if p_opening_quantity > 0 then
    update inventory set on_hand = on_hand + p_opening_quantity, updated_at = now()
    where variant_id = p_variant and store_id = v_store;
    if not found then
      insert into inventory (store_id, variant_id, on_hand) values (v_store, p_variant, p_opening_quantity);
    end if;
    insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, actor_id, note)
    values (v_store, p_variant, v_batch, 'opening', p_opening_quantity, auth.uid(), 'batch ' || v_number);
  end if;

  perform app.audit(v_store, 'batch.created', 'inventory_batches', v_batch, null,
    jsonb_build_object('batch', v_number, 'opening', p_opening_quantity));
  return v_batch;
end $function$;

CREATE OR REPLACE FUNCTION public.update_inventory_batch(p_batch uuid, p_shade text, p_calibre text, p_manufacturing_date date, p_supplier uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  select store_id into v_store from inventory_batches where id = p_batch;
  if v_store is null then raise exception 'batch not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'tile_batch_management');
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and store_id = v_store) then
    raise exception 'supplier does not belong to this store' using errcode = 'P0001';
  end if;

  update inventory_batches set
    shade_code = nullif(btrim(coalesce(p_shade, '')), ''),
    calibre = nullif(btrim(coalesce(p_calibre, '')), ''),
    manufacturing_date = p_manufacturing_date,
    supplier_id = p_supplier,
    updated_at = now()
  where id = p_batch;
  perform app.audit(v_store, 'batch.updated', 'inventory_batches', p_batch, null,
    jsonb_build_object('shade', p_shade, 'calibre', p_calibre, 'supplier', p_supplier));
end $function$;

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(p_order uuid, p_amount_received_paise bigint, p_note text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_payment payments%rowtype;
  v_actor uuid := coalesce(auth.uid(), p_actor);
begin
  -- The acting owner is the signed-in user; server calls must name the owner explicitly.
  if v_actor is null then
    raise exception 'an acting owner is required' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if not app.is_server() then
    perform app.assert_store_permission(v_order.store_id, 'cash_confirmation');
  elsif not exists (
    select 1 from store_owners so
    where so.store_id = v_order.store_id and so.profile_id = v_actor
      and so.is_active and so.role in ('owner','manager')
  ) then
    raise exception 'actor is not an owner or manager of this store' using errcode = '42501';
  end if;

  select * into v_payment from payments
  where order_id = p_order and method = 'cash' and status = 'CASH_PENDING'
  for update;
  if not found then raise exception 'no pending cash payment for this order' using errcode = 'P0001'; end if;

  if p_amount_received_paise <> v_payment.amount_paise then
    raise exception 'received amount % does not match amount due %', p_amount_received_paise, v_payment.amount_paise
      using errcode = 'P0001';
  end if;

  update payments set status = 'PAID', paid_at = now(), updated_at = now() where id = v_payment.id;
  update orders set payment_status = 'PAID', paid_at = now(), updated_at = now() where id = p_order;

  insert into cash_confirmations (store_id, order_id, payment_id, amount_due_paise, amount_received_paise, confirmed_by, note)
  values (v_order.store_id, p_order, v_payment.id, v_payment.amount_paise, p_amount_received_paise,
          v_actor, p_note);

  perform consume_order_stock(p_order);
  if v_order.order_status = 'PLACED' then
    perform app.set_order_status(p_order, 'CONFIRMED', 'cash collected');
  end if;

  perform app.audit(v_order.store_id, 'cash.confirmed', 'orders', p_order, null,
    jsonb_build_object('amount_paise', p_amount_received_paise, 'note', p_note));
  return 'paid';
end $function$;

CREATE OR REPLACE FUNCTION public.cash_day_summary(p_store uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sales bigint;
  v_refunds bigint;
  v_expenses bigint;
  v_in bigint;
  v_deposits bigint;
  v_withdrawals bigint;
  v_out bigint;
  v_previous bigint;
  v_has_previous boolean;
  v_closed boolean;
begin
  perform app.assert_store_permission(p_store, 'cash_confirmation');

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

  select
    coalesce(sum(case when m.movement_type = 'manual_in' then m.amount_paise end), 0),
    coalesce(sum(case when m.movement_type = 'deposit' then m.amount_paise end), 0),
    coalesce(sum(case when m.movement_type = 'withdrawal' then m.amount_paise end), 0),
    coalesce(sum(case when m.movement_type = 'manual_out' then m.amount_paise end), 0)
    into v_in, v_deposits, v_withdrawals, v_out
    from cash_movements m
   where m.store_id = p_store and m.business_date = p_date;

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
    'cash_manual_in_paise', v_in,
    'cash_deposits_paise', v_deposits,
    'cash_withdrawals_paise', v_withdrawals,
    'cash_manual_out_paise', v_out,
    'already_closed', v_closed);
end $function$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_payment payments%rowtype;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_order.store_id, 'order_management');

  if v_order.order_status in ('COMPLETED','CANCELLED') then
    raise exception 'order cannot be cancelled from status %', v_order.order_status using errcode = 'P0001';
  end if;

  select * into v_payment from payments
  where order_id = p_order and status in ('PAID','PENDING','CASH_PENDING','PROCESSING','FAILED','EXPIRED')
  order by created_at desc limit 1;

  if v_order.payment_status = 'PAID' then
    perform app.restock_consumed(p_order);
    insert into refunds (store_id, payment_id, order_id, amount_paise, reason, requested_by)
    values (v_order.store_id, v_payment.id, p_order, v_order.total_paise, 'order cancelled: ' || p_reason, auth.uid());
  else
    perform release_order_reservation(p_order, 'order cancelled');
    update payments set status = 'FAILED', failure_reason = 'order cancelled', updated_at = now()
    where order_id = p_order and status in ('PENDING','CASH_PENDING','PROCESSING');
  end if;

  update orders set
      order_status = 'CANCELLED',
      payment_status = case when payment_status = 'PAID' then payment_status else 'FAILED' end,
      cancelled_at = now(),
      cancel_reason = p_reason,
      updated_at = now()
  where id = p_order;

  insert into order_status_history (order_id, store_id, from_status, to_status, actor_id, note)
  values (p_order, v_order.store_id, v_order.order_status, 'CANCELLED', auth.uid(), p_reason);

  perform app.audit(v_order.store_id, 'order.cancelled', 'orders', p_order,
    jsonb_build_object('order_status', v_order.order_status), jsonb_build_object('reason', p_reason));
  return 'CANCELLED';
end $function$;

CREATE OR REPLACE FUNCTION public.transition_order_status(p_order uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_order.store_id, 'order_management');

  if not app.is_valid_transition(v_order.order_status, p_to, v_order.fulfilment) then
    raise exception 'invalid order transition % -> % (%)', v_order.order_status, p_to, v_order.fulfilment
      using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'PAID' then
    raise exception 'order is not paid (payment status %)', v_order.payment_status using errcode = 'P0001';
  end if;

  perform app.set_order_status(p_order, p_to, p_note);
  return p_to;
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_schedule(p_order uuid, p_scheduled_on date, p_assigned_to text, p_vehicle text, p_charge_paise bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_delivery uuid;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_order.store_id, 'order_management');
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
end $function$;

CREATE OR REPLACE FUNCTION public.delivery_set_status(p_order uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_delivery deliveries%rowtype;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_order.store_id, 'order_management');
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
end $function$;

CREATE OR REPLACE FUNCTION public.create_purchase_order(p_supplier uuid, p_expected date, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_po uuid;
  v_number text;
  v_line jsonb;
  v_variant uuid;
  v_qty bigint;
  v_cost bigint;
  v_total bigint := 0;
begin
  select store_id into v_store from suppliers where id = p_supplier and is_active;
  if v_store is null then raise exception 'supplier not found or inactive' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'purchasing');
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a purchase order needs at least one line' using errcode = 'P0001';
  end if;

  v_number := app.next_number(v_store, 'po', 'PO');
  insert into purchase_orders (store_id, supplier_id, po_number, status, expected_on, total_paise, created_by)
  values (v_store, p_supplier, v_number, 'draft', p_expected, 0, auth.uid())
  returning id into v_po;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant := (v_line ->> 'variant_id')::uuid;
    v_qty := (v_line ->> 'quantity')::bigint;
    v_cost := (v_line ->> 'unit_cost_paise')::bigint;
    if not exists (select 1 from product_variants where id = v_variant and store_id = v_store) then
      raise exception 'variant does not belong to this store' using errcode = 'P0001';
    end if;
    if v_qty <= 0 or v_qty > 1000000000 then raise exception 'quantity must be between 1 and 1000000000' using errcode = 'P0001'; end if;
    if v_cost < 0 then raise exception 'unit cost cannot be negative' using errcode = 'P0001'; end if;
    insert into purchase_order_items (purchase_order_id, store_id, variant_id, quantity_ordered, unit_cost_paise)
    values (v_po, v_store, v_variant, v_qty, v_cost);
    v_total := v_total + v_qty * v_cost;
  end loop;

  update purchase_orders set total_paise = v_total, updated_at = now() where id = v_po;
  perform app.audit(v_store, 'purchase_order.created', 'purchase_orders', v_po, null,
    jsonb_build_object('po', v_number, 'total_paise', v_total));
  return v_po;
end $function$;

CREATE OR REPLACE FUNCTION public.set_purchase_order_status(p_po uuid, p_to text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_po purchase_orders%rowtype;
  v_item purchase_order_items%rowtype;
  v_received bigint;
begin
  select * into v_po from purchase_orders where id = p_po for update;
  if not found then raise exception 'purchase order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_po.store_id, 'purchasing');

  if v_po.status = 'draft' and p_to = 'sent' then
    for v_item in select * from purchase_order_items where purchase_order_id = p_po loop
      update inventory set incoming = incoming + (v_item.quantity_ordered - v_item.quantity_received), updated_at = now()
      where variant_id = v_item.variant_id and store_id = v_po.store_id;
    end loop;
  elsif v_po.status in ('draft', 'sent') and p_to = 'cancelled' then
    select coalesce(sum(quantity_received), 0) into v_received from purchase_order_items where purchase_order_id = p_po;
    if v_received > 0 then
      raise exception 'cannot cancel a purchase order after goods were received' using errcode = 'P0001';
    end if;
    if v_po.status = 'sent' then
      for v_item in select * from purchase_order_items where purchase_order_id = p_po loop
        update inventory set incoming = greatest(incoming - (v_item.quantity_ordered - v_item.quantity_received), 0), updated_at = now()
        where variant_id = v_item.variant_id and store_id = v_po.store_id;
      end loop;
    end if;
  else
    raise exception 'cannot move a % purchase order to %', v_po.status, p_to using errcode = 'P0001';
  end if;

  update purchase_orders set status = p_to, updated_at = now() where id = p_po;
  perform app.audit(v_po.store_id, 'purchase_order.status', 'purchase_orders', p_po,
    jsonb_build_object('status', v_po.status), jsonb_build_object('status', p_to));
  return p_to;
end $function$;

CREATE OR REPLACE FUNCTION public.receive_goods(p_po uuid, p_lines jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_po purchase_orders%rowtype;
  v_grn uuid;
  v_grn_number text;
  v_line jsonb;
  v_poi purchase_order_items%rowtype;
  v_qty bigint;
  v_dmg bigint;
  v_batch_id uuid;
  v_total_items integer;
  v_done_items integer;
begin
  select * into v_po from purchase_orders where id = p_po for update;
  if not found then raise exception 'purchase order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_po.store_id, 'purchasing');
  if v_po.status in ('draft','cancelled','received') then
    raise exception 'cannot receive goods against a % purchase order', v_po.status using errcode = 'P0001';
  end if;

  v_grn_number := app.next_number(v_po.store_id, 'grn', 'GRN');
  insert into goods_receipts (store_id, purchase_order_id, supplier_id, grn_number, received_by, notes)
  values (v_po.store_id, p_po, v_po.supplier_id, v_grn_number, auth.uid(), p_notes)
  returning id into v_grn;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_poi from purchase_order_items
    where id = (v_line ->> 'po_item_id')::uuid and purchase_order_id = p_po
    for update;
    if not found then raise exception 'line does not belong to this purchase order' using errcode = 'P0001'; end if;

    v_qty := (v_line ->> 'quantity')::bigint;
    v_dmg := coalesce((v_line ->> 'damaged')::bigint, 0);
    if v_qty <= 0 or v_dmg < 0 or v_dmg > v_qty then
      raise exception 'invalid quantities for line %', v_poi.id using errcode = 'P0001';
    end if;
    if v_poi.quantity_received + v_qty > v_poi.quantity_ordered then
      raise exception 'over-receipt on line %: ordered %, already received %, receiving %',
        v_poi.id, v_poi.quantity_ordered, v_poi.quantity_received, v_qty using errcode = 'P0001';
    end if;

    update purchase_order_items set quantity_received = quantity_received + v_qty where id = v_poi.id;

    insert into goods_receipt_items (goods_receipt_id, store_id, purchase_order_item_id, variant_id, batch_number,
                                     quantity_received, quantity_damaged, unit_cost_paise)
    values (v_grn, v_po.store_id, v_poi.id, v_poi.variant_id, v_line ->> 'batch_number',
            v_qty, v_dmg, v_poi.unit_cost_paise);

    v_batch_id := null;
    if nullif(v_line ->> 'batch_number', '') is not null then
      insert into inventory_batches (store_id, variant_id, supplier_id, batch_number, on_hand, damaged)
      values (v_po.store_id, v_poi.variant_id, v_po.supplier_id, v_line ->> 'batch_number', v_qty - v_dmg, v_dmg)
      on conflict (store_id, variant_id, batch_number)
      do update set on_hand = inventory_batches.on_hand + excluded.on_hand,
                    damaged = inventory_batches.damaged + excluded.damaged,
                    updated_at = now()
      returning id into v_batch_id;
    end if;

    update inventory set on_hand = on_hand + (v_qty - v_dmg),
           damaged = damaged + v_dmg,
           incoming = greatest(incoming - v_qty, 0),
           updated_at = now()
    where variant_id = v_poi.variant_id and store_id = v_po.store_id;
    if not found then
      insert into inventory (store_id, variant_id, on_hand, damaged)
      values (v_po.store_id, v_poi.variant_id, v_qty - v_dmg, v_dmg);
    end if;

    insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, reference_type, reference_id, actor_id, note)
    values (v_po.store_id, v_poi.variant_id, v_batch_id, 'purchase', v_qty - v_dmg, 'goods_receipt', v_grn, auth.uid(), v_grn_number);

    if v_dmg > 0 then
      insert into damaged_stock (store_id, variant_id, batch_id, quantity, reason, reported_by)
      values (v_po.store_id, v_poi.variant_id, v_batch_id, v_dmg, 'damaged on receipt ' || v_grn_number, auth.uid());
    end if;
  end loop;

  select count(*), count(*) filter (where quantity_received >= quantity_ordered)
    into v_total_items, v_done_items
  from purchase_order_items where purchase_order_id = p_po;

  update purchase_orders set
      status = case when v_done_items = v_total_items then 'received' else 'partially_received' end,
      updated_at = now()
  where id = p_po;

  perform app.audit(v_po.store_id, 'goods.received', 'goods_receipts', v_grn,
    null, jsonb_build_object('grn', v_grn_number, 'po', v_po.po_number));
  return v_grn;
end $function$;

CREATE OR REPLACE FUNCTION public.record_supplier_invoice(p_supplier uuid, p_po uuid, p_invoice_number text, p_invoice_date date, p_amount bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_id uuid;
begin
  select store_id into v_store from suppliers where id = p_supplier;
  if v_store is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'supplier_management');
  if p_amount is null or p_amount <= 0 then raise exception 'invoice amount must be positive' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_invoice_number, ''))) < 1 then raise exception 'invoice number is required' using errcode = 'P0001'; end if;
  if p_po is not null and not exists (select 1 from purchase_orders where id = p_po and store_id = v_store and supplier_id = p_supplier) then
    raise exception 'purchase order does not match this supplier' using errcode = 'P0001';
  end if;

  insert into supplier_invoices (store_id, supplier_id, purchase_order_id, invoice_number, invoice_date, amount_paise)
  values (v_store, p_supplier, p_po, btrim(p_invoice_number), p_invoice_date, p_amount)
  returning id into v_id;
  perform app.audit(v_store, 'supplier_invoice.recorded', 'supplier_invoices', v_id, null,
    jsonb_build_object('invoice', p_invoice_number, 'amount_paise', p_amount));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(p_supplier uuid, p_invoice uuid, p_amount bigint, p_method text, p_reference text, p_paid_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_balance bigint;
  v_invoice_due bigint;
  v_id uuid;
begin
  select store_id into v_store from suppliers where id = p_supplier for update;
  if v_store is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'supplier_management');
  if p_amount is null or p_amount <= 0 then raise exception 'payment must be positive' using errcode = 'P0001'; end if;
  if p_method not in ('cash','bank','upi','cheque') then raise exception 'unknown payment method' using errcode = 'P0001'; end if;

  v_balance := supplier_balance(p_supplier);
  if p_amount > v_balance then
    raise exception 'payment (%) exceeds the outstanding balance (%)', p_amount, v_balance using errcode = 'P0001';
  end if;

  if p_invoice is not null then
    select amount_paise - coalesce((select sum(amount_paise) from supplier_payments where supplier_invoice_id = p_invoice), 0)
      into v_invoice_due
    from supplier_invoices where id = p_invoice and supplier_id = p_supplier and store_id = v_store;
    if v_invoice_due is null then raise exception 'invoice does not belong to this supplier' using errcode = 'P0001'; end if;
    if p_amount > v_invoice_due then
      raise exception 'payment (%) exceeds the invoice balance (%)', p_amount, v_invoice_due using errcode = 'P0001';
    end if;
  end if;

  insert into supplier_payments (store_id, supplier_id, supplier_invoice_id, amount_paise, paid_on, method, reference)
  values (v_store, p_supplier, p_invoice, p_amount, coalesce(p_paid_on, current_date), p_method, nullif(btrim(coalesce(p_reference, '')), ''))
  returning id into v_id;
  perform app.audit(v_store, 'supplier_payment.recorded', 'supplier_payments', v_id, null,
    jsonb_build_object('amount_paise', p_amount, 'method', p_method));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.supplier_balance(p_supplier uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
  v_invoiced bigint;
  v_paid bigint;
begin
  select store_id into v_store from suppliers where id = p_supplier;
  if v_store is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'supplier_management');
  select coalesce(sum(amount_paise), 0) into v_invoiced from supplier_invoices where supplier_id = p_supplier;
  select coalesce(sum(amount_paise), 0) into v_paid from supplier_payments where supplier_id = p_supplier;
  return v_invoiced - v_paid;
end $function$;

CREATE OR REPLACE FUNCTION public.record_credit_entry(p_customer uuid, p_entry_type text, p_amount_paise bigint, p_due_on date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer customers%rowtype;
  v_signed bigint;
  v_balance bigint;
begin
  select * into v_customer from customers where id = p_customer for update;
  if not found then raise exception 'customer not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_customer.store_id, 'credit_management');

  if p_entry_type = 'sale' then
    v_signed := abs(p_amount_paise);
  elsif p_entry_type = 'payment' then
    v_signed := -abs(p_amount_paise);
  else
    v_signed := p_amount_paise;
  end if;

  v_balance := customer_balance(p_customer) + v_signed;
  if p_entry_type = 'sale' and not v_customer.is_credit_approved then
    raise exception 'customer is not approved for credit' using errcode = 'P0001';
  end if;
  if p_entry_type = 'sale' and v_balance > v_customer.credit_limit_paise then
    raise exception 'credit limit exceeded (limit %, balance would be %)', v_customer.credit_limit_paise, v_balance
      using errcode = 'P0001';
  end if;
  if v_balance < 0 then
    raise exception 'payment exceeds outstanding balance' using errcode = 'P0001';
  end if;

  insert into credit_ledger (store_id, customer_id, entry_type, amount_paise, due_on, note)
  values (v_customer.store_id, p_customer, p_entry_type, v_signed, p_due_on, p_note);
  return v_balance;
end $function$;

CREATE OR REPLACE FUNCTION public.customer_balance(p_customer uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  select store_id into v_store from customers where id = p_customer;
  if v_store is null then raise exception 'customer not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'customer_management');
  return (select coalesce(sum(amount_paise), 0) from credit_ledger where customer_id = p_customer);
end $function$;

CREATE OR REPLACE FUNCTION public.pos_save_bill(p_bill uuid, p_store uuid, p_customer uuid, p_items jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bill uuid;
  v_status text;
  v_item jsonb;
  v_variant uuid;
  v_qty numeric;
  v_disc bigint;
  v_order integer := 0;
begin
  perform app.assert_store_permission(p_store, 'pos_billing');
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a bill needs at least one item' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'a bill can hold at most 100 items' using errcode = 'P0001'; end if;
  if p_customer is not null and not exists (select 1 from customers where id = p_customer and store_id = p_store) then
    raise exception 'customer does not belong to this store' using errcode = 'P0001';
  end if;

  if p_bill is null then
    insert into pos_bills (store_id, bill_reference, status, customer_id, note, created_by)
    values (p_store, app.next_number(p_store, 'pos', 'POS'), 'HELD', p_customer, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    returning id into v_bill;
  else
    select status into v_status from pos_bills where id = p_bill and store_id = p_store for update;
    if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
    if v_status <> 'HELD' then raise exception 'only held bills can be edited (this bill is %)', v_status using errcode = 'P0001'; end if;
    v_bill := p_bill;
    update pos_bills set customer_id = p_customer, note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
    where id = v_bill;
    delete from pos_bill_items where bill_id = v_bill;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_order := v_order + 1;
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_disc := coalesce((v_item ->> 'line_discount_paise')::bigint, 0);
    if not exists (select 1 from product_variants where id = v_variant and store_id = p_store and is_active) then
      raise exception 'variant is not an active product of this store' using errcode = 'P0001';
    end if;
    if v_qty <= 0 or v_qty > 999 then raise exception 'quantity must be greater than 0 and at most 999' using errcode = 'P0001'; end if;
    if v_disc < 0 then raise exception 'discount cannot be negative' using errcode = 'P0001'; end if;
    insert into pos_bill_items (bill_id, store_id, variant_id, quantity, line_discount_paise, sort_order)
    values (v_bill, p_store, v_variant, v_qty, v_disc, v_order);
  end loop;

  perform app.audit(p_store, 'pos.saved', 'pos_bills', v_bill, null, jsonb_build_object('items', v_order));
  return v_bill;
end $function$;

CREATE OR REPLACE FUNCTION public.pos_quote_bill(p_bill uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store uuid;
begin
  select store_id into v_store from pos_bills where id = p_bill;
  if v_store is null then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_store, 'pos_billing');
  return app.price_pos_bill(p_bill);
end $function$;

CREATE OR REPLACE FUNCTION public.pos_sync_bill(p_bill uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bill pos_bills%rowtype;
  v_order orders%rowtype;
  v_invoice_prefix text;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_bill.store_id, 'pos_billing');
  if v_bill.status <> 'AWAITING_PAYMENT' then return v_bill.status; end if;

  select * into v_order from orders where id = v_bill.order_id for update;
  if v_order.payment_status <> 'PAID' then return 'AWAITING_PAYMENT'; end if;

  if not exists (select 1 from invoices where order_id = v_order.id) then
    select invoice_prefix into v_invoice_prefix from store_settings where store_id = v_bill.store_id;
    insert into invoices (store_id, order_id, invoice_number, invoice_date, taxable_paise, tax_paise, total_paise)
    values (v_bill.store_id, v_order.id, app.next_number(v_bill.store_id, 'invoice', coalesce(v_invoice_prefix, 'INV')),
            current_date, v_order.taxable_paise, v_order.tax_paise, v_order.total_paise);
  end if;

  update pos_bills set status = 'COMPLETED', completed_at = now(), updated_at = now() where id = p_bill;
  perform app.audit(v_bill.store_id, 'pos.completed', 'orders', v_order.id, null,
    jsonb_build_object('bill', v_bill.bill_reference));
  return 'COMPLETED';
end $function$;

CREATE OR REPLACE FUNCTION public.pos_cancel_bill(p_bill uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bill pos_bills%rowtype;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_bill.store_id, 'pos_billing');
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'give a reason of at least 3 characters' using errcode = 'P0001'; end if;
  if v_bill.status <> 'HELD' then
    raise exception 'this bill is %; cancel the order instead', v_bill.status using errcode = 'P0001';
  end if;
  update pos_bills set status = 'CANCELLED', cancelled_at = now(), cancel_reason = p_reason, updated_at = now() where id = p_bill;
  perform app.audit(v_bill.store_id, 'pos.cancelled', 'pos_bills', p_bill, null, jsonb_build_object('reason', p_reason));
  return 'CANCELLED';
end $function$;

CREATE OR REPLACE FUNCTION public.pos_set_coupon(p_bill uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bill pos_bills%rowtype;
  v_coupon coupons%rowtype;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_bill.store_id, 'store_settings');
  if v_bill.status <> 'HELD' then raise exception 'coupons can only be changed on a held bill' using errcode = 'P0001'; end if;

  if p_code is null or btrim(p_code) = '' then
    update pos_bills set coupon_id = null, updated_at = now() where id = p_bill;
    return app.price_pos_bill(p_bill);
  end if;

  select * into v_coupon from coupons where store_id = v_bill.store_id and code = upper(btrim(p_code));
  if not found then raise exception 'coupon code not recognised' using errcode = 'P0001'; end if;
  update pos_bills set coupon_id = v_coupon.id, updated_at = now() where id = p_bill;
  return app.price_pos_bill(p_bill);
end $function$;

CREATE OR REPLACE FUNCTION public.coupon_quote(p_store uuid, p_code text, p_subtotal_paise bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c coupons%rowtype;
  v_discount bigint;
begin
  perform app.assert_store_permission(p_store, 'store_settings');
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
end $function$;

CREATE OR REPLACE FUNCTION public.close_cash_day(p_store uuid, p_date date, p_opening_paise bigint, p_actual_paise bigint, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_summary jsonb;
  v_opening bigint;
  v_expected bigint;
  v_id uuid;
  v_actor uuid;
begin
  v_actor := app.assert_store_manager_permission(p_store, p_actor, 'cash_confirmation');
  if p_actual_paise is null or p_actual_paise < 0 then raise exception 'enter the counted cash' using errcode = 'P0001'; end if;

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
              + (v_summary ->> 'cash_manual_in_paise')::bigint
              - (v_summary ->> 'cash_deposits_paise')::bigint
              - (v_summary ->> 'cash_withdrawals_paise')::bigint
              - (v_summary ->> 'cash_manual_out_paise')::bigint;

  insert into cash_reconciliations (
    store_id, business_date, opening_paise, cash_sales_paise, cash_refunds_paise, cash_expenses_paise,
    cash_manual_in_paise, cash_deposits_paise, cash_withdrawals_paise, cash_manual_out_paise,
    expected_closing_paise, actual_closing_paise, difference_paise, closed_by)
  values (
    p_store, p_date, v_opening, (v_summary ->> 'cash_sales_paise')::bigint, (v_summary ->> 'cash_refunds_paise')::bigint,
    (v_summary ->> 'cash_expenses_paise')::bigint, (v_summary ->> 'cash_manual_in_paise')::bigint,
    (v_summary ->> 'cash_deposits_paise')::bigint, (v_summary ->> 'cash_withdrawals_paise')::bigint,
    (v_summary ->> 'cash_manual_out_paise')::bigint, v_expected, p_actual_paise, p_actual_paise - v_expected, v_actor)
  returning id into v_id;

  perform app.audit(p_store, 'cash.day_closed', 'cash_reconciliations', v_id, null,
    jsonb_build_object('business_date', p_date, 'expected_paise', v_expected, 'actual_paise', p_actual_paise,
                       'difference_paise', p_actual_paise - v_expected));

  return jsonb_build_object('id', v_id, 'expected_paise', v_expected, 'actual_paise', p_actual_paise,
                            'difference_paise', p_actual_paise - v_expected, 'opening_paise', v_opening);
end $function$;

CREATE OR REPLACE FUNCTION public.record_cash_movement(p_store uuid, p_type text, p_amount_paise bigint, p_reason text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_date date := (now() at time zone 'Asia/Kolkata')::date;
  v_actor uuid;
  v_id uuid;
  s jsonb;
  v_expected bigint;
begin
  v_actor := app.assert_store_manager_permission(p_store, p_actor, 'cash_confirmation');
  if p_type not in ('deposit','withdrawal','manual_in','manual_out') then
    raise exception 'unknown cash movement type' using errcode = 'P0001';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'enter an amount above zero' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'give a reason of at least 3 characters' using errcode = 'P0001';
  end if;
  if exists (select 1 from cash_reconciliations where store_id = p_store and business_date = v_date) then
    raise exception 'today is already closed; record this movement on the next business day' using errcode = 'P0001';
  end if;

  s := cash_day_summary(p_store, v_date);
  if p_type in ('deposit','withdrawal','manual_out') and (s ->> 'has_previous_closing')::boolean then
    v_expected := (s ->> 'previous_closing_paise')::bigint
                + (s ->> 'cash_sales_paise')::bigint
                - (s ->> 'cash_refunds_paise')::bigint
                - (s ->> 'cash_expenses_paise')::bigint
                + (s ->> 'cash_manual_in_paise')::bigint
                - (s ->> 'cash_deposits_paise')::bigint
                - (s ->> 'cash_withdrawals_paise')::bigint
                - (s ->> 'cash_manual_out_paise')::bigint;
    if p_amount_paise > v_expected then
      raise exception 'not enough cash in the drawer (expected % paise)', v_expected using errcode = 'P0001';
    end if;
  end if;

  insert into cash_movements (store_id, business_date, movement_type, amount_paise, reason, actor_id)
  values (p_store, v_date, p_type, p_amount_paise, btrim(p_reason), v_actor)
  returning id into v_id;

  perform app.audit(p_store, 'cash.movement', 'cash_movements', v_id, null,
    jsonb_build_object('type', p_type, 'amount_paise', p_amount_paise, 'reason', btrim(p_reason), 'business_date', v_date));
  return jsonb_build_object('id', v_id, 'business_date', v_date);
end $function$;
