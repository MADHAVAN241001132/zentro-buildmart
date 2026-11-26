-- ZENTRO BuildMart migration 0018
-- 1. Guest refund requests: a guest asks for a refund of chosen items on their own online order. The database checks
--    eligibility and remaining quantities. Guests cannot approve, execute or change a refund.
-- 2. Owner or manager review: approving creates the refund through the existing create_refund path, keyed by the
--    request id, so a retry or a double approval cannot create two refunds.
-- 3. Gateway "not sent" confirmation now needs an explicit Razorpay dashboard attestation. An empty refund list and a
--    waiting period are not treated as proof that a refund was never accepted.
-- Migrations 0001-0017 are not modified.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table refund_requests (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  order_id          uuid not null references orders(id) on delete cascade,
  guest_session_id  uuid not null references guest_sessions(id) on delete cascade,
  status            text not null default 'submitted' check (status in ('submitted','approved','rejected','withdrawn')),
  reason_code       text not null check (reason_code in ('damaged','wrong_item','not_as_described','changed_mind','other')),
  reason            text not null check (length(btrim(reason)) between 3 and 500),
  decision_note     text check (decision_note is null or length(btrim(decision_note)) >= 3),
  refund_id         uuid references refunds(id),
  decided_by        uuid references profiles(id),
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((status = 'approved') = (refund_id is not null))
);
-- At most one open request per order; a second concurrent submission fails here.
create unique index refund_requests_one_open_per_order on refund_requests(order_id) where status = 'submitted';
create index refund_requests_store_status_idx on refund_requests(store_id, status, created_at);

create table refund_request_items (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references refund_requests(id) on delete cascade,
  store_id       uuid not null references stores(id) on delete cascade,
  order_item_id  uuid not null references order_items(id) on delete cascade,
  quantity       integer not null check (quantity > 0),
  unique (request_id, order_item_id)
);

alter table refund_requests enable row level security;
alter table refund_request_items enable row level security;
create policy refund_requests_member_read on refund_requests for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
create policy refund_request_items_member_read on refund_request_items for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
revoke insert, update, delete, truncate on refund_requests, refund_request_items from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Remaining quantities, shared by guest submission and the owner's views
-- ---------------------------------------------------------------------------
-- committed: units on refunds that are requested, processing or succeeded.
-- pending_requests: units on refund requests still waiting for review.
create or replace function app.refund_remaining(p_order uuid)
returns table (order_item_id uuid, quantity integer, committed integer, pending_requests integer, remaining integer)
language sql stable security definer set search_path = public as $$
  select oi.id,
         oi.quantity::integer,
         coalesce((select sum(ri.quantity) from refund_items ri
                     join refunds r on r.id = ri.refund_id
                    where ri.order_item_id = oi.id and r.status in ('requested','processing','succeeded')), 0)::integer,
         coalesce((select sum(rri.quantity) from refund_request_items rri
                     join refund_requests rq on rq.id = rri.request_id
                    where rri.order_item_id = oi.id and rq.status = 'submitted'), 0)::integer,
         (oi.quantity
            - coalesce((select sum(ri.quantity) from refund_items ri
                          join refunds r on r.id = ri.refund_id
                         where ri.order_item_id = oi.id and r.status in ('requested','processing','succeeded')), 0)
            - coalesce((select sum(rri.quantity) from refund_request_items rri
                          join refund_requests rq on rq.id = rri.request_id
                         where rri.order_item_id = oi.id and rq.status = 'submitted'), 0))::integer
    from order_items oi
   where oi.order_id = p_order
$$;

-- ---------------------------------------------------------------------------
-- 3. Guest submission, withdrawal (guest, server path, session-checked in the database)
-- ---------------------------------------------------------------------------

