-- 0016: refunds (full and partial; cash, Razorpay and credit), returned quantities, restocking, damaged returns,
-- coupon release on a full refund, and auditable cash movements that feed the day close.
--
-- Lifecycle of a refund:
--   create_refund        -> 'requested'. Quantities and the amount are reserved against the order, so a second refund
--                           cannot take the same units or exceed the amount paid.
--   cash / credit        -> finalised at once (app.finalize_refund): stock returned, coupon released if the order is
--                           fully returned, credit ledger reduced, status 'succeeded'.
--   online (Razorpay)    -> mark_refund_processing stores the gateway refund id ('processing'). The gateway's signed
--                           refund.processed event calls settle_refund, which finalises it. refund.failed calls fail_refund.
--                           Stock and credit are not touched until the gateway confirms.
-- Every money and stock change happens under a row lock on the order, so concurrent refunds serialise.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table refunds alter column payment_id drop not null;
alter table refunds
  add column refund_method text check (refund_method in ('cash','online','credit')),
  add column refund_type text check (refund_type in ('full','partial')),
  add column request_key text unique,
  add column failure_reason text,
  add column finalized_at timestamptz,
  add constraint refunds_payment_or_credit check (payment_id is not null or refund_method = 'credit');

create table refund_items (
  id              uuid primary key default gen_random_uuid(),
  refund_id       uuid not null references refunds(id) on delete cascade,
  store_id        uuid not null references stores(id) on delete cascade,
  order_item_id   uuid not null references order_items(id),
  variant_id      uuid not null references product_variants(id),
  quantity        bigint not null check (quantity > 0),
  amount_paise    bigint not null check (amount_paise >= 0),
  condition       text not null check (condition in ('restock','damaged')),
  created_at      timestamptz not null default now(),
  unique (refund_id, order_item_id)
);
create index refund_items_order_item_idx on refund_items(order_item_id);

alter table refund_items enable row level security;
create policy refund_items_member_read on refund_items for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
revoke insert, update, delete on refund_items from authenticated, anon;

create table cash_movements (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  business_date   date not null,
  movement_type   text not null check (movement_type in ('deposit','withdrawal','manual_in','manual_out')),
  amount_paise    bigint not null check (amount_paise > 0),
  reason          text not null check (length(btrim(reason)) >= 3),
  actor_id        uuid references profiles(id),
  created_at      timestamptz not null default now()
);
create index cash_movements_day_idx on cash_movements(store_id, business_date);

alter table cash_movements enable row level security;
create policy cash_movements_member_read on cash_movements for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
revoke insert, update, delete on cash_movements from authenticated, anon;

alter table cash_reconciliations
  add column cash_manual_in_paise bigint not null default 0 check (cash_manual_in_paise >= 0),
  add column cash_withdrawals_paise bigint not null default 0 check (cash_withdrawals_paise >= 0),
  add column cash_manual_out_paise bigint not null default 0 check (cash_manual_out_paise >= 0);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Owner or manager check shared by refunds and cash movements. Server calls name the actor; user calls use auth.uid().
