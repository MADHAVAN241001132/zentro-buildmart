-- ZENTRO BuildMart: transactional business functions.
-- Every change to stock, payment, cash, invoice numbering or order status goes through
-- one of these functions. Each runs in a single transaction and takes row locks, so:
--   * stock cannot be oversold (reservation checks on_hand - reserved under FOR UPDATE),
--   * a payment or cash confirmation is applied exactly once (idempotent status checks),
--   * a webhook replay is recorded once (payment_events has a unique provider event id).
--
-- Who may call what:
--   service role (server code and webhooks)  -> all functions
--   shop owner / manager (authenticated)     -> store-scoped functions, checked with app.assert_store_access
--   guests (anon)                            -> no function; guests act through server routes

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
-- True for the service role (server code) and for an unauthenticated psql session as postgres
-- (migrations and admin maintenance). PostgREST always sets request.jwt.claim.role, so
-- browsers can never take the second branch.
-- Reads one JWT claim. PostgREST exposes claims as JSON in request.jwt.claims; older
-- versions also set request.jwt.claim.<name>. Both are supported.
create or replace function app.jwt_claim(p_key text) returns text
language sql stable as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> p_key, ''),
    nullif(current_setting('request.jwt.claim.' || p_key, true), '')
  )
$$;

create or replace function app.is_server() returns boolean
language sql stable as $$
  select coalesce(app.jwt_claim('role'), '') = 'service_role'
      or (session_user = 'postgres' and app.jwt_claim('role') is null)
$$;

create or replace function app.assert_store_access(p_store uuid, p_roles text[] default array['owner','manager'])
returns void
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if app.is_server() or app.is_platform_admin() then
    return;
  end if;
  if not app.is_store_member(p_store, p_roles) then
    raise exception 'forbidden: caller cannot act on this store' using errcode = '42501';
  end if;
end $$;

