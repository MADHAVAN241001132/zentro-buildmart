-- 0044: durable account provisioning.
-- A provisioning request records one intent to create a store account (owner, manager or staff). It moves
-- through explicit states. Each external Auth step is recorded before the database step that depends on it,
-- so an interrupted request resumes from recorded facts. No password is stored anywhere in this schema.
-- Functions run through the server (service role) only. Each one re-checks the acting account in the database.

create table account_provisioning_requests (
  id                    uuid primary key default gen_random_uuid(),
  actor_id              uuid not null references profiles(id),
  actor_type            text not null check (actor_type in ('super_admin', 'shop_owner')),
  request_key           uuid not null,
  store_id              uuid not null references stores(id) on delete cascade,
  email                 text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  full_name             text not null check (length(btrim(full_name)) between 1 and 200),
  phone                 text,
  role                  text not null check (role in ('owner', 'manager', 'staff')),
  permissions           text[] not null default '{}',
  onboarding_id         uuid references store_onboardings(id),
  profile_id            uuid references profiles(id),
  status                text not null default 'REQUESTED' check (status in (
                          'REQUESTED', 'AUTH_PENDING', 'AUTH_CREATED', 'MEMBERSHIP_PENDING', 'MEMBERSHIP_LINKED',
                          'ONBOARDING_LINKED', 'COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED')),
  attempt_count         integer not null default 0 check (attempt_count >= 0),
  claim_token           uuid,
  claimed_until         timestamptz,
  failure_code          text,
  failure_message       text check (failure_message is null or length(failure_message) <= 300),
  reconciliation_reason text check (reconciliation_reason is null or reconciliation_reason in (
                          'existing_account', 'auth_outcome_uncertain', 'membership_conflict')),
  reconciliation_note   text check (reconciliation_note is null or length(reconciliation_note) <= 300),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz,
  constraint account_provisioning_actor_key unique (actor_id, request_key),
  constraint account_provisioning_completion check ((status = 'COMPLETED') = (completed_at is not null)),
  constraint account_provisioning_profile check (
    profile_id is not null or status in ('REQUESTED', 'AUTH_PENDING', 'FAILED', 'RECONCILIATION_REQUIRED'))
);

-- One open request per store and email. Completed and failed requests do not block a new one.
create unique index account_provisioning_open_email
  on account_provisioning_requests (store_id, email)
  where status not in ('COMPLETED', 'FAILED');
create index account_provisioning_status_idx on account_provisioning_requests (status, updated_at);
create index account_provisioning_profile_idx on account_provisioning_requests (profile_id) where profile_id is not null;

create table account_provisioning_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references account_provisioning_requests(id) on delete cascade,
  from_status text,
  to_status   text not null,
  attempt     integer not null default 0,
  code        text,
  message     text,
  actor_id    uuid,
  created_at  timestamptz not null default now()
);
create index account_provisioning_events_request_idx on account_provisioning_events (request_id, id);

alter table account_provisioning_requests enable row level security;
alter table account_provisioning_events enable row level security;
revoke all on account_provisioning_requests, account_provisioning_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.prov_event(p_id uuid, p_from text, p_to text, p_attempt integer, p_code text, p_message text, p_actor uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into account_provisioning_events (request_id, from_status, to_status, attempt, code, message, actor_id)
  values (p_id, p_from, p_to, p_attempt, p_code, left(p_message, 300), p_actor);
$$;

-- Who may start a request. Platform administrators may create any role, including owners. A store owner may
-- create any role. A manager may create manager and staff accounts only with staff management, and may grant
-- only permissions it holds. Staff cannot provision accounts.
create or replace function app.prov_assert_actor(p_store uuid, p_actor uuid, p_actor_type text, p_role text, p_perms text[])
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_role text;
  v_perm text;
begin
  if p_actor_type = 'super_admin' then
    if not exists (select 1 from platform_admins where profile_id = p_actor) then
      raise exception 'forbidden: not a platform administrator' using errcode = '42501';
    end if;
  elsif p_actor_type = 'shop_owner' then
    select so.role into v_role from store_owners so
     where so.store_id = p_store and so.profile_id = p_actor and so.is_active;
    if v_role is null then
      raise exception 'forbidden: not an active member of this store' using errcode = '42501';
    end if;
    if v_role <> 'owner' then
      if v_role <> 'manager' or p_role = 'owner' or not exists (
           select 1 from store_member_permissions smp
            where smp.store_id = p_store and smp.profile_id = p_actor and smp.permission_key = 'staff_management') then
        raise exception 'forbidden: staff management is required' using errcode = '42501';
      end if;
      foreach v_perm in array coalesce(p_perms, '{}') loop
        if not exists (select 1 from store_member_permissions smp
                        where smp.store_id = p_store and smp.profile_id = p_actor and smp.permission_key = v_perm) then
          raise exception 'forbidden: a permission cannot be granted that the actor does not hold' using errcode = '42501';
        end if;
      end loop;
    end if;
  else
    raise exception 'invalid actor type' using errcode = '22023';
  end if;
  foreach v_perm in array coalesce(p_perms, '{}') loop
    if not exists (select 1 from store_permission_keys where key = v_perm) then
      raise exception 'unknown permission key' using errcode = '22023';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Create (idempotent by actor and request key). Existing Auth accounts are detected here and the request is
-- routed to reconciliation. Nothing is linked to an existing account at this point.
-- ---------------------------------------------------------------------------
create or replace function app.prov_create(
  p_store uuid, p_actor uuid, p_actor_type text, p_key uuid, p_email text, p_full_name text, p_phone text,
  p_role text, p_permissions text[], p_onboarding uuid)
returns account_provisioning_requests
language plpgsql security definer set search_path = public, auth, app, pg_temp as $$
declare
  r account_provisioning_requests;
  v_email text := lower(btrim(p_email));
  v_perms text[] := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p_permissions, '{}')) x);
  v_existing uuid;
