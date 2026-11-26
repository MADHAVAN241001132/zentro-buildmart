-- ZENTRO BuildMart: durable Razorpay initialisation, expiry reversal and late-payment recovery (Priority 1 slice 2).
--
-- Order of events for an online Guest order:
--   1. guest_checkout_place commits the order, reservation and coupon redemption (migration 0049).
--   2. guest_payment_init_claim records the intent to call the provider BEFORE any provider call (status 'calling',
--      with a lease). Only one caller holds the claim; the lease prevents a second call while one is in flight.
--   3. The application calls the provider OUTSIDE the database transaction and reports one of three outcomes:
--        created   a provider order id was returned (checked against the expected amount and currency);
--        refused   the provider explicitly refused the request (safe to show and retry only on user action);
--        uncertain a timeout, network failure or unparseable response: the provider may or may not have created an order.
--   4. guest_payment_init_attach stores the payment attempt from a 'created' record. If it fails, the provider
--      order id is still durable and a later attach (or a late webhook) can use it.
-- A lapsed 'calling' lease becomes 'uncertain' and is never retried automatically. Uncertain outcomes are reconciled
-- by an authorised platform administrator from the provider's own records.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists payment_initialisations (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references stores(id) on delete cascade,
  order_id                 uuid not null unique references orders(id) on delete cascade,
  provider                 text not null check (provider in ('razorpay','simulator')),
  expected_amount_paise    bigint not null check (expected_amount_paise > 0),
  currency                 text not null default 'INR' check (currency = 'INR'),
  status                   text not null check (status in
                             ('calling','created','attached','refused','uncertain','amount_mismatch','expired')),
  provider_order_id        text unique,
  attempts                 integer not null default 0 check (attempts >= 0),
  lease_until              timestamptz,
  safe_error               text check (safe_error is null or length(safe_error) <= 300),
  reconciliation_status    text not null default 'none' check (reconciliation_status in ('none','required','resolved')),
  reconciled_by            uuid references profiles(id),
  reconciled_at            timestamptz,
  reconciliation_note      text check (reconciliation_note is null or length(reconciliation_note) <= 500),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table payment_initialisations enable row level security;
revoke all on payment_initialisations from public, anon, authenticated;

create table if not exists payment_initialisation_attempts (
  id          uuid primary key default gen_random_uuid(),
  init_id     uuid not null references payment_initialisations(id) on delete cascade,
  attempt_no  integer not null check (attempt_no >= 1),
  outcome     text not null,
  safe_detail text check (safe_detail is null or length(safe_detail) <= 300),
  created_at  timestamptz not null default now()
);
alter table payment_initialisation_attempts enable row level security;
revoke all on payment_initialisation_attempts from public, anon, authenticated;

