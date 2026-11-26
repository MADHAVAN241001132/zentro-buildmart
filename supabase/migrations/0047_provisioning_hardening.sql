-- 0047: provisioning hardening.
-- 1) A reused request key must carry the same details; otherwise it is refused (hint key_reused).
-- 2) Every claim that can lead to a privileged step re-checks the stored actor's current authority first.
-- 3) Linking an existing Auth account needs a verified email, the request email retyped by the administrator,
--    no active store membership anywhere, and a note. An email match alone is not enough.

create or replace function app.prov_create(
  p_store uuid, p_actor uuid, p_actor_type text, p_key uuid, p_email text, p_full_name text, p_phone text,
  p_role text, p_permissions text[], p_onboarding uuid)
returns account_provisioning_requests
language plpgsql security definer set search_path = public, auth, app, pg_temp as $$
declare
  r account_provisioning_requests;
  v_email text := lower(btrim(p_email));
  v_name text := btrim(p_full_name);
  v_perms text[] := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p_permissions, '{}')) x);
  v_existing uuid;
begin
  if not app.is_server() then
    raise exception 'forbidden: provisioning runs on the server' using errcode = '42501';
  end if;
  select * into r from account_provisioning_requests where actor_id = p_actor and request_key = p_key;
  if found then
    if r.store_id <> p_store or r.email <> v_email or r.role <> p_role or r.permissions <> v_perms
       or r.full_name <> v_name or r.onboarding_id is distinct from p_onboarding then
      raise exception 'this request key was already used for different details' using errcode = '22023', hint = 'key_reused';
    end if;
    return r;
  end if;

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
      p_actor, p_actor_type, p_key, p_store, v_email, v_name, nullif(btrim(coalesce(p_phone, '')), ''),
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

  -- The stored actor must still hold the authority that created this request. Revocation stops the resume.
  perform app.prov_assert_actor(r.store_id, r.actor_id, r.actor_type, r.role, r.permissions);

  if r.status = 'AUTH_PENDING' and r.profile_id is null then
    update account_provisioning_requests
       set status = 'RECONCILIATION_REQUIRED', reconciliation_reason = 'auth_outcome_uncertain',
           claim_token = null, claimed_until = null, updated_at = now()
     where id = p_id;
    perform app.prov_event(p_id, r.status, 'RECONCILIATION_REQUIRED', r.attempt_count, 'auth_outcome_uncertain',
      'An Auth request was interrupted without a recorded result; it is not repeated automatically', null);
    return jsonb_build_object('outcome', 'reconciliation', 'reason', 'auth_outcome_uncertain');
  end if;

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

drop function if exists public.zb_prov_reconcile_link_existing(uuid, uuid, uuid, text);
drop function if exists app.prov_reconcile_link_existing(uuid, uuid, uuid, text);

create function app.prov_reconcile_link_existing(p_id uuid, p_actor uuid, p_profile uuid, p_note text, p_confirm_email text)
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
  if lower(btrim(coalesce(p_confirm_email, ''))) <> r.email then
    raise exception 'the retyped email does not match the request' using errcode = 'P0001', hint = 'confirm_mismatch';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_profile and lower(u.email) = r.email and u.email_confirmed_at is not null) then
    raise exception 'the account email is not verified or does not match the request' using errcode = 'P0001', hint = 'unverified_account';
  end if;
  if exists (select 1 from store_owners so where so.profile_id = p_profile and so.is_active) then
    raise exception 'the account already belongs to an active store; review it manually' using errcode = 'P0001', hint = 'existing_membership';
  end if;
  update account_provisioning_requests
     set profile_id = p_profile, status = 'AUTH_CREATED', reconciliation_reason = null,
         reconciliation_note = left(btrim(p_note), 300), failure_code = null, failure_message = null, updated_at = now()
   where id = p_id;
  perform app.prov_event(p_id, 'RECONCILIATION_REQUIRED', 'AUTH_CREATED', r.attempt_count, 'reconciled_link',
    left(btrim(p_note), 300), p_actor);
  return jsonb_build_object('ok', true, 'profile_id', p_profile);
end $$;

revoke all on function app.prov_reconcile_link_existing(uuid, uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.zb_prov_reconcile_link_existing(p_id uuid, p_actor uuid, p_profile uuid, p_note text, p_confirm_email text)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_reconcile_link_existing(p_id, p_actor, p_profile, p_note, p_confirm_email);
$$;
revoke all on function public.zb_prov_reconcile_link_existing(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.zb_prov_reconcile_link_existing(uuid, uuid, uuid, text, text) to service_role;