begin
  if not app.is_server() then
    raise exception 'forbidden: provisioning runs on the server' using errcode = '42501';
  end if;
  select * into r from account_provisioning_requests where actor_id = p_actor and request_key = p_key;
  if found then return r; end if;

  if p_role not in ('owner', 'manager', 'staff') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if not exists (select 1 from stores where id = p_store) then
    raise exception 'store not found' using errcode = 'P0002';
  end if;
  perform app.prov_assert_actor(p_store, p_actor, p_actor_type, p_role, v_perms);
  if p_onboarding is not null then
    if p_actor_type <> 'super_admin' then
      raise exception 'forbidden: onboarding is administered by platform administrators' using errcode = '42501';
    end if;
    if not exists (select 1 from store_onboardings where id = p_onboarding and store_id = p_store and owner_profile_id is null) then
      raise exception 'onboarding is not available for this store' using errcode = 'P0001';
    end if;
  end if;

  select u.id into v_existing from auth.users u where lower(u.email) = v_email order by u.created_at limit 1;

  begin
    insert into account_provisioning_requests (
      actor_id, actor_type, request_key, store_id, email, full_name, phone, role, permissions, onboarding_id,
      status, reconciliation_reason)
    values (
      p_actor, p_actor_type, p_key, p_store, v_email, btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''),
      p_role, v_perms, p_onboarding,
      case when v_existing is null then 'REQUESTED' else 'RECONCILIATION_REQUIRED' end,
      case when v_existing is null then null else 'existing_account' end)
    returning * into r;
  exception when unique_violation then
    raise exception 'a provisioning request for this email is already open' using errcode = 'P0001', hint = 'open_request_exists';
  end;

  perform app.prov_event(r.id, null, r.status, 0,
    case when v_existing is null then 'created' else 'existing_account' end,
    case when v_existing is null then 'Request created' else 'An account with this email already exists; administrator review is required' end,
    p_actor);
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Claim: one worker at a time, with a lease. Returns the next step from recorded facts.
-- A request whose Auth step was started but has no recorded result is not retried: its outcome is uncertain.
-- ---------------------------------------------------------------------------
create or replace function app.prov_claim(p_id uuid, p_lease_seconds integer default 120)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r account_provisioning_requests;
  v_token uuid := gen_random_uuid();
  v_member boolean;
  v_step text;
  v_status text;
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  select * into r from account_provisioning_requests where id = p_id for update;
  if not found then raise exception 'provisioning request not found' using errcode = 'P0002'; end if;

  if r.status = 'COMPLETED' then return jsonb_build_object('outcome', 'completed', 'profile_id', r.profile_id); end if;
  if r.status = 'RECONCILIATION_REQUIRED' then return jsonb_build_object('outcome', 'reconciliation', 'reason', r.reconciliation_reason); end if;
  if r.claim_token is not null and r.claimed_until > now() then
    return jsonb_build_object('outcome', 'busy');
  end if;

  if r.status = 'AUTH_PENDING' and r.profile_id is null then
    update account_provisioning_requests
       set status = 'RECONCILIATION_REQUIRED', reconciliation_reason = 'auth_outcome_uncertain',
           claim_token = null, claimed_until = null, updated_at = now()
     where id = p_id;
    perform app.prov_event(p_id, r.status, 'RECONCILIATION_REQUIRED', r.attempt_count, 'auth_outcome_uncertain',
      'An Auth request was interrupted without a recorded result; it is not repeated automatically', null);
    return jsonb_build_object('outcome', 'reconciliation', 'reason', 'auth_outcome_uncertain');
  end if;

  -- Work out the next step from recorded facts.
  select exists (select 1 from store_owners so where so.store_id = r.store_id and so.profile_id = r.profile_id) into v_member;
  if r.profile_id is null then v_step := 'auth';
  elsif not v_member then v_step := 'membership';
  elsif r.onboarding_id is not null and not exists (
          select 1 from store_onboardings o where o.id = r.onboarding_id and o.owner_profile_id = r.profile_id) then v_step := 'onboarding';
  else v_step := 'complete';
  end if;

  v_status := case v_step when 'auth' then 'AUTH_PENDING' when 'membership' then 'MEMBERSHIP_PENDING' else r.status end;
  if v_step = 'onboarding' then v_status := 'MEMBERSHIP_LINKED'; end if;
  if v_step = 'complete' then v_status := case when r.status = 'ONBOARDING_LINKED' or r.onboarding_id is null then 'MEMBERSHIP_LINKED' else r.status end; end if;

  update account_provisioning_requests
     set claim_token = v_token, claimed_until = now() + make_interval(secs => p_lease_seconds),
         attempt_count = attempt_count + 1, status = v_status, failure_code = null, failure_message = null,
         updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, r.status, v_status, r.attempt_count + 1, 'claimed', 'Step: ' || v_step, null);

  return jsonb_build_object('outcome', 'claimed', 'token', v_token, 'step', v_step, 'profile_id', r.profile_id);