create or replace function app.store_of_order(p_order uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select store_id from orders where id = p_order
$$;

create or replace function app.audit(
  p_store uuid, p_action text, p_entity text, p_entity_id uuid,
  p_before jsonb default null, p_after jsonb default null
) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
  values (
    p_store,
    auth.uid(),
    case when app.is_server() then 'system' when app.is_platform_admin() then 'super_admin' else 'shop_owner' end,
    p_action, p_entity, p_entity_id, p_before, p_after
  );
end $$;

-- Atomic, gap-tolerant counter for order, invoice, quotation, PO and GRN numbers.
create or replace function app.next_number(p_store uuid, p_kind text, p_prefix text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_value bigint;
begin
  insert into store_counters (store_id, kind, next_value)
  values (p_store, p_kind, 2)
  on conflict (store_id, kind)
  do update set next_value = store_counters.next_value + 1
  returning next_value - 1 into v_value;

  return p_prefix || '-' || lpad(v_value::text, 6, '0');
end $$;

-- Writes an order status change and its history row. Caller must already have access.
create or replace function app.set_order_status(p_order uuid, p_to text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from text;
  v_store uuid;
begin
  select order_status, store_id into v_from, v_store from orders where id = p_order for update;
  if v_from is distinct from p_to then
    update orders set order_status = p_to, updated_at = now() where id = p_order;
    insert into order_status_history (order_id, store_id, from_status, to_status, actor_id, note)
    values (p_order, v_store, v_from, p_to, auth.uid(), p_note);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Stock: reservation, release, consumption, batches
-- ---------------------------------------------------------------------------
-- Reserves whole selling units for an order. Fails with 'insufficient_stock' rather than overselling.
-- Calling it twice for the same order is a no-op.
create or replace function reserve_order_stock(p_order uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_hold integer;
  v_expires timestamptz;
  v_item record;
  v_row inventory%rowtype;
begin
  perform app.assert_store_access(app.store_of_order(p_order), array['owner','manager','staff']);
  if not app.is_server() then
    raise exception 'reserve_order_stock is a server-only function' using errcode = '42501';
  end if;

  select o.store_id, s.reservation_minutes into v_store, v_hold
  from orders o join store_settings s on s.store_id = o.store_id
  where o.id = p_order;

  if exists (select 1 from inventory_reservations where order_id = p_order and status = 'active') then
    return 'already_reserved';
  end if;

  v_expires := now() + make_interval(mins => v_hold);

  for v_item in
    select oi.variant_id, oi.stock_units, pv.label
    from order_items oi
    join product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order and oi.stock_units > 0
    order by oi.variant_id
  loop
    select * into v_row from inventory where variant_id = v_item.variant_id for update;
    if not found then
      raise exception 'no inventory record for variant %', v_item.label using errcode = 'P0001';
    end if;
    if v_row.on_hand - v_row.reserved < v_item.stock_units then
      raise exception 'insufficient_stock: % (available %, requested %)',
        v_item.label, v_row.on_hand - v_row.reserved, v_item.stock_units using errcode = 'P0001';
    end if;

    update inventory set reserved = reserved + v_item.stock_units, updated_at = now()
    where id = v_row.id;

    insert into inventory_reservations (store_id, order_id, variant_id, quantity, status, expires_at)
    values (v_store, p_order, v_item.variant_id, v_item.stock_units, 'active', v_expires);

    insert into stock_movements (store_id, variant_id, movement_type, quantity, reference_type, reference_id, note)
    values (v_store, v_item.variant_id, 'reserve', v_item.stock_units, 'order', p_order, 'reserved for order');
  end loop;

  update orders set reservation_expires_at = v_expires where id = p_order;
  return 'reserved';
end $$;

-- Releases an order's active reservations (cancellation or expiry). Safe to repeat.
create or replace function release_order_reservation(p_order uuid, p_reason text default 'released')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_res record;
  v_count integer := 0;
begin
  for v_res in
    select * from inventory_reservations
    where order_id = p_order and status = 'active'
    for update
  loop
    update inventory set reserved = reserved - v_res.quantity, updated_at = now()
    where variant_id = v_res.variant_id and store_id = v_res.store_id;

    update inventory_reservations set status = 'released', updated_at = now() where id = v_res.id;

    insert into stock_movements (store_id, variant_id, movement_type, quantity, reference_type, reference_id, note)
    values (v_res.store_id, v_res.variant_id, 'release', -v_res.quantity, 'order', p_order, p_reason);

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Allocates a deduction across tile batches, oldest manufacturing date first.
create or replace function app.allocate_batches(p_store uuid, p_variant uuid, p_qty bigint, p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_batch record;
  v_remaining bigint := p_qty;
  v_take bigint;
begin
  if not exists (select 1 from inventory_batches where variant_id = p_variant) then
    return;  -- variant is not batch-tracked
  end if;

  for v_batch in
    select id, on_hand from inventory_batches
    where variant_id = p_variant and store_id = p_store and on_hand > 0
    order by manufacturing_date asc nulls last, created_at asc
    for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_batch.on_hand, v_remaining);
    update inventory_batches set on_hand = on_hand - v_take, updated_at = now() where id = v_batch.id;
    insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, reference_type, reference_id, note)
    values (p_store, p_variant, v_batch.id, 'sale', -v_take, 'order', p_order, 'batch allocation');
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'batch_shortage: batch stock does not cover the order' using errcode = 'P0001';
  end if;
end $$;

-- Converts an order's reservations into real stock deductions. Runs once per reservation:
-- a second call finds no active reservations and deducts nothing (no double deduction).
create or replace function consume_order_stock(p_order uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_res record;
  v_row inventory%rowtype;
  v_count integer := 0;
begin
  for v_res in
    select * from inventory_reservations
    where order_id = p_order and status = 'active'
    for update
  loop
    select * into v_row from inventory where variant_id = v_res.variant_id for update;

    update inventory
    set on_hand = on_hand - v_res.quantity,
        reserved = reserved - v_res.quantity,
        updated_at = now()
    where id = v_row.id;

    perform app.allocate_batches(v_res.store_id, v_res.variant_id, v_res.quantity, p_order);

    -- Batch-tracked variants are recorded per batch (allocate_batches), so their batch rows
    -- sum to the sale. Untracked variants get one variant-level movement.
    if not exists (select 1 from inventory_batches where variant_id = v_res.variant_id) then
      insert into stock_movements (store_id, variant_id, movement_type, quantity, reference_type, reference_id, note)
      values (v_res.store_id, v_res.variant_id, 'sale', -v_res.quantity, 'order', p_order, 'sold');
    end if;

    update inventory_reservations set status = 'consumed', updated_at = now() where id = v_res.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Puts back stock for a cancelled order that had already been consumed (a return).
create or replace function app.restock_consumed(p_order uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
  v_count integer := 0;
  v_batch uuid;
begin
  for v_item in
    select oi.variant_id, oi.stock_units, o.store_id
    from order_items oi join orders o on o.id = oi.order_id
    where oi.order_id = p_order and oi.stock_units > 0
      and exists (select 1 from inventory_reservations r
                  where r.order_id = p_order and r.variant_id = oi.variant_id and r.status = 'consumed')
  loop
    update inventory set on_hand = on_hand + v_item.stock_units, updated_at = now()
    where variant_id = v_item.variant_id and store_id = v_item.store_id;

    select id into v_batch from inventory_batches
    where variant_id = v_item.variant_id order by manufacturing_date nulls last, created_at limit 1;
    if v_batch is not null then
      update inventory_batches set on_hand = on_hand + v_item.stock_units, updated_at = now() where id = v_batch;
    end if;

    insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, reference_type, reference_id, note)
    values (v_item.store_id, v_item.variant_id, v_batch, 'return', v_item.stock_units, 'order', p_order, 'order cancelled after dispatch');

    update inventory_reservations set status = 'released', updated_at = now()
    where order_id = p_order and variant_id = v_item.variant_id and status = 'consumed';
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Owner adjustment (count correction). Cannot push on-hand below reserved stock.
create or replace function adjust_stock(p_variant uuid, p_delta bigint, p_reason text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_row inventory%rowtype;
begin
  select store_id into v_store from product_variants where id = p_variant;
  if v_store is null then raise exception 'unknown variant' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager']);

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
end $$;

-- Marks sellable stock as damaged (moves it out of on_hand).
create or replace function mark_damaged(p_variant uuid, p_qty bigint, p_reason text, p_batch uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_row inventory%rowtype;
begin
  select store_id into v_store from product_variants where id = p_variant;
  perform app.assert_store_access(v_store, array['owner','manager']);

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
end $$;

-- ---------------------------------------------------------------------------
-- Orders: status transitions and cancellation
-- ---------------------------------------------------------------------------
-- Allowed owner-driven transitions. PLACED -> CONFIRMED happens only through payment settlement.
create or replace function app.is_valid_transition(p_from text, p_to text, p_fulfilment text)
returns boolean
language sql immutable as $$
  select case
    when p_from = 'CONFIRMED' and p_to = 'PROCESSING' then true
    when p_from = 'PROCESSING' and p_to = 'PACKED' then true
    when p_from = 'PACKED' and p_to = 'READY_FOR_PICKUP' and p_fulfilment = 'pickup' then true
    when p_from = 'PACKED' and p_to = 'OUT_FOR_DELIVERY' and p_fulfilment = 'delivery' then true
    when p_from = 'READY_FOR_PICKUP' and p_to = 'COMPLETED' then true
    when p_from = 'OUT_FOR_DELIVERY' and p_to = 'COMPLETED' then true
    else false
  end
$$;

create or replace function transition_order_status(p_order uuid, p_to text, p_note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_order.store_id, array['owner','manager']);

  if not app.is_valid_transition(v_order.order_status, p_to, v_order.fulfilment) then
    raise exception 'invalid order transition % -> % (%)', v_order.order_status, p_to, v_order.fulfilment
      using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'PAID' then
    raise exception 'order is not paid (payment status %)', v_order.payment_status using errcode = 'P0001';
  end if;

  perform app.set_order_status(p_order, p_to, p_note);
  return p_to;
end $$;

-- Cancels an order. Unpaid orders release their reservations. Paid orders restock and
-- raise a refund request. Cancellation is blocked once the order is completed.
create or replace function cancel_order(p_order uuid, p_reason text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_payment payments%rowtype;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_order.store_id, array['owner','manager','staff']);

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
end $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
-- Records a webhook/event once. Returns false when the same provider event was already received.
create or replace function record_payment_event(
  p_provider text, p_event_id text, p_event_type text, p_payload jsonb, p_signature_valid boolean
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not app.is_server() then
    raise exception 'payment events are server-only' using errcode = '42501';
  end if;
  insert into payment_events (provider, provider_event_id, event_type, payload, signature_valid)
  values (p_provider, p_event_id, p_event_type, p_payload, p_signature_valid)
  on conflict (provider, provider_event_id) do nothing
  returning id into v_id;
  return v_id is not null;
end $$;

-- Opens a payment attempt for an order (online UPI or cash). Retries are allowed after a
-- FAILED or EXPIRED attempt, as long as the order still holds its reservation.
create or replace function create_payment_attempt(
  p_order uuid, p_method text, p_provider text, p_provider_order_id text,
  p_amount_paise bigint, p_expires_at timestamptz, p_upi_payload text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_payment_id uuid;
  v_status text := case when p_method = 'cash' then 'CASH_PENDING' else 'PENDING' end;
begin
  if not app.is_server() then
    raise exception 'payment attempts are server-only' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if v_order.order_status = 'CANCELLED' then raise exception 'order is cancelled' using errcode = 'P0001'; end if;
  if v_order.payment_status = 'PAID' then raise exception 'order is already paid' using errcode = 'P0001'; end if;
  if p_amount_paise <> v_order.total_paise then
    raise exception 'amount % does not match order total %', p_amount_paise, v_order.total_paise using errcode = 'P0001';
  end if;

  insert into payments (store_id, order_id, method, provider, provider_order_id, status, amount_paise, upi_qr_payload, expires_at)
  values (v_order.store_id, p_order, p_method, p_provider, p_provider_order_id, v_status, p_amount_paise, p_upi_payload, p_expires_at)
  returning id into v_payment_id;

  update orders set
      payment_method = p_method,
      payment_status = v_status,
      updated_at = now()
  where id = p_order;

  return v_payment_id;
end $$;

-- Applies a gateway result. Idempotent: a repeated success for a paid order returns 'already_paid'.
-- A success that arrives after the reservation was released is never auto-confirmed; it is
-- returned as 'late_payment_requires_review' so the owner can refund or re-reserve.
create or replace function settle_online_payment(
  p_provider text, p_provider_order_id text, p_provider_payment_id text,
  p_amount_paise bigint, p_success boolean, p_failure_reason text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_order orders%rowtype;
begin
  if not app.is_server() then
    raise exception 'settlement is server-only' using errcode = '42501';
  end if;

  select * into v_payment from payments
  where provider = p_provider and provider_order_id = p_provider_order_id
  for update;
  if not found then return 'unknown_payment'; end if;

  if v_payment.status = 'PAID' then return 'already_paid'; end if;
  if v_payment.status not in ('PENDING','PROCESSING') then
    -- A stale failure or a late success for an attempt that already expired or was superseded.
    if p_success and v_payment.status in ('FAILED','EXPIRED') then
      return 'late_payment_requires_review';
    end if;
    return 'ignored_terminal_state';
  end if;

  select * into v_order from orders where id = v_payment.order_id for update;

  if not p_success then
    update payments set status = 'FAILED', failure_reason = p_failure_reason, updated_at = now()
    where id = v_payment.id;
    update orders set payment_status = 'FAILED', updated_at = now() where id = v_order.id;
    return 'failed';
  end if;

  if p_amount_paise <> v_payment.amount_paise then
    insert into payment_events (store_id, provider, provider_event_id, event_type, payload, signature_valid)
    values (v_order.store_id, p_provider, 'mismatch:' || coalesce(p_provider_payment_id, gen_random_uuid()::text),
            'amount_mismatch', jsonb_build_object('expected', v_payment.amount_paise, 'received', p_amount_paise), true)
    on conflict do nothing;
    return 'amount_mismatch';
  end if;

  if v_order.order_status = 'CANCELLED' or v_order.reservation_expires_at < now() then
    update payments set status = 'FAILED', provider_payment_id = p_provider_payment_id,
           failure_reason = 'paid after reservation expired', updated_at = now()
    where id = v_payment.id;
    return 'late_payment_requires_review';
  end if;

  update payments set status = 'PAID', provider_payment_id = p_provider_payment_id,
         paid_at = now(), updated_at = now()
  where id = v_payment.id;

  update orders set payment_status = 'PAID', paid_at = now(), updated_at = now() where id = v_order.id;
  perform consume_order_stock(v_order.id);
  if v_order.order_status = 'PLACED' then
    perform app.set_order_status(v_order.id, 'CONFIRMED', 'payment received');
  end if;
  return 'paid';
end $$;

-- Owner confirms cash handed over at the counter. The customer can never call this:
-- it requires an authenticated owner or manager of the order's store.
create or replace function confirm_cash_payment(
  p_order uuid, p_amount_received_paise bigint, p_note text default null, p_actor uuid default null
) returns text
language plpgsql security definer set search_path = public as $$
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
    perform app.assert_store_access(v_order.store_id, array['owner','manager']);
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
end $$;

-- Expires open payment attempts and abandons unpaid orders whose reservation has lapsed.
-- Run from a scheduled job (Vercel Cron calls an API route that calls this).
create or replace function expire_stale_payments()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_attempts integer;
  v_orders integer := 0;
  v_order record;
begin
  if not app.is_server() then
    raise exception 'expiry is server-only' using errcode = '42501';
  end if;

  with expired as (
    update payments set status = 'EXPIRED', updated_at = now()
    where status = 'PENDING' and expires_at < now()
    returning order_id
  ), flagged as (
    update orders o set payment_status = 'EXPIRED', updated_at = now()
    from expired e where o.id = e.order_id and o.payment_status = 'PENDING'
    returning o.id
  )
  select count(*) into v_attempts from expired;

  for v_order in
    select o.id, o.store_id from orders o
    where o.payment_status <> 'PAID' and o.order_status not in ('CANCELLED','COMPLETED')
      and o.reservation_expires_at < now()
    for update of o
  loop
    perform release_order_reservation(v_order.id, 'reservation expired');
    update payments set status = 'EXPIRED', updated_at = now()
    where order_id = v_order.id and status in ('PENDING','CASH_PENDING','PROCESSING');
    update orders set order_status = 'CANCELLED', payment_status = 'EXPIRED',
           cancelled_at = now(), cancel_reason = 'reservation expired', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, store_id, from_status, to_status, note)
    values (v_order.id, v_order.store_id, 'PLACED', 'CANCELLED', 'reservation expired');
    v_orders := v_orders + 1;
  end loop;

  return jsonb_build_object('attempts_expired', v_attempts, 'orders_cancelled', v_orders);
end $$;

-- Records a successful refund. Moves the order to REFUNDED once the full amount is returned.
create or replace function mark_refund_succeeded(p_refund uuid, p_provider_refund_id text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_refund refunds%rowtype;
begin
  if not app.is_server() then
    raise exception 'refund settlement is server-only' using errcode = '42501';
  end if;
  select * into v_refund from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if v_refund.status = 'succeeded' then return 'already_succeeded'; end if;

  update refunds set status = 'succeeded', provider_refund_id = p_provider_refund_id, processed_at = now()
  where id = p_refund;
  update payments set status = 'REFUNDED', updated_at = now() where id = v_refund.payment_id;
  update orders set payment_status = 'REFUNDED', updated_at = now() where id = v_refund.order_id;
  return 'refunded';
end $$;

-- ---------------------------------------------------------------------------
-- Purchasing: goods receipt with partial receiving
-- ---------------------------------------------------------------------------
-- p_lines: [{"po_item_id": uuid, "quantity": n, "damaged": n, "batch_number": "..."}]
create or replace function receive_goods(p_po uuid, p_lines jsonb, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
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
  perform app.assert_store_access(v_po.store_id, array['owner','manager']);
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
end $$;

-- ---------------------------------------------------------------------------
-- Credit ledger
-- ---------------------------------------------------------------------------
-- Positive amount: a credit sale (the customer owes more). Negative: a payment (the balance falls).
create or replace function customer_balance(p_customer uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_paise), 0) from credit_ledger where customer_id = p_customer
$$;

create or replace function record_credit_entry(
  p_customer uuid, p_entry_type text, p_amount_paise bigint, p_due_on date default null, p_note text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_customer customers%rowtype;
  v_signed bigint;
  v_balance bigint;
begin
  select * into v_customer from customers where id = p_customer for update;
  if not found then raise exception 'customer not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_customer.store_id, array['owner','manager']);

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
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard metrics (database-driven, never hard-coded)
-- ---------------------------------------------------------------------------
create or replace function store_dashboard_metrics(p_store uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  perform app.assert_store_access(p_store, array['owner','manager','staff']);

  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'gross_sales_paise', coalesce((
        select sum(total_paise) from orders
        where store_id = p_store and payment_status = 'PAID' and paid_at >= p_from and paid_at < p_to), 0),
    'paid_orders', (
        select count(*) from orders
        where store_id = p_store and payment_status = 'PAID' and paid_at >= p_from and paid_at < p_to),
    'orders_placed', (
        select count(*) from orders where store_id = p_store and created_at >= p_from and created_at < p_to),
    'gross_profit_paise', coalesce((
        select sum(oi.taxable_paise - round(oi.quantity * oi.cost_price_paise_snapshot))::bigint
        from order_items oi join orders o on o.id = oi.order_id
        where o.store_id = p_store and o.payment_status = 'PAID' and o.paid_at >= p_from and o.paid_at < p_to), 0),
    'expenses_paise', coalesce((
        select sum(amount_paise) from expenses
        where store_id = p_store and expense_on >= p_from::date and expense_on < p_to::date), 0),
    'pending_cash_count', (
        select count(*) from payments where store_id = p_store and status = 'CASH_PENDING'),
    'pending_cash_paise', coalesce((
        select sum(amount_paise) from payments where store_id = p_store and status = 'CASH_PENDING'), 0),
    'low_stock_count', (
        select count(*) from inventory
        where store_id = p_store and reorder_level > 0 and (on_hand - reserved) <= reorder_level),
    'payment_methods', coalesce((
        select jsonb_agg(jsonb_build_object('method', method, 'orders', n, 'amount_paise', amt) order by method)
        from (select payment_method as method, count(*) as n, sum(total_paise) as amt
              from orders where store_id = p_store and payment_status = 'PAID'
                and paid_at >= p_from and paid_at < p_to
              group by payment_method) m), '[]'::jsonb),
    'category_revenue', coalesce((
        select jsonb_agg(jsonb_build_object('category', c.name, 'amount_paise', amt) order by amt desc)
        from (select pr.category_id, sum(oi.line_total_paise) as amt
              from order_items oi
              join orders o on o.id = oi.order_id
              join product_variants pv on pv.id = oi.variant_id
              join products pr on pr.id = pv.product_id
              where o.store_id = p_store and o.payment_status = 'PAID'
                and o.paid_at >= p_from and o.paid_at < p_to
              group by pr.category_id) x
        join categories c on c.id = x.category_id), '[]'::jsonb),
    'daily_sales', coalesce((
        select jsonb_agg(jsonb_build_object('day', d.day, 'amount_paise', d.amt) order by d.day)
        from (select date_trunc('day', paid_at) as day, sum(total_paise) as amt
              from orders where store_id = p_store and payment_status = 'PAID'
                and paid_at >= p_from and paid_at < p_to
              group by 1) d), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges: browsers may call only the owner-facing functions; the rest is service-only.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

grant execute on function
  adjust_stock(uuid, bigint, text),
  mark_damaged(uuid, bigint, text, uuid),
  transition_order_status(uuid, text, text),
  cancel_order(uuid, text),
  confirm_cash_payment(uuid, bigint, text, uuid),
  receive_goods(uuid, jsonb, text),
  record_credit_entry(uuid, text, bigint, date, text),
  customer_balance(uuid),
  store_dashboard_metrics(uuid, timestamptz, timestamptz)
  to authenticated;

grant execute on all functions in schema public to service_role;

-- Server-only functions: even if someone reaches the endpoint, is_server() refuses them.
-- (service_role is the only role granted access to the sensitive ones above.)