-- Verified money that could not be applied automatically. Nothing is dropped: each row waits for a decision.
create table if not exists late_payments (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid references stores(id) on delete cascade,
  order_id            uuid references orders(id) on delete set null,
  provider            text not null check (provider in ('razorpay','simulator')),
  provider_order_id   text,
  provider_payment_id text not null,
  amount_paise        bigint not null check (amount_paise >= 0),
  currency            text not null default 'INR' check (currency = 'INR'),
  reason              text not null check (reason in
                        ('after_cancellation','after_reservation_expiry','amount_mismatch',
                         'provider_order_not_attached','unmatched_provider_order')),
  status              text not null default 'open' check (status in
                        ('open','refund_requested','fulfilment_approved','dismissed')),
  resolution_note     text check (resolution_note is null or length(resolution_note) <= 500),
  resolved_by         uuid references profiles(id),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index if not exists late_payments_open_idx on late_payments(status, created_at) where status = 'open';
alter table late_payments enable row level security;
revoke all on late_payments from public, anon, authenticated;
create policy late_payments_owner_read on late_payments for select to authenticated
  using (store_id is not null and app.is_store_member(store_id, array['owner']));
grant select on late_payments to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Claim before calling the provider
-- ---------------------------------------------------------------------------
create or replace function public.guest_payment_init_claim(
  p_order uuid, p_provider text, p_user_retry boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  i payment_initialisations%rowtype;
begin
  if not app.is_server() then raise exception 'payment initialisation is server-only' using errcode = '42501'; end if;
  if p_provider not in ('razorpay','simulator') then raise exception 'unknown payment provider' using errcode = '22023'; end if;

  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.payment_method <> 'online' then raise exception 'order is not an online payment' using errcode = 'P0001'; end if;
  if o.order_status = 'CANCELLED' or o.payment_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') then
    return jsonb_build_object('action', 'closed');
  end if;
  if exists (select 1 from payments where order_id = p_order) then
    return jsonb_build_object('action', 'attached');
  end if;

  select * into i from payment_initialisations where order_id = p_order for update;
  if not found then
    insert into payment_initialisations (store_id, order_id, provider, expected_amount_paise, status, attempts, lease_until)
    values (o.store_id, p_order, p_provider, o.total_paise, 'calling', 1, now() + interval '2 minutes')
    returning * into i;
    insert into payment_initialisation_attempts (init_id, attempt_no, outcome) values (i.id, 1, 'claimed');
    return jsonb_build_object('action', 'call', 'init_id', i.id, 'provider', i.provider,
                              'amount_paise', i.expected_amount_paise, 'currency', i.currency);
  end if;

  if i.provider <> p_provider then raise exception 'provider does not match this order' using errcode = '22023'; end if;

  case i.status
    when 'attached' then
      return jsonb_build_object('action', 'attached');
    when 'created' then
      return jsonb_build_object('action', 'attach', 'init_id', i.id);
    when 'calling' then
      if i.lease_until > now() then return jsonb_build_object('action', 'busy'); end if;
      -- The previous call's outcome is unknown. Never repeat it automatically.
      update payment_initialisations
         set status = 'uncertain', reconciliation_status = 'required', lease_until = null,
             safe_error = 'lease lapsed before the provider outcome was recorded', updated_at = now()
       where id = i.id;
      insert into payment_initialisation_attempts (init_id, attempt_no, outcome, safe_detail)
      values (i.id, i.attempts, 'lease_lapsed', 'outcome unknown');
      return jsonb_build_object('action', 'uncertain');
    when 'uncertain' then
      return jsonb_build_object('action', 'uncertain');
    when 'amount_mismatch' then
      return jsonb_build_object('action', 'review');
    when 'refused' then
      if not p_user_retry then return jsonb_build_object('action', 'refused'); end if;
      update payment_initialisations
         set status = 'calling', attempts = attempts + 1, lease_until = now() + interval '2 minutes', updated_at = now()
       where id = i.id;
      insert into payment_initialisation_attempts (init_id, attempt_no, outcome)
      values (i.id, i.attempts + 1, 'user_retry_claimed');
      return jsonb_build_object('action', 'call', 'init_id', i.id, 'provider', i.provider,
                                'amount_paise', i.expected_amount_paise, 'currency', i.currency);
    when 'expired' then
      return jsonb_build_object('action', 'closed');
  end case;
  raise exception 'unexpected initialisation state' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Record the provider outcome
-- ---------------------------------------------------------------------------
create or replace function public.guest_payment_init_finish(
  p_init uuid, p_outcome text, p_provider_order_id text, p_amount_paise bigint, p_currency text, p_safe_detail text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i payment_initialisations%rowtype;
  v_detail text := left(coalesce(p_safe_detail, ''), 300);
begin
  if not app.is_server() then raise exception 'payment initialisation is server-only' using errcode = '42501'; end if;
  select * into i from payment_initialisations where id = p_init for update;
  if not found then raise exception 'initialisation not found' using errcode = 'P0002'; end if;
  if i.status <> 'calling' then
    return jsonb_build_object('action', 'ignored', 'status', i.status);
  end if;

  if p_outcome = 'created' and nullif(btrim(coalesce(p_provider_order_id, '')), '') is not null then
    if p_amount_paise is distinct from i.expected_amount_paise or p_currency is distinct from 'INR' then
      update payment_initialisations
         set status = 'amount_mismatch', provider_order_id = p_provider_order_id, lease_until = null,
             reconciliation_status = 'required', safe_error = 'provider amount or currency differs from the order',
             updated_at = now()
       where id = i.id;
      insert into payment_initialisation_attempts (init_id, attempt_no, outcome, safe_detail)
      values (i.id, i.attempts, 'amount_mismatch', 'provider amount or currency differs');
      return jsonb_build_object('action', 'amount_mismatch');
    end if;
    update payment_initialisations
       set status = 'created', provider_order_id = p_provider_order_id, lease_until = null, safe_error = null,
           updated_at = now()
     where id = i.id;
    insert into payment_initialisation_attempts (init_id, attempt_no, outcome) values (i.id, i.attempts, 'created');
    return jsonb_build_object('action', 'created');
  elsif p_outcome = 'refused' then
    update payment_initialisations
       set status = 'refused', lease_until = null, safe_error = v_detail, updated_at = now()
     where id = i.id;
    insert into payment_initialisation_attempts (init_id, attempt_no, outcome, safe_detail)
    values (i.id, i.attempts, 'refused', v_detail);
    return jsonb_build_object('action', 'refused');
  elsif p_outcome in ('uncertain', 'created') then
    -- Ambiguous: a timeout, a lost response, or a 'created' report without an order id.
    update payment_initialisations
       set status = 'uncertain', lease_until = null, reconciliation_status = 'required',
           safe_error = coalesce(nullif(v_detail, ''), 'provider outcome unknown'), updated_at = now()
     where id = i.id;
    insert into payment_initialisation_attempts (init_id, attempt_no, outcome, safe_detail)
    values (i.id, i.attempts, 'uncertain', v_detail);
    return jsonb_build_object('action', 'uncertain');
  end if;
  raise exception 'unknown provider outcome' using errcode = '22023';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Attach a created provider order to the order's payment
-- ---------------------------------------------------------------------------
create or replace function public.guest_payment_init_attach(p_init uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i payment_initialisations%rowtype;
  o orders%rowtype;
begin
  if not app.is_server() then raise exception 'payment initialisation is server-only' using errcode = '42501'; end if;
  select * into i from payment_initialisations where id = p_init for update;
  if not found then raise exception 'initialisation not found' using errcode = 'P0002'; end if;
  if i.status = 'attached' then return jsonb_build_object('action', 'attached'); end if;
  if i.status <> 'created' then return jsonb_build_object('action', 'not_ready', 'status', i.status); end if;

  select * into o from orders where id = i.order_id for update;
  if o.order_status = 'CANCELLED' or o.payment_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') then
    -- The provider order exists but this order can no longer take it. A payment that arrives is recorded
    -- for review by settle_online_payment; it is not attached here.
    return jsonb_build_object('action', 'closed_pending_review');
  end if;

  perform create_payment_attempt(i.order_id, 'online', i.provider, i.provider_order_id,
                                 i.expected_amount_paise, coalesce(o.reservation_expires_at, now() + interval '15 minutes'));
  update payment_initialisations set status = 'attached', safe_error = null, updated_at = now() where id = i.id;
  insert into payment_initialisation_attempts (init_id, attempt_no, outcome) values (i.id, i.attempts, 'attached');
  return jsonb_build_object('action', 'attached');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Authorised reconciliation of uncertain or amount-mismatched outcomes (platform administrators only)
-- ---------------------------------------------------------------------------
-- The administrator confirms the provider order from the provider's own records and supplies its id.
-- 'adopt' stores the id and moves the record to 'created' so it can be attached; 'refused' confirms no order exists.
create or replace function public.guest_payment_init_reconcile(
  p_init uuid, p_actor uuid, p_action text, p_provider_order_id text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i payment_initialisations%rowtype;
begin
  if not app.is_server() then raise exception 'reconciliation is server-only' using errcode = '42501'; end if;
  if not exists (select 1 from platform_admins where profile_id = p_actor) then
    raise exception 'forbidden: platform administrator required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'a reconciliation note is required' using errcode = '22023';
  end if;
  select * into i from payment_initialisations where id = p_init for update;
  if not found then raise exception 'initialisation not found' using errcode = 'P0002'; end if;
  if i.status not in ('uncertain','amount_mismatch') then
    raise exception 'only uncertain or mismatched outcomes are reconciled here' using errcode = 'P0001';
  end if;

  if p_action = 'adopt' then
    if nullif(btrim(coalesce(p_provider_order_id, '')), '') is null then
      raise exception 'provider order id required' using errcode = '22023';
    end if;
    update payment_initialisations
       set status = 'created', provider_order_id = p_provider_order_id, lease_until = null,
           reconciliation_status = 'resolved', reconciled_by = p_actor, reconciled_at = now(),
           reconciliation_note = left(p_note, 500), updated_at = now()
     where id = i.id;
  elsif p_action = 'confirm_no_order' then
    update payment_initialisations
       set status = 'refused', reconciliation_status = 'resolved', reconciled_by = p_actor, reconciled_at = now(),
           reconciliation_note = left(p_note, 500), updated_at = now()
     where id = i.id;
  else
    raise exception 'unknown reconciliation action' using errcode = '22023';
  end if;
  insert into payment_initialisation_attempts (init_id, attempt_no, outcome, safe_detail)
  values (i.id, i.attempts, 'reconciled:' || p_action, left(p_note, 300));
  return jsonb_build_object('action', 'reconciled', 'status', case when p_action = 'adopt' then 'created' else 'refused' end);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Settlement: keep every verified payment; route unmatched and late ones to review
-- ---------------------------------------------------------------------------
create or replace function public.settle_online_payment(
  p_provider text, p_provider_order_id text, p_provider_payment_id text,
  p_amount_paise bigint, p_success boolean, p_failure_reason text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_order orders%rowtype;
  v_init payment_initialisations%rowtype;
begin
  if not app.is_server() then
    raise exception 'settlement is server-only' using errcode = '42501';
  end if;

  select * into v_payment from payments
  where provider = p_provider and provider_order_id = p_provider_order_id
  for update;
  if not found then
    -- No payment row: the provider order may be one we created but could not attach. A verified payment
    -- for it is recorded for review rather than dropped.
    select * into v_init from payment_initialisations
    where provider = p_provider and provider_order_id = p_provider_order_id;
    if not found then
      if p_success then
        insert into late_payments (store_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
        values (null, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise, 'unmatched_provider_order')
        on conflict (provider, provider_payment_id) do nothing;
        return 'unmatched_payment_recorded';
      end if;
      return 'unknown_payment';
    end if;
    if not p_success then return 'failed_unattached'; end if;
    insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
    values (v_init.store_id, v_init.order_id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise,
            'provider_order_not_attached')
    on conflict (provider, provider_payment_id) do nothing;
    return 'late_payment_requires_review';
  end if;

  if v_payment.status = 'PAID' then return 'already_paid'; end if;
  if v_payment.status not in ('PENDING','PROCESSING') then
    if p_success and v_payment.status in ('FAILED','EXPIRED') then
      insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
      values (v_payment.store_id, v_payment.order_id, p_provider, p_provider_order_id, p_provider_payment_id,
              p_amount_paise, 'after_reservation_expiry')
      on conflict (provider, provider_payment_id) do nothing;
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
    insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
    values (v_order.store_id, v_order.id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise,
            'amount_mismatch')
    on conflict (provider, provider_payment_id) do nothing;
    return 'amount_mismatch';
  end if;

  if v_order.order_status = 'CANCELLED' or v_order.reservation_expires_at < now() then
    update payments set status = 'FAILED', provider_payment_id = p_provider_payment_id,
           failure_reason = 'paid after reservation expired', updated_at = now()
    where id = v_payment.id;
    insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
    values (v_order.store_id, v_order.id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise,
            case when v_order.order_status = 'CANCELLED' then 'after_cancellation' else 'after_reservation_expiry' end)
    on conflict (provider, provider_payment_id) do nothing;
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

-- ---------------------------------------------------------------------------
-- 7. Expiry: release stock and coupon redemptions, mark initialisations, keep provider ids
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_payments()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_attempts integer;
  v_orders integer := 0;
  v_coupons integer := 0;
  v_order record;
  v_red record;
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

    -- A coupon counted on this order is released with it. The row is removed, so a repeat run finds nothing.
    for v_red in select * from coupon_redemptions where order_id = v_order.id for update loop
      update coupons set used_count = greatest(used_count - 1, 0) where id = v_red.coupon_id;
      delete from coupon_redemptions where id = v_red.id;
      v_coupons := v_coupons + 1;
    end loop;

    update payments set status = 'EXPIRED', updated_at = now()
    where order_id = v_order.id and status in ('PENDING','CASH_PENDING','PROCESSING');

    -- Provider orders not yet attached stay findable: a later payment is recorded for review, never dropped.
    update payment_initialisations
       set status = case when status = 'attached' then status else 'expired' end,
           reconciliation_status = case when status in ('calling','uncertain','created','amount_mismatch')
                                        then 'required' else reconciliation_status end,
           lease_until = null, updated_at = now()
     where order_id = v_order.id and status <> 'attached';

    update orders set order_status = 'CANCELLED', payment_status = 'EXPIRED',
           cancelled_at = now(), cancel_reason = 'reservation expired', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, store_id, from_status, to_status, note)
    values (v_order.id, v_order.store_id, 'PLACED', 'CANCELLED', 'reservation expired');
    v_orders := v_orders + 1;
  end loop;

  return jsonb_build_object('attempts_expired', v_attempts, 'orders_cancelled', v_orders, 'coupon_redemptions_released', v_coupons);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Owner decision on a late payment (no money moves here; refunds go through the refund workflow)
-- ---------------------------------------------------------------------------
create or replace function public.late_payment_decide(
  p_id uuid, p_actor uuid, p_decision text, p_note text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  l late_payments%rowtype;
  v_allowed boolean;
begin
  if not app.is_server() then raise exception 'late payment decisions are server-only' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'a note is required' using errcode = '22023'; end if;
  select * into l from late_payments where id = p_id for update;
  if not found then raise exception 'late payment not found' using errcode = 'P0002'; end if;
  if l.status <> 'open' then raise exception 'this late payment is already decided' using errcode = 'P0001'; end if;

  if l.store_id is null then
    v_allowed := exists (select 1 from platform_admins where profile_id = p_actor);
  else
    v_allowed := exists (select 1 from store_owners where store_id = l.store_id and profile_id = p_actor
                         and role = 'owner' and is_active);
  end if;
  if not v_allowed then raise exception 'forbidden: an owner of this store is required' using errcode = '42501'; end if;

  if p_decision not in ('refund','fulfil','dismiss') then raise exception 'unknown decision' using errcode = '22023'; end if;
  if p_decision = 'fulfil' and (l.order_id is null or l.reason not in ('after_reservation_expiry','provider_order_not_attached')) then
    raise exception 'this payment cannot be fulfilled from here; refund or dismiss it' using errcode = 'P0001';
  end if;

  update late_payments
     set status = case p_decision when 'refund' then 'refund_requested'
                                  when 'fulfil' then 'fulfilment_approved' else 'dismissed' end,
         resolution_note = left(p_note, 500), resolved_by = p_actor, resolved_at = now()
   where id = p_id;
  return 'decided';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.guest_payment_init_claim(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.guest_payment_init_finish(uuid, text, text, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.guest_payment_init_attach(uuid) from public, anon, authenticated;
revoke execute on function public.guest_payment_init_reconcile(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.late_payment_decide(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.guest_payment_init_claim(uuid, text, boolean) to service_role;
grant execute on function public.guest_payment_init_finish(uuid, text, text, bigint, text, text) to service_role;
grant execute on function public.guest_payment_init_attach(uuid) to service_role;
grant execute on function public.guest_payment_init_reconcile(uuid, uuid, text, text, text) to service_role;
grant execute on function public.late_payment_decide(uuid, uuid, text, text) to service_role;