end $$;

create or replace function app.prov_check_claim(p_id uuid, p_token uuid)
returns account_provisioning_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare r account_provisioning_requests;
begin
  select * into r from account_provisioning_requests where id = p_id for update;
  if not found then raise exception 'provisioning request not found' using errcode = 'P0002'; end if;
  if r.claim_token is null or r.claim_token <> p_token or r.claimed_until <= now() then
    raise exception 'stale claim: another attempt owns this request' using errcode = '55000';
  end if;
  return r;
end $$;

-- Auth account created by the Auth step. Recorded before any database membership work.
create or replace function app.prov_record_auth(p_id uuid, p_token uuid, p_profile uuid)
returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare r account_provisioning_requests;
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  r := app.prov_check_claim(p_id, p_token);
  if r.status <> 'AUTH_PENDING' then raise exception 'request is not waiting for the Auth step' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users where id = p_profile) then
    raise exception 'Auth account not found' using errcode = 'P0002';
  end if;
  insert into profiles (id, full_name, phone)
    values (p_profile, r.full_name, r.phone) on conflict (id) do nothing;
  update account_provisioning_requests
     set profile_id = p_profile, status = 'AUTH_CREATED', updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, 'AUTH_PENDING', 'AUTH_CREATED', r.attempt_count, 'auth_created', 'Auth account recorded', null);
  return jsonb_build_object('ok', true);
end $$;