create or replace function public.submit_guest_refund_request(
  p_store uuid, p_order uuid, p_guest_session uuid, p_reason_code text, p_reason text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  v_id uuid;
  l jsonb;
  v_item uuid;
  v_qty integer;
  v_remaining integer;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into o from orders
   where id = p_order and store_id = p_store and guest_session_id = p_guest_session
   for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.channel <> 'online' then raise exception 'this order cannot be refunded from the storefront' using errcode = 'P0001'; end if;
  if o.order_status = 'CANCELLED' then raise exception 'cancelled orders are not refunded here' using errcode = 'P0001'; end if;
  if o.payment_status not in ('PAID','PARTIALLY_REFUNDED') then
    raise exception 'only paid orders can be refunded' using errcode = 'P0001';
  end if;
  if coalesce(o.paid_at, o.created_at) < now() - interval '7 days' then
    raise exception 'the 7-day refund period for this order has ended' using errcode = 'P0001';
  end if;
  if p_reason_code not in ('damaged','wrong_item','not_as_described','changed_mind','other') then
    raise exception 'choose a reason' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'describe the reason in 3 to 500 characters' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'choose at least one item and a quantity' using errcode = 'P0001';
  end if;
  if exists (select 1 from refund_requests where order_id = o.id and status = 'submitted') then
    raise exception 'a refund request for this order is already waiting for review' using errcode = 'P0001';
  end if;

  insert into refund_requests (store_id, order_id, guest_session_id, reason_code, reason)
  values (p_store, o.id, p_guest_session, p_reason_code, btrim(p_reason))
  returning id into v_id;

  for l in select value from jsonb_array_elements(p_lines) loop
    v_item := (l ->> 'order_item_id')::uuid;
    v_qty := (l ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 999 then
      raise exception 'quantities must be whole numbers from 1 to 999' using errcode = 'P0001';
    end if;
    select rem.remaining into v_remaining from app.refund_remaining(o.id) rem where rem.order_item_id = v_item;
    if not found then raise exception 'an item is not on this order' using errcode = 'P0001'; end if;
    if v_qty > v_remaining then
      raise exception 'only % unit(s) of this item can still be requested', v_remaining using errcode = 'P0001';
    end if;
    insert into refund_request_items (request_id, store_id, order_item_id, quantity)
    values (v_id, p_store, v_item, v_qty);
  end loop;

  perform app.audit(p_store, 'refund_request.submitted', 'refund_requests', v_id, null,
    jsonb_build_object('order_id', o.id, 'reason_code', p_reason_code));
  return v_id;
end $$;

create or replace function public.withdraw_guest_refund_request(p_request uuid, p_guest_session uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  rq refund_requests%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into rq from refund_requests where id = p_request and guest_session_id = p_guest_session for update;
  if not found then raise exception 'refund request not found' using errcode = 'P0002'; end if;
  if rq.status <> 'submitted' then
    raise exception 'this request is % and cannot be withdrawn', rq.status using errcode = 'P0001';
  end if;
  update refund_requests set status = 'withdrawn', updated_at = now() where id = rq.id;
  perform app.audit(rq.store_id, 'refund_request.withdrawn', 'refund_requests', rq.id, null, null);
  return 'withdrawn';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Owner or manager review
-- ---------------------------------------------------------------------------

-- Checks that the actor may decide, and that the request is still open (or already approved, for a retry).
create or replace function public.begin_refund_request_review(p_request uuid, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rq refund_requests%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into rq from refund_requests where id = p_request for update;
  if not found then raise exception 'refund request not found' using errcode = 'P0002'; end if;
  perform app.assert_store_manager(rq.store_id, p_actor);
  if rq.status not in ('submitted','approved') then
    raise exception 'this request is % and cannot be decided', rq.status using errcode = 'P0001';
  end if;
  return jsonb_build_object('status', rq.status, 'store_id', rq.store_id, 'order_id', rq.order_id, 'refund_id', rq.refund_id);
end $$;

-- Links the refund created for an approved request. Calling it again with the same refund changes nothing.
create or replace function public.approve_refund_request(p_request uuid, p_actor uuid, p_refund uuid, p_note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  rq refund_requests%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into rq from refund_requests where id = p_request for update;
  if not found then raise exception 'refund request not found' using errcode = 'P0002'; end if;
  perform app.assert_store_manager(rq.store_id, p_actor);
  if rq.status = 'approved' then
    if rq.refund_id = p_refund then return 'approved'; end if;
    raise exception 'this request was already approved with another refund' using errcode = 'P0001';
  end if;
  if rq.status <> 'submitted' then
    raise exception 'this request is % and cannot be approved', rq.status using errcode = 'P0001';
  end if;
  if not exists (select 1 from refunds where id = p_refund and order_id = rq.order_id and store_id = rq.store_id) then
    raise exception 'that refund does not belong to this order' using errcode = 'P0001';
  end if;
  update refund_requests
     set status = 'approved', refund_id = p_refund, decided_by = p_actor, decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where id = rq.id;
  perform app.audit(rq.store_id, 'refund_request.approved', 'refund_requests', rq.id, null,
    jsonb_build_object('refund_id', p_refund, 'actor_id', p_actor));
  return 'approved';
end $$;

create or replace function public.reject_refund_request(p_request uuid, p_actor uuid, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare
  rq refund_requests%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into rq from refund_requests where id = p_request for update;
  if not found then raise exception 'refund request not found' using errcode = 'P0002'; end if;
  perform app.assert_store_manager(rq.store_id, p_actor);
  if rq.status = 'rejected' then return 'rejected'; end if;
  if rq.status <> 'submitted' then
    raise exception 'this request is % and cannot be rejected', rq.status using errcode = 'P0001';
  end if;
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'give the customer a reason of at least 3 characters' using errcode = 'P0001';
  end if;
  update refund_requests
     set status = 'rejected', decided_by = p_actor, decided_at = now(),
         decision_note = left(btrim(p_note), 500), updated_at = now()
   where id = rq.id;
  perform app.audit(rq.store_id, 'refund_request.rejected', 'refund_requests', rq.id, null,
    jsonb_build_object('actor_id', p_actor));
  return 'rejected';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Gateway "not sent" confirmation: explicit dashboard attestation required (replaces the 0017 three-argument form)
-- ---------------------------------------------------------------------------

drop function if exists public.reconcile_refund_not_sent(uuid, uuid, text);

-- Releases the units of an ambiguous gateway refund. Three conditions, all required:
-- 1. a store manager is the actor;
-- 2. the request was ambiguous for at least 15 minutes;
-- 3. the actor attests that they checked the Razorpay dashboard for this payment and found no refund for the request.
-- An empty refund list and the wait are not proof on their own. The attestation and the reason are audited, and the
-- decision remains the operator's responsibility.
create or replace function public.reconcile_refund_not_sent(
  p_refund uuid, p_actor uuid, p_reason text, p_dashboard_checked boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'give a short reason for confirming the refund was not sent' using errcode = 'P0001';
  end if;
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  perform app.assert_store_manager(r.store_id, p_actor);
  if r.status = 'failed' then return 'failed'; end if;
  if r.status <> 'requested' or r.gateway_state <> 'ambiguous' or r.provider_refund_id is not null then
    raise exception 'refund is not an unresolved gateway send' using errcode = 'P0001';
  end if;
  if r.gateway_ambiguous_at is null or r.gateway_ambiguous_at > now() - interval '15 minutes' then
    raise exception 'wait at least 15 minutes after an unknown send before confirming it was not sent' using errcode = 'P0001';
  end if;
  if p_dashboard_checked is not true then
    raise exception 'confirm that you checked the Razorpay dashboard for this payment and found no refund for this request'
      using errcode = 'P0001';
  end if;
  update refunds
     set status = 'failed', failure_reason = left('confirmed not sent by an operator: ' || btrim(p_reason), 300),
         processed_at = now(), gateway_state = 'none', gateway_lease_until = null
   where id = r.id;
  perform app.audit(r.store_id, 'refund.confirmed_not_sent', 'refunds', r.id, null,
    jsonb_build_object('actor_id', p_actor, 'reason', btrim(p_reason), 'amount_paise', r.amount_paise,
                       'dashboard_checked', true));
  return 'failed';
end $$;

-- ---------------------------------------------------------------------------
-- Grants: server-only functions are not callable by anon or authenticated users, so guests can never reach
-- approval, rejection or refund execution directly.
-- ---------------------------------------------------------------------------
revoke execute on function app.refund_remaining(uuid) from public, anon, authenticated;
revoke execute on function public.submit_guest_refund_request(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.withdraw_guest_refund_request(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.begin_refund_request_review(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.approve_refund_request(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.reject_refund_request(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.reconcile_refund_not_sent(uuid, uuid, text, boolean) from public, anon, authenticated;

-- Server-side read of remaining quantities for the guest and owner screens (the app schema is not exposed).
create or replace function public.refund_remaining_for_order(p_order uuid)
returns table (order_item_id uuid, quantity integer, committed integer, pending_requests integer, remaining integer)
language sql stable security definer set search_path = public as $$
  select * from app.refund_remaining(p_order)
$$;
revoke execute on function public.refund_remaining_for_order(uuid) from public, anon, authenticated;