create or replace function app.assert_store_manager(p_store uuid, p_actor uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if app.is_server() then
    if not exists (
      select 1 from store_owners so
      where so.store_id = p_store and so.profile_id = p_actor and so.is_active and so.role in ('owner','manager')
    ) then
      raise exception 'actor is not an owner or manager of this store' using errcode = '42501';
    end if;
    return p_actor;
  end if;
  perform app.assert_store_access(p_store, array['owner','manager']);
  return coalesce(auth.uid(), p_actor);
end $$;

-- Works out one requested line: whole units only, not more than remains, the amount it returns, and its condition.
-- A line returned in full takes whatever amount is left on it, so the refunds of one line always add up exactly.
create or replace function app.plan_refund_line(p_order uuid, p_line jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_item order_items%rowtype;
  v_qty numeric;
  v_cond text;
  v_done bigint;
  v_done_amt bigint;
  v_amt bigint;
begin
  if jsonb_typeof(p_line) <> 'object' then raise exception 'each returned line must be an object' using errcode = 'P0001'; end if;
  v_qty := (p_line ->> 'quantity')::numeric;
  if v_qty is null or v_qty <> trunc(v_qty) or v_qty <= 0 then
    raise exception 'returned quantities must be whole numbers above zero' using errcode = 'P0001';
  end if;
  v_cond := coalesce(p_line ->> 'condition', 'restock');
  if v_cond not in ('restock','damaged') then
    raise exception 'condition must be restock or damaged' using errcode = 'P0001';
  end if;

  select * into v_item from order_items where id = (p_line ->> 'order_item_id')::uuid and order_id = p_order;
  if not found then raise exception 'that item is not on this order' using errcode = 'P0002'; end if;
  if v_item.quantity <> trunc(v_item.quantity) then
    raise exception 'this line has fractional quantities and cannot be refunded in part' using errcode = 'P0001';
  end if;

  select coalesce(sum(ri.quantity), 0), coalesce(sum(ri.amount_paise), 0) into v_done, v_done_amt
    from refund_items ri join refunds r on r.id = ri.refund_id
   where ri.order_item_id = v_item.id and r.status in ('requested','processing','succeeded');

  if v_qty > v_item.quantity - v_done then
    raise exception 'only % unit(s) of % can still be returned', v_item.quantity - v_done, v_item.product_name_snapshot
      using errcode = 'P0001';
  end if;

  if v_qty = v_item.quantity - v_done then
    v_amt := v_item.line_total_paise - v_done_amt;
  else
    v_amt := round(v_item.line_total_paise * v_qty / v_item.quantity)::bigint;
  end if;

  return jsonb_build_object(
    'order_item_id', v_item.id,
    'variant_id', v_item.variant_id,
    'quantity', v_qty::bigint,
    'amount_paise', v_amt,
    'condition', v_cond);
end $$;

-- Completes a refund: returns stock, releases the coupon when the order is fully returned, reduces the credit ledger,
-- updates the payment status and marks the refund succeeded. Idempotent for a refund that already succeeded.
create or replace function app.finalize_refund(p_refund uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
  o orders%rowtype;
  it record;
  v_all boolean;
  v_redemption coupon_redemptions%rowtype;
  v_customer uuid;
  v_pay_amount bigint;
  v_pay_refunded bigint;
begin
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status = 'succeeded' then return; end if;
  if r.status not in ('requested','processing') then
    raise exception 'refund is % and cannot be completed', r.status using errcode = 'P0001';
  end if;
  select * into o from orders where id = r.order_id for update;

  for it in select ri.variant_id, ri.quantity, ri.condition from refund_items ri where ri.refund_id = r.id loop
    if it.condition = 'restock' then
      update inventory set on_hand = on_hand + it.quantity, updated_at = now()
       where variant_id = it.variant_id and store_id = r.store_id;
      if not found then raise exception 'no inventory row for a returned variant' using errcode = 'P0002'; end if;
      insert into stock_movements (store_id, variant_id, movement_type, quantity, reference_type, reference_id, note)
      values (r.store_id, it.variant_id, 'return', it.quantity, 'refund', r.id, 'returned to stock');
    else
      update inventory set damaged = damaged + it.quantity, updated_at = now()
       where variant_id = it.variant_id and store_id = r.store_id;
      if not found then raise exception 'no inventory row for a returned variant' using errcode = 'P0002'; end if;
      insert into stock_movements (store_id, variant_id, movement_type, quantity, reference_type, reference_id, note)
      values (r.store_id, it.variant_id, 'damage', it.quantity, 'refund', r.id, 'returned damaged; not sellable');
    end if;
  end loop;

  -- The order is fully returned when every line has its full quantity refunded (this refund included).
  select not exists (
    select 1 from order_items oi
     where oi.order_id = o.id
       and oi.quantity > coalesce((
         select sum(ri.quantity) from refund_items ri join refunds rr on rr.id = ri.refund_id
          where ri.order_item_id = oi.id and (rr.status = 'succeeded' or rr.id = r.id)), 0)
  ) into v_all;

  if v_all then
    select * into v_redemption from coupon_redemptions where order_id = o.id for update;
    if found then
      delete from coupon_redemptions where id = v_redemption.id;
      update coupons set used_count = greatest(used_count - 1, 0) where id = v_redemption.coupon_id;
    end if;
  end if;

  if r.refund_method = 'credit' then
    select customer_id into v_customer from pos_bills where order_id = o.id;
    if v_customer is null then raise exception 'credit refund needs the customer on the sale' using errcode = 'P0001'; end if;
    perform record_credit_entry(v_customer, 'adjustment', -r.amount_paise, null,
      'Refund for order ' || o.order_number);
  end if;

  update refunds set status = 'succeeded', processed_at = now(), finalized_at = now() where id = r.id;

  if r.payment_id is not null then
    select amount_paise into v_pay_amount from payments where id = r.payment_id;
    select coalesce(sum(amount_paise), 0) into v_pay_refunded from refunds
     where payment_id = r.payment_id and status = 'succeeded';
    update payments set status = case when v_pay_refunded >= v_pay_amount then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
                        updated_at = now()
     where id = r.payment_id;
    update orders set payment_status = (select status from payments where id = r.payment_id), updated_at = now()
     where id = o.id;
  end if;

  perform app.audit(r.store_id, 'refund.succeeded', 'refunds', r.id, null,
    jsonb_build_object('order_id', o.id, 'amount_paise', r.amount_paise, 'method', r.refund_method, 'full', v_all));
end $$;

-- ---------------------------------------------------------------------------
-- Refund entry points (server only: called through the service-role client)
-- ---------------------------------------------------------------------------

create or replace function public.create_refund(
  p_order uuid, p_lines jsonb, p_reason text, p_request_key text, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  p payments%rowtype;
  v_existing refunds%rowtype;
  v_actor uuid;
  v_method text;
  v_payment uuid;
  v_paid bigint;
  v_refunded bigint;
  v_total bigint := 0;
  v_line jsonb;
  v_plan jsonb;
  v_seen uuid[] := '{}';
  v_refund_id uuid;
  v_all boolean;
  v_provider_payment text;
begin
  if not app.is_server() then raise exception 'refunds are processed by the server' using errcode = '42501'; end if;
  if p_request_key is null or length(p_request_key) < 8 or length(p_request_key) > 80 then
    raise exception 'missing request key' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'give a reason of at least 3 characters' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'choose at least one returned item' using errcode = 'P0001';
  end if;

  -- A repeated request with the same key returns the first refund and changes nothing.
  select * into v_existing from refunds where request_key = p_request_key;
  if found then
    perform app.assert_store_manager(v_existing.store_id, p_actor);
    return jsonb_build_object('replayed', true, 'refund_id', v_existing.id, 'status', v_existing.status,
                              'amount_paise', v_existing.amount_paise, 'method', v_existing.refund_method);
  end if;

  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  v_actor := app.assert_store_manager(o.store_id, p_actor);
  if o.order_status = 'CANCELLED' then
    raise exception 'a cancelled order cannot be refunded here' using errcode = 'P0001';
  end if;

  if o.payment_method = 'credit' then
    v_method := 'credit';
    v_payment := null;
    v_paid := o.total_paise;
  else
    if o.payment_status not in ('PAID','PARTIALLY_REFUNDED') then
      raise exception 'only paid orders can be refunded (status %)', o.payment_status using errcode = 'P0001';
    end if;
    select * into p from payments
     where order_id = o.id and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')
     order by paid_at desc nulls last limit 1 for update;
    if not found then raise exception 'no captured payment on this order' using errcode = 'P0001'; end if;
    if p.provider = 'simulator' then raise exception 'simulator payments cannot be refunded' using errcode = 'P0001'; end if;
    v_method := case when p.provider = 'cash' then 'cash' else 'online' end;
    v_payment := p.id;
    v_provider_payment := p.provider_payment_id;
    select coalesce(sum(amount_paise), 0) into v_paid from payments
     where order_id = o.id and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED');
  end if;

  select coalesce(sum(amount_paise), 0) into v_refunded from refunds
   where order_id = o.id and status in ('requested','processing','succeeded');

  -- Pass 1: validate every line and total the amount before anything is written.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_plan := app.plan_refund_line(o.id, v_line);
    if (v_plan ->> 'order_item_id')::uuid = any(v_seen) then
      raise exception 'each item can appear once in a refund' using errcode = 'P0001';
    end if;
    v_seen := v_seen || (v_plan ->> 'order_item_id')::uuid;
    v_total := v_total + (v_plan ->> 'amount_paise')::bigint;
  end loop;

  if v_total <= 0 then raise exception 'the refund amount must be above zero' using errcode = 'P0001'; end if;
  if v_refunded + v_total > v_paid then
    raise exception 'refund exceeds the amount paid (% paise left to refund)', v_paid - v_refunded using errcode = 'P0001';
  end if;

  insert into refunds (store_id, payment_id, order_id, amount_paise, status, reason, refund_method, refund_type,
                       request_key, requested_by)
  values (o.store_id, v_payment, o.id, v_total, 'requested', btrim(p_reason), v_method, 'partial',
          p_request_key, v_actor)
  returning id into v_refund_id;

  -- Pass 2: record the lines (validated above, under the order lock).
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_plan := app.plan_refund_line(o.id, v_line);
    insert into refund_items (refund_id, store_id, order_item_id, variant_id, quantity, amount_paise, condition)
    values (v_refund_id, o.store_id, (v_plan ->> 'order_item_id')::uuid, (v_plan ->> 'variant_id')::uuid,
            (v_plan ->> 'quantity')::bigint, (v_plan ->> 'amount_paise')::bigint, v_plan ->> 'condition');
  end loop;

  select not exists (
    select 1 from order_items oi
     where oi.order_id = o.id
       and oi.quantity > coalesce((
         select sum(ri.quantity) from refund_items ri join refunds rr on rr.id = ri.refund_id
          where ri.order_item_id = oi.id and rr.status in ('requested','processing','succeeded')), 0)
  ) into v_all;
  update refunds set refund_type = case when v_all then 'full' else 'partial' end where id = v_refund_id;

  perform app.audit(o.store_id, 'refund.requested', 'refunds', v_refund_id, null,
    jsonb_build_object('order_id', o.id, 'amount_paise', v_total, 'method', v_method, 'full', v_all));

  if v_method in ('cash','credit') then
    perform app.finalize_refund(v_refund_id);
  end if;

  return jsonb_build_object(
    'replayed', false,
    'refund_id', v_refund_id,
    'status', (select status from refunds where id = v_refund_id),
    'amount_paise', v_total,
    'method', v_method,
    'gateway_refund_needed', v_method = 'online',
    'provider_payment_id', v_provider_payment);
end $$;

-- Records that the gateway accepted the refund. Only valid for a refund waiting to be sent.
create or replace function public.mark_refund_processing(p_refund uuid, p_provider_refund_id text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  if p_provider_refund_id is null or p_provider_refund_id = '' then
    raise exception 'missing gateway refund id' using errcode = 'P0001';
  end if;
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.refund_method <> 'online' then raise exception 'only gateway refunds are sent to the gateway' using errcode = 'P0001'; end if;
  if r.status = 'processing' and r.provider_refund_id = p_provider_refund_id then return 'processing'; end if;
  if r.status <> 'requested' then raise exception 'refund is % and cannot be sent', r.status using errcode = 'P0001'; end if;
  update refunds set status = 'processing', provider_refund_id = p_provider_refund_id where id = r.id;
  perform app.audit(r.store_id, 'refund.sent_to_gateway', 'refunds', r.id, null,
    jsonb_build_object('provider_refund_id', p_provider_refund_id, 'amount_paise', r.amount_paise));
  return 'processing';
end $$;

-- Records that the gateway refused the refund. Nothing was returned to stock or the ledger, so nothing is reversed.
create or replace function public.fail_refund(p_refund uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status = 'failed' then return 'failed'; end if;
  if r.status not in ('requested','processing') then
    raise exception 'refund is % and cannot fail', r.status using errcode = 'P0001';
  end if;
  update refunds set status = 'failed', failure_reason = left(coalesce(p_reason, 'refused by the gateway'), 300),
                     processed_at = now()
   where id = r.id;
  perform app.audit(r.store_id, 'refund.failed', 'refunds', r.id, null,
    jsonb_build_object('reason', coalesce(p_reason, 'refused by the gateway')));
  return 'failed';
end $$;

-- Applies a signed gateway outcome for a refund we sent. Duplicate events do nothing.
create or replace function public.settle_refund(
  p_provider_refund_id text, p_success boolean, p_failure_reason text default null, p_amount_paise bigint default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into r from refunds where provider_refund_id = p_provider_refund_id for update;
  if not found then return 'unknown'; end if;
  if p_success then
    if r.status = 'succeeded' then return 'duplicate'; end if;
    if p_amount_paise is not null and p_amount_paise <> r.amount_paise then
      raise exception 'gateway amount % does not match the refund %', p_amount_paise, r.amount_paise using errcode = 'P0001';
    end if;
    perform app.finalize_refund(r.id);
    return 'succeeded';
  end if;
  if r.status = 'failed' then return 'duplicate'; end if;
  perform public.fail_refund(r.id, p_failure_reason);
  return 'failed';
end $$;

-- ---------------------------------------------------------------------------
-- Cash movements and the day close
-- ---------------------------------------------------------------------------

-- Records an authorised cash movement on today's business day. Outflows cannot exceed the expected drawer cash
-- when the opening is known. A closed day takes no movements.
create or replace function public.record_cash_movement(
  p_store uuid, p_type text, p_amount_paise bigint, p_reason text, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_date date := (now() at time zone 'Asia/Kolkata')::date;
  v_actor uuid;
  v_id uuid;
  s jsonb;
  v_expected bigint;
begin
  v_actor := app.assert_store_manager(p_store, p_actor);
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
end $$;

-- The day summary now includes manual movements, so the expected drawer cash covers them.
create or replace function cash_day_summary(p_store uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
end $$;

-- The deposit total now comes from the recorded movements, not a typed figure.
drop function if exists close_cash_day(uuid, date, bigint, bigint, bigint, uuid);

create or replace function close_cash_day(
  p_store uuid, p_date date, p_opening_paise bigint, p_actual_paise bigint, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_summary jsonb;
  v_opening bigint;
  v_expected bigint;
  v_id uuid;
  v_actor uuid;
begin
  v_actor := app.assert_store_manager(p_store, p_actor);
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
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function app.assert_store_manager(uuid, uuid), app.plan_refund_line(uuid, jsonb), app.finalize_refund(uuid)
  from public, anon, authenticated;
revoke execute on function public.create_refund(uuid, jsonb, text, text, uuid),
  public.mark_refund_processing(uuid, text), public.fail_refund(uuid, text),
  public.settle_refund(text, boolean, text, bigint) from public, anon, authenticated;
revoke execute on function public.record_cash_movement(uuid, text, bigint, text, uuid) from public, anon;
grant execute on function public.record_cash_movement(uuid, text, bigint, text, uuid) to authenticated;
revoke execute on function close_cash_day(uuid, date, bigint, bigint, uuid) from public, anon;
grant execute on function close_cash_day(uuid, date, bigint, bigint, uuid) to authenticated;