-- Membership, permissions and the subscription user limit. One transaction. A refused membership is recorded
-- as a failure and leaves the request retryable without repeating the Auth step.
create or replace function app.prov_link_membership(p_id uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r account_provisioning_requests;
  v_existing store_owners%rowtype;
  v_code text;
  v_msg text;
  v_quota boolean;
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  r := app.prov_check_claim(p_id, p_token);
  if r.profile_id is null then raise exception 'no Auth account recorded' using errcode = 'P0001'; end if;

  select * into v_existing from store_owners where store_id = r.store_id and profile_id = r.profile_id;
  if found then
    if v_existing.role <> r.role or not v_existing.is_active then
      update account_provisioning_requests
         set status = 'RECONCILIATION_REQUIRED', reconciliation_reason = 'membership_conflict', claim_token = null,
             claimed_until = null, updated_at = now()
       where id = p_id;
      perform app.prov_event(p_id, r.status, 'RECONCILIATION_REQUIRED', r.attempt_count, 'membership_conflict',
        'The account already has a different membership in this store', null);
      return jsonb_build_object('ok', false, 'code', 'membership_conflict');
    end if;
    -- Already linked by an earlier attempt. Permissions are left as they are.
  else
    begin
      insert into profiles (id, full_name, phone) values (r.profile_id, r.full_name, r.phone) on conflict (id) do nothing;
      insert into store_owners (store_id, profile_id, role, is_active) values (r.store_id, r.profile_id, r.role, true);
      if r.role <> 'owner' then
        delete from store_member_permissions where store_id = r.store_id and profile_id = r.profile_id;
        insert into store_member_permissions (store_id, profile_id, permission_key, granted_by)
          select r.store_id, r.profile_id, k, coalesce(r.actor_id, r.profile_id)
            from unnest(r.permissions) k;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_quota := v_msg ilike '%user limit%';
      v_code := case when v_quota then 'user_limit' else 'membership_rejected' end;
      update account_provisioning_requests
         set status = 'FAILED', failure_code = v_code, failure_message = left(v_msg, 300), claim_token = null,
             claimed_until = null, updated_at = now()
       where id = p_id;
      perform app.prov_event(p_id, r.status, 'FAILED', r.attempt_count, v_code, v_msg, null);
      return jsonb_build_object('ok', false, 'code', v_code, 'message', v_msg);
    end;
  end if;

  update account_provisioning_requests set status = 'MEMBERSHIP_LINKED', updated_at = now() where id = p_id;
  perform app.prov_event(p_id, r.status, 'MEMBERSHIP_LINKED', r.attempt_count, 'membership_linked', 'Membership linked', null);
  return jsonb_build_object('ok', true);
end $$;

-- Onboarding link. Only an onboarding without an owner, or one already linked to this account, can take it.
create or replace function app.prov_link_onboarding(p_id uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r account_provisioning_requests;
  n integer;
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  r := app.prov_check_claim(p_id, p_token);
  if r.onboarding_id is not null then
    update store_onboardings set owner_profile_id = r.profile_id, updated_at = now()
     where id = r.onboarding_id and store_id = r.store_id and (owner_profile_id is null or owner_profile_id = r.profile_id);
    get diagnostics n = row_count;
    if n = 0 then
      update account_provisioning_requests
         set status = 'FAILED', failure_code = 'onboarding_conflict',
             failure_message = 'The onboarding is already linked to another owner', claim_token = null, claimed_until = null, updated_at = now()
       where id = p_id;
      perform app.prov_event(p_id, r.status, 'FAILED', r.attempt_count, 'onboarding_conflict', 'Onboarding already linked', null);
      return jsonb_build_object('ok', false, 'code', 'onboarding_conflict');
    end if;
  end if;
  update account_provisioning_requests set status = 'ONBOARDING_LINKED', updated_at = now() where id = p_id;
  perform app.prov_event(p_id, r.status, 'ONBOARDING_LINKED', r.attempt_count, 'onboarding_linked', 'Onboarding linked', null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function app.prov_complete(p_id uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r account_provisioning_requests;
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  r := app.prov_check_claim(p_id, p_token);
  update account_provisioning_requests
     set status = 'COMPLETED', completed_at = now(), claim_token = null, claimed_until = null, updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, r.status, 'COMPLETED', r.attempt_count, 'completed', 'Request completed', null);
  return jsonb_build_object('ok', true);
end $$;

-- Record a failure the current claim has seen. The message is limited and must not contain credentials.
create or replace function app.prov_fail(p_id uuid, p_token uuid, p_code text, p_message text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r account_provisioning_requests;
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  r := app.prov_check_claim(p_id, p_token);
  update account_provisioning_requests
     set status = 'FAILED', failure_code = left(p_code, 60), failure_message = left(p_message, 300),
         claim_token = null, claimed_until = null, updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, r.status, 'FAILED', r.attempt_count, p_code, p_message, null);
  return jsonb_build_object('ok', true);
end $$;

-- The Auth outcome is unknown. Stop and route to an administrator; never repeat the external call.
create or replace function app.prov_flag_reconciliation(p_id uuid, p_token uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r account_provisioning_requests;
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  if p_reason not in ('existing_account', 'auth_outcome_uncertain') then raise exception 'invalid reason' using errcode = '22023'; end if;
  r := app.prov_check_claim(p_id, p_token);
  update account_provisioning_requests
     set status = 'RECONCILIATION_REQUIRED', reconciliation_reason = p_reason, claim_token = null,
         claimed_until = null, updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, r.status, 'RECONCILIATION_REQUIRED', r.attempt_count, p_reason, 'Routed to administrator review', null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Administrative reconciliation. Platform administrators only, each action named and recorded.
-- Linking an existing account requires that the account's email equals the request email. The administrator
-- supplies a note stating how the identity was checked; that note is stored.
-- ---------------------------------------------------------------------------
create or replace function app.prov_assert_admin(p_actor uuid)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_server() then raise exception 'forbidden: provisioning runs on the server' using errcode = '42501'; end if;
  if not exists (select 1 from platform_admins where profile_id = p_actor) then
    raise exception 'forbidden: not a platform administrator' using errcode = '42501';
  end if;
end $$;

create or replace function app.prov_reconcile_link_existing(p_id uuid, p_actor uuid, p_profile uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare r account_provisioning_requests;
begin
  perform app.prov_assert_admin(p_actor);
  select * into r from account_provisioning_requests where id = p_id for update;
  if not found then raise exception 'provisioning request not found' using errcode = 'P0002'; end if;
  if r.status <> 'RECONCILIATION_REQUIRED' or r.reconciliation_reason is distinct from 'existing_account' then
    raise exception 'request does not need this reconciliation' using errcode = 'P0001';
  end if;
  if r.claim_token is not null and r.claimed_until > now() then
    raise exception 'request is being processed' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note describing how the identity was checked is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_profile and lower(u.email) = r.email) then
    raise exception 'the account email does not match the request' using errcode = 'P0001';
  end if;
  update account_provisioning_requests
     set profile_id = p_profile, status = 'AUTH_CREATED', reconciliation_reason = null,
         reconciliation_note = left(btrim(p_note), 300), failure_code = null, failure_message = null, updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, 'RECONCILIATION_REQUIRED', 'AUTH_CREATED', r.attempt_count, 'reconciled_link',
    left(btrim(p_note), 300), p_actor);
  return jsonb_build_object('ok', true, 'profile_id', p_profile);
end $$;

create or replace function app.prov_reconcile_reset(p_id uuid, p_actor uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r account_provisioning_requests;
begin
  perform app.prov_assert_admin(p_actor);
  select * into r from account_provisioning_requests where id = p_id for update;
  if not found then raise exception 'provisioning request not found' using errcode = 'P0002'; end if;
  if r.status <> 'RECONCILIATION_REQUIRED' or r.reconciliation_reason is distinct from 'auth_outcome_uncertain' or r.profile_id is not null then
    raise exception 'request does not need this reconciliation' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'a note is required' using errcode = '22023';
  end if;
  update account_provisioning_requests
     set status = 'FAILED', failure_code = 'reset_by_administrator', failure_message = left(btrim(p_note), 300),
         reconciliation_note = left(btrim(p_note), 300), reconciliation_reason = null, updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, 'RECONCILIATION_REQUIRED', 'FAILED', r.attempt_count, 'reset_by_administrator',
    left(btrim(p_note), 300), p_actor);
  return jsonb_build_object('ok', true);
end $$;

create or replace function app.prov_reconcile_cancel(p_id uuid, p_actor uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r account_provisioning_requests;
begin
  perform app.prov_assert_admin(p_actor);
  select * into r from account_provisioning_requests where id = p_id for update;
  if not found then raise exception 'provisioning request not found' using errcode = 'P0002'; end if;
  if r.status in ('COMPLETED', 'FAILED') then raise exception 'request is already closed' using errcode = 'P0001'; end if;
  if r.claim_token is not null and r.claimed_until > now() then raise exception 'request is being processed' using errcode = '55000'; end if;
  update account_provisioning_requests
     set status = 'FAILED', failure_code = 'cancelled_by_administrator', failure_message = left(btrim(coalesce(p_note, 'Cancelled')), 300),
         claim_token = null, claimed_until = null, updated_at = now()
   where id = p_id;
  -- An Auth account is never deleted here. Its references are reported to the administrator instead.
  perform app.prov_event(p_id, r.status, 'FAILED', r.attempt_count, 'cancelled_by_administrator',
    left(btrim(coalesce(p_note, 'Cancelled')), 300), p_actor);
  return jsonb_build_object('ok', true);
end $$;

-- Privileges: server only.
revoke all on function app.prov_event(uuid, text, text, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function app.prov_assert_actor(uuid, uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function app.prov_create(uuid, uuid, text, uuid, text, text, text, text, text[], uuid) from public, anon, authenticated;
revoke all on function app.prov_claim(uuid, integer) from public, anon, authenticated;
revoke all on function app.prov_check_claim(uuid, uuid) from public, anon, authenticated;
revoke all on function app.prov_record_auth(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app.prov_link_membership(uuid, uuid) from public, anon, authenticated;
revoke all on function app.prov_link_onboarding(uuid, uuid) from public, anon, authenticated;
revoke all on function app.prov_complete(uuid, uuid) from public, anon, authenticated;
revoke all on function app.prov_fail(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function app.prov_flag_reconciliation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app.prov_assert_admin(uuid) from public, anon, authenticated;
revoke all on function app.prov_reconcile_link_existing(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function app.prov_reconcile_reset(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app.prov_reconcile_cancel(uuid, uuid, text) from public, anon, authenticated;
