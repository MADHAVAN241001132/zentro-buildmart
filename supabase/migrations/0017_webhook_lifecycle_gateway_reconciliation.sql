-- ZENTRO BuildMart migration 0017
-- 1. Payment webhook lifecycle: events are received, processed under a lease, processed or failed, with attempts.
-- 2. Gateway refunds: a persisted send state. An interrupted or ambiguous send blocks automatic resubmission
--    until it is reconciled against Razorpay. Units stay reserved while a refund is ambiguous.
-- Migrations 0001-0016 are not modified.

-- ---------------------------------------------------------------------------
-- 1. Payment events lifecycle
-- ---------------------------------------------------------------------------

alter table payment_events
  add column if not exists status      text not null default 'received'
    check (status in ('received','processing','processed','failed')),
  add column if not exists attempts    integer not null default 0 check (attempts >= 0),
  add column if not exists lease_until timestamptz,
  add column if not exists last_error  text;

update payment_events set status = 'processed' where processed_at is not null and status = 'received';

-- Takes ownership of an event for one worker. A second delivery while a lease is live is reported as busy, so the
-- route answers 409 and Razorpay retries later. A crashed worker's lease expires after two minutes and the event
-- is taken again. Financial functions are idempotent, so a repeat after a crash cannot apply the outcome twice.
create or replace function public.begin_payment_event(
  p_provider text, p_event_id text, p_event_type text, p_payload jsonb, p_signature_valid boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e payment_events%rowtype;
begin
  if not app.is_server() then raise exception 'payment events are server-only' using errcode = '42501'; end if;
  insert into payment_events (provider, provider_event_id, event_type, payload, signature_valid)
  values (p_provider, p_event_id, p_event_type, p_payload, p_signature_valid)
  on conflict (provider, provider_event_id) do nothing;

  select * into e from payment_events where provider = p_provider and provider_event_id = p_event_id for update;
  if e.status = 'processed' then
    return jsonb_build_object('action', 'processed', 'event_id', e.id, 'attempts', e.attempts);
  end if;
  if e.status = 'processing' and e.lease_until > now() then
    return jsonb_build_object('action', 'busy', 'event_id', e.id, 'attempts', e.attempts);
  end if;
  update payment_events
     set status = 'processing', attempts = attempts + 1, lease_until = now() + interval '2 minutes'
   where id = e.id
  returning * into e;
  return jsonb_build_object('action', 'process', 'event_id', e.id, 'attempts', e.attempts);
end $$;

create or replace function public.complete_payment_event(p_event uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_server() then raise exception 'payment events are server-only' using errcode = '42501'; end if;
  update payment_events
     set status = 'processed', processed_at = now(), lease_until = null, last_error = null
   where id = p_event and status = 'processing';
  return found;
end $$;

create or replace function public.fail_payment_event(p_event uuid, p_error text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_server() then raise exception 'payment events are server-only' using errcode = '42501'; end if;
  update payment_events
     set status = 'failed', lease_until = null, last_error = left(coalesce(p_error, 'processing failed'), 500)
   where id = p_event and status in ('processing','received','failed');
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Gateway refund state
-- ---------------------------------------------------------------------------
-- status stays requested -> processing -> succeeded | failed, so units stay reserved while a send is unresolved.
-- gateway_state records what happened at the gateway:
--   none       not sent yet
--   sending    a send is in progress (lease); the outcome is not yet known
--   ambiguous  the send may or may not have reached Razorpay; blocked until reconciled
--   sent       Razorpay accepted the request and returned its id

alter table refunds
  add column if not exists gateway_state      text not null default 'none'
    check (gateway_state in ('none','sending','ambiguous','sent')),
  add column if not exists gateway_attempts   integer not null default 0 check (gateway_attempts >= 0),
  add column if not exists gateway_lease_until timestamptz,
  add column if not exists gateway_error      text,
  add column if not exists gateway_ambiguous_at timestamptz;

-- Claims the right to send a refund to the gateway. Only one caller can hold it. A send that is found interrupted
-- (its lease expired before an outcome was recorded) is marked ambiguous and is never sent automatically again.
create or replace function public.begin_gateway_refund(p_refund uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
  v_payment_ref text;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.refund_method <> 'online' then raise exception 'only gateway refunds are sent to the gateway' using errcode = 'P0001'; end if;
  if r.status <> 'requested' then
    return jsonb_build_object('action', 'none', 'status', r.status, 'gateway_state', r.gateway_state);
  end if;

  if r.gateway_state = 'sending' then
    if r.gateway_lease_until > now() then
      return jsonb_build_object('action', 'busy', 'status', r.status, 'gateway_state', r.gateway_state);
    end if;
    update refunds set gateway_state = 'ambiguous', gateway_ambiguous_at = now(),
                       gateway_error = 'the send stopped before its outcome was recorded'
     where id = r.id;
    perform app.audit(r.store_id, 'refund.gateway_ambiguous', 'refunds', r.id, null,
      jsonb_build_object('reason', 'lease expired while sending', 'attempts', r.gateway_attempts));
    return jsonb_build_object('action', 'blocked', 'status', r.status, 'gateway_state', 'ambiguous');
  end if;

  if r.gateway_state = 'ambiguous' then
    return jsonb_build_object('action', 'blocked', 'status', r.status, 'gateway_state', r.gateway_state);
  end if;
  if r.gateway_state = 'sent' then
    return jsonb_build_object('action', 'none', 'status', r.status, 'gateway_state', r.gateway_state);
  end if;

  select provider_payment_id into v_payment_ref from payments where id = r.payment_id;
  if v_payment_ref is null then
    raise exception 'this payment has no gateway payment id' using errcode = 'P0001';
  end if;

  update refunds
     set gateway_state = 'sending',
         gateway_attempts = gateway_attempts + 1,
         gateway_lease_until = now() + interval '90 seconds',
         gateway_error = null
   where id = r.id;
  perform app.audit(r.store_id, 'refund.gateway_send_started', 'refunds', r.id, null,
    jsonb_build_object('attempt', r.gateway_attempts + 1, 'amount_paise', r.amount_paise));
  return jsonb_build_object(
    'action', 'send',
    'status', r.status,
    'gateway_state', 'sending',
    'amount_paise', r.amount_paise,
    'provider_payment_id', v_payment_ref,
    'attempt', r.gateway_attempts + 1);
end $$;

-- Records that the outcome of a send is unknown (network failure, timeout, 5xx). Blocks automatic resubmission.
create or replace function public.mark_refund_ambiguous(p_refund uuid, p_error text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status <> 'requested' then return r.status; end if;
  if r.gateway_state = 'ambiguous' then return 'ambiguous'; end if;
  if r.gateway_state = 'sent' then return 'sent'; end if;
  update refunds set gateway_state = 'ambiguous', gateway_ambiguous_at = now(),
                     gateway_error = left(coalesce(p_error, 'outcome unknown'), 300)
   where id = r.id;
  perform app.audit(r.store_id, 'refund.gateway_ambiguous', 'refunds', r.id, null,
    jsonb_build_object('reason', coalesce(p_error, 'outcome unknown')));
  return 'ambiguous';
end $$;

-- Records a gateway id for a refund (sent, or found by reconciliation). Replaces the 0016 version to set gateway_state.
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
  update refunds
     set status = 'processing', provider_refund_id = p_provider_refund_id,
         gateway_state = 'sent', gateway_error = null, gateway_lease_until = null
   where id = r.id;
  perform app.audit(r.store_id, 'refund.sent_to_gateway', 'refunds', r.id, null,
    jsonb_build_object('provider_refund_id', p_provider_refund_id, 'amount_paise', r.amount_paise));
  return 'processing';
end $$;

-- Replaces the 0016 version: an ambiguous refund cannot be failed directly; it must be reconciled first.
create or replace function public.fail_refund(p_refund uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status = 'failed' then return 'failed'; end if;
  if r.gateway_state = 'ambiguous' then
    raise exception 'refund % has an unknown gateway outcome and must be reconciled first', r.id using errcode = 'P0001';
  end if;
  if r.status not in ('requested','processing') then
    raise exception 'refund is % and cannot fail', r.status using errcode = 'P0001';
  end if;
  update refunds set status = 'failed', failure_reason = left(coalesce(p_reason, 'refused by the gateway'), 300),
                     processed_at = now(), gateway_state = 'none', gateway_lease_until = null
   where id = r.id;
  perform app.audit(r.store_id, 'refund.failed', 'refunds', r.id, null,
    jsonb_build_object('reason', coalesce(p_reason, 'refused by the gateway')));
  return 'failed';
end $$;

-- Applies a signed gateway refund event. If the gateway id is not yet known (the send's response was lost), the
-- event is linked to our refund through its receipt, which is our refund id. Unknown events change nothing.
create or replace function public.settle_refund_gateway_event(
  p_gateway_refund_id text, p_receipt text, p_success boolean, p_failure_reason text default null, p_amount_paise bigint default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  if p_gateway_refund_id is null or p_gateway_refund_id = '' then return 'unknown'; end if;

  select * into r from refunds where provider_refund_id = p_gateway_refund_id for update;
  if not found then
    if p_receipt is null or p_receipt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'unknown';
    end if;
    select * into r from refunds where id = p_receipt::uuid for update;
    if not found or r.refund_method <> 'online' or r.provider_refund_id is not null
       or r.status not in ('requested','processing') then
      return 'unknown';
    end if;
    update refunds set status = 'processing', provider_refund_id = p_gateway_refund_id,
                       gateway_state = 'sent', gateway_error = null, gateway_lease_until = null
     where id = r.id;
    perform app.audit(r.store_id, 'refund.linked_from_gateway_event', 'refunds', r.id, null,
      jsonb_build_object('provider_refund_id', p_gateway_refund_id));
  end if;
  return public.settle_refund(p_gateway_refund_id, p_success, p_failure_reason, p_amount_paise);
end $$;

-- Authorised recovery: a manager or owner confirms that the gateway holds no refund for this request, after the
-- caller has checked the gateway's own list of refunds. Releases the units. Only for ambiguous refunds.
create or replace function public.reconcile_refund_not_sent(p_refund uuid, p_actor uuid, p_reason text) returns text
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
  -- Razorpay's refund list can lag behind an accepted request, so a refund is only confirmed not sent after a wait.
  if r.gateway_ambiguous_at is null or r.gateway_ambiguous_at > now() - interval '15 minutes' then
    raise exception 'wait at least 15 minutes after an unknown send before confirming it was not sent' using errcode = 'P0001';
  end if;
  update refunds
     set status = 'failed', failure_reason = left('confirmed not sent at the gateway: ' || btrim(p_reason), 300),
         processed_at = now(), gateway_state = 'none', gateway_lease_until = null
   where id = r.id;
  perform app.audit(r.store_id, 'refund.confirmed_not_sent', 'refunds', r.id, null,
    jsonb_build_object('actor_id', p_actor, 'reason', btrim(p_reason), 'amount_paise', r.amount_paise));
  return 'failed';
end $$;

-- Records that an owner or manager checked the gateway for this refund. Outcome is one of the reconcile results.
create or replace function public.log_refund_reconciliation(p_refund uuid, p_actor uuid, p_outcome text, p_detail jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into r from refunds where id = p_refund;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  perform app.assert_store_manager(r.store_id, p_actor);
  perform app.audit(r.store_id, 'refund.reconciled', 'refunds', r.id, null,
    jsonb_build_object('actor_id', p_actor, 'outcome', p_outcome) || coalesce(p_detail, '{}'::jsonb));
end $$;

-- Server-only functions: the service role (used by the webhook and the owner server actions) keeps execute.
revoke execute on function public.begin_payment_event(text, text, text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.complete_payment_event(uuid) from public, anon, authenticated;
revoke execute on function public.fail_payment_event(uuid, text) from public, anon, authenticated;
revoke execute on function public.begin_gateway_refund(uuid) from public, anon, authenticated;
revoke execute on function public.mark_refund_ambiguous(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_refund_processing(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_refund(uuid, text) from public, anon, authenticated;
revoke execute on function public.settle_refund_gateway_event(text, text, boolean, text, bigint) from public, anon, authenticated;
revoke execute on function public.reconcile_refund_not_sent(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.log_refund_reconciliation(uuid, uuid, text, jsonb) from public, anon, authenticated;
