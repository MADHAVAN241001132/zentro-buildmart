-- Durable account provisioning (rolled back). PV1-PV15. Auth is simulated: the Auth step records a profile id.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(p_user uuid) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user::text)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;
do $$
declare
  tag text := substr(gen_random_uuid()::text, 1, 6);
  today date := app.ist_today();
  plan_one uuid; store_a uuid; store_q uuid; onb uuid; onb2 uuid;
  admin_id uuid := gen_random_uuid(); owner_a uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); stf uuid := gen_random_uuid();
  new_mgr uuid := gen_random_uuid(); new_user uuid := gen_random_uuid(); other_auth uuid := gen_random_uuid(); owner_q uuid := gen_random_uuid();
  req record; req2 record; c jsonb; c2 jsonb; tok uuid; n integer; msg text; st text; v_code text; code_ok boolean;
  pwd_probe text := 'PROBE-' || tag;
begin
  -- Fixtures (superuser session).
  insert into auth.users (id, email) values
    (admin_id, 'pv-admin-' || tag || '@example.test'), (owner_a, 'pv-oa-' || tag || '@example.test'),
    (mgr, 'pv-mg-' || tag || '@example.test'), (stf, 'pv-st-' || tag || '@example.test'),
    (owner_q, 'pv-oq-' || tag || '@example.test'), (other_auth, 'pv-existing-' || tag || '@example.test');
  insert into profiles (id, full_name) values (admin_id, 'Admin'), (owner_a, 'Owner A'), (mgr, 'Manager'), (stf, 'Staff'), (owner_q, 'Quota owner')
    on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (admin_id) on conflict do nothing;
  insert into stores (slug, name, status) values ('pv-a-' || tag, 'Prov A', 'active') returning id into store_a;
  insert into stores (slug, name, status) values ('pv-q-' || tag, 'Prov Q', 'active') returning id into store_q;
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_a, today + 5, 'provisioning test');
  insert into store_owners (store_id, profile_id, role) values (store_a, owner_a, 'owner'), (store_a, mgr, 'manager'), (store_a, stf, 'staff');
  insert into store_member_permissions (store_id, profile_id, permission_key, granted_by) values
    (store_a, mgr, 'staff_management', owner_a), (store_a, mgr, 'pos_billing', owner_a)
    on conflict (store_id, profile_id, permission_key) do nothing;
  -- Quota store: a plan with one user, already used by its owner.
  insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
    values ('PV_ONE_' || tag, 'One user', 'monthly', 1000, 10, 1, '{}') returning id into plan_one;
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
    values (store_q, plan_one, 'active', today - 1, today + 30);
  insert into store_owners (store_id, profile_id, role) values (store_q, owner_q, 'owner');
  insert into store_onboardings (store_id, current_step, step_data, status, created_by)
    values (store_a, 3, '{}', 'in_progress', admin_id) returning id into onb;

  -- PV1: create is idempotent per actor and key.
  req := app.prov_create(store_a, admin_id, 'super_admin', 'a0000000-0000-0000-0000-00000000f001', 'pv-new-' || tag || '@example.test', 'New Owner', null, 'owner', '{}', null);
  req2 := app.prov_create(store_a, admin_id, 'super_admin', 'a0000000-0000-0000-0000-00000000f001', 'pv-new-' || tag || '@example.test', 'New Owner', null, 'owner', '{}', null);
  select count(*) into n from account_provisioning_requests where actor_id = admin_id and request_key = 'a0000000-0000-0000-0000-00000000f001';
  if req.id <> req2.id or n <> 1 then raise exception 'PV1 failed: replay created a second request'; end if;
  raise notice 'PV1 ok: a repeated create with the same key returns the same request';

  -- PV2: a second open request for the same email is refused.
  msg := null;
  begin
    perform app.prov_create(store_a, admin_id, 'super_admin', gen_random_uuid(), 'pv-new-' || tag || '@example.test', 'Again', null, 'owner', '{}', null);
  exception when sqlstate 'P0001' then msg := sqlerrm;
  end;
  if msg is null or msg not like '%already open%' then raise exception 'PV2 failed: duplicate open request accepted (%)', msg; end if;
  raise notice 'PV2 ok: a second open request for the same email is refused';

  -- PV3: an email that already has an Auth account is routed to administrator review, not linked.
  req := app.prov_create(store_a, admin_id, 'super_admin', gen_random_uuid(), 'pv-existing-' || tag || '@example.test', 'Existing', null, 'owner', '{}', null);
  if req.status <> 'RECONCILIATION_REQUIRED' or req.reconciliation_reason <> 'existing_account' or req.profile_id is not null then
    raise exception 'PV3 failed: existing account not isolated (status %, profile %)', req.status, req.profile_id;
  end if;
  raise notice 'PV3 ok: an existing Auth account is not linked automatically';

  -- PV4: a manager with staff management creates staff; without it, refused; staff cannot create anyone.
  msg := null;
  begin
    perform app.prov_create(store_a, stf, 'shop_owner', gen_random_uuid(), 'pv-x-' || tag || '@example.test', 'X', null, 'staff', '{}', null);
  exception when sqlstate '42501' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV4 failed: staff member created an account'; end if;
  req := app.prov_create(store_a, mgr, 'shop_owner', gen_random_uuid(), 'pv-st2-' || tag || '@example.test', 'Staff Two', null, 'staff', array['pos_billing'], null);
  if req.status <> 'REQUESTED' then raise exception 'PV4 failed: manager with staff management refused'; end if;
  raise notice 'PV4 ok: staff cannot provision; a manager with staff management can';

  -- PV5: a manager cannot create a manager, or grant a permission it does not hold.
  msg := null;
  begin
    perform app.prov_create(store_a, mgr, 'shop_owner', gen_random_uuid(), 'pv-m2-' || tag || '@example.test', 'M2', null, 'manager', '{}', null);
  exception when sqlstate '42501' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV5 failed: manager created a manager'; end if;
  msg := null;
  begin
    perform app.prov_create(store_a, mgr, 'shop_owner', gen_random_uuid(), 'pv-m3-' || tag || '@example.test', 'M3', null, 'staff', array['store_settings'], null);
  exception when sqlstate '42501' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV5 failed: manager granted a permission it does not hold'; end if;
  raise notice 'PV5 ok: a manager cannot create managers or grant permissions it lacks';

  -- PV6: one claim at a time. A second claim while the lease is live is busy.
  c := app.prov_claim(req.id);
  c2 := app.prov_claim(req.id);
  if c->>'outcome' <> 'claimed' or c->>'step' <> 'auth' or c2->>'outcome' <> 'busy' then
    raise exception 'PV6 failed: concurrent claim not serialised (% / %)', c, c2;
  end if;
  tok := (c->>'token')::uuid;
  raise notice 'PV6 ok: a live claim makes a second claim busy';

  -- PV7: a stale token cannot record a result.
  msg := null;
  begin
    perform app.prov_record_auth(req.id, gen_random_uuid(), gen_random_uuid());
  exception when sqlstate '55000' then msg := 'stale';
  end;
  if msg is null then raise exception 'PV7 failed: stale claim accepted'; end if;
  raise notice 'PV7 ok: a stale claim cannot record a result';

  -- PV8: happy path. Auth recorded, membership linked with permissions, complete. Replay is a no-op.
  -- The Auth account is created here, in the test, and is not deleted by any function.
  insert into auth.users (id, email) values (new_user, (select email from account_provisioning_requests where id = req.id));
  perform app.prov_record_auth(req.id, tok, new_user);
  perform app.prov_link_membership(req.id, tok);
  if not exists (select 1 from store_owners where store_id = store_a and profile_id = new_user and role = 'staff' and is_active) then
    raise exception 'PV8 failed: membership not created';
  end if;
  perform app.prov_complete(req.id, tok);
  c := app.prov_claim(req.id);
  select count(*) into n from store_owners where store_id = store_a and profile_id = new_user;
  if c->>'outcome' <> 'completed' or n <> 1 then raise exception 'PV8 failed: completed request replayed (%, rows %)', c, n; end if;
  raise notice 'PV8 ok: the happy path completes and a completed request is replayed without new rows';

  -- PV9: the subscription user limit refuses the membership. The Auth account is kept and the request is retryable.
  req := app.prov_create(store_q, admin_id, 'super_admin', gen_random_uuid(), 'pv-quota-' || tag || '@example.test', 'Quota', null, 'staff', '{}', null);
  insert into auth.users (id, email) values (gen_random_uuid(), 'pv-quota-' || tag || '@example.test') returning id into new_user;
  c := app.prov_claim(req.id);
  perform app.prov_record_auth(req.id, (c->>'token')::uuid, new_user);
  c2 := app.prov_link_membership(req.id, (c->>'token')::uuid);
  select * into req2 from account_provisioning_requests where id = req.id;
  if c2->>'code' <> 'user_limit' or req2.status <> 'FAILED' or req2.profile_id <> new_user then
    raise exception 'PV9 failed: quota not enforced or Auth record lost (%, %)', c2, req2.status;
  end if;
  c := app.prov_claim(req.id);
  if c->>'step' <> 'membership' or c->>'profile_id' is distinct from new_user::text then
    raise exception 'PV9 failed: retry did not resume at membership (%)', c;
  end if;
  perform app.prov_fail(req.id, (c->>'token')::uuid, 'user_limit', 'The user limit for the current plan has been reached');
  raise notice 'PV9 ok: the user limit refuses membership, keeps the Auth record, and retry resumes at membership';

  -- PV10: an interrupted Auth step is not repeated. The next claim routes it to administrator review.
  req := app.prov_create(store_a, admin_id, 'super_admin', gen_random_uuid(), 'pv-interrupt-' || tag || '@example.test', 'Interrupted', null, 'staff', '{}', null);
  c := app.prov_claim(req.id);
  update account_provisioning_requests set claimed_until = now() - interval '1 second' where id = req.id;
  c2 := app.prov_claim(req.id);
  select * into req2 from account_provisioning_requests where id = req.id;
  if c2->>'outcome' <> 'reconciliation' or c2->>'reason' <> 'auth_outcome_uncertain' or req2.status <> 'RECONCILIATION_REQUIRED' then
    raise exception 'PV10 failed: interrupted Auth step was repeated (%)', c2;
  end if;
  raise notice 'PV10 ok: an interrupted Auth step is not repeated automatically';

  -- PV11: onboarding links once. A second request for the same onboarding is refused after linking.
  req := app.prov_create(store_a, admin_id, 'super_admin', gen_random_uuid(), 'pv-onb-' || tag || '@example.test', 'Onboarded Owner', null, 'owner', '{}', onb);
  insert into auth.users (id, email) values (gen_random_uuid(), 'pv-onb-' || tag || '@example.test') returning id into new_user;
  c := app.prov_claim(req.id);
  perform app.prov_record_auth(req.id, (c->>'token')::uuid, new_user);
  perform app.prov_link_membership(req.id, (c->>'token')::uuid);
  c2 := app.prov_link_onboarding(req.id, (c->>'token')::uuid);
  perform app.prov_complete(req.id, (c->>'token')::uuid);
  if c2->>'ok' <> 'true' or not exists (select 1 from store_onboardings where id = onb and owner_profile_id = new_user) then
    raise exception 'PV11 failed: onboarding not linked';
  end if;
  msg := null;
  begin
    perform app.prov_create(store_a, admin_id, 'super_admin', gen_random_uuid(), 'pv-onb2-' || tag || '@example.test', 'Second', null, 'owner', '{}', onb);
  exception when sqlstate 'P0001' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV11 failed: a second request took a linked onboarding'; end if;
  raise notice 'PV11 ok: onboarding links once and cannot take a second owner';

  -- PV12: no password column exists and no event carries the probe value.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name like 'account_provisioning%' and column_name ilike '%pass%';
  if n <> 0 then raise exception 'PV12 failed: a provisioning table has a password column'; end if;
  select count(*) into n from account_provisioning_events where message ilike '%' || pwd_probe || '%';
  if n <> 0 then raise exception 'PV12 failed: a password-like value reached the event history'; end if;
  raise notice 'PV12 ok: provisioning tables hold no password column or secret value';

  -- PV13: reconciliation is for platform administrators only, requires a matching email and a written note.
  select id into req.id from account_provisioning_requests where email = 'pv-existing-' || tag || '@example.test';
  update auth.users set email_confirmed_at = now() where id = other_auth;
  msg := null;
  begin
    perform app.prov_reconcile_link_existing(req.id, owner_a, other_auth, 'Checked by phone with the owner.', 'pv-existing-' || tag || '@example.test');
  exception when sqlstate '42501' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV13 failed: a store owner reconciled an account'; end if;
  msg := null;
  begin
    perform app.prov_reconcile_link_existing(req.id, admin_id, owner_a, 'Checked by phone with the owner.', 'pv-existing-' || tag || '@example.test');
  exception when sqlstate 'P0001' then msg := 'mismatch';
  end;
  if msg is null then raise exception 'PV13 failed: a mismatched email was linked'; end if;
  msg := null;
  begin
    perform app.prov_reconcile_link_existing(req.id, admin_id, other_auth, 'short', 'pv-existing-' || tag || '@example.test');
  exception when sqlstate '22023' then msg := 'note';
  end;
  if msg is null then raise exception 'PV13 failed: a link without a note was accepted'; end if;
  perform app.prov_reconcile_link_existing(req.id, admin_id, other_auth, 'Confirmed the mailbox owner by phone before linking.', 'pv-existing-' || tag || '@example.test');
  if not exists (select 1 from account_provisioning_requests where id = req.id and status = 'AUTH_CREATED' and profile_id = other_auth) then
    raise exception 'PV13 failed: verified reconciliation did not link';
  end if;
  raise notice 'PV13 ok: only a platform administrator links an existing account, with a matching email and a note';

  -- PV14: the authenticated role cannot read or call provisioning.
  perform pg_temp.as_user(owner_a);
  msg := null;
  begin
    perform count(*) from account_provisioning_requests;
  exception when sqlstate '42501' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV14 failed: owner can read provisioning records'; end if;
  msg := null;
  begin
    perform app.prov_claim(req.id);
  exception when sqlstate '42501' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV14 failed: owner can call provisioning functions'; end if;
  raise notice 'PV14 ok: the authenticated role cannot read or call provisioning';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- PV15: a membership that already exists with a different role is a conflict for review, not an overwrite.
  req := app.prov_create(store_a, admin_id, 'super_admin', gen_random_uuid(), 'pv-conflict-' || tag || '@example.test', 'Conflict', null, 'manager', '{}', null);
  insert into auth.users (id, email) values (gen_random_uuid(), 'pv-conflict-' || tag || '@example.test') returning id into new_user;
  insert into store_owners (store_id, profile_id, role) values (store_a, new_user, 'staff');
  c := app.prov_claim(req.id);
  perform app.prov_record_auth(req.id, (c->>'token')::uuid, new_user);
  c2 := app.prov_link_membership(req.id, (c->>'token')::uuid);
  if c2->>'code' <> 'membership_conflict' or not exists (select 1 from store_owners where store_id = store_a and profile_id = new_user and role = 'staff') then
    raise exception 'PV15 failed: membership conflict overwritten (%)', c2;
  end if;
  raise notice 'PV15 ok: an existing membership with another role is routed to review, not overwritten';
  -- PV16: the API wrappers are server-only. The authenticated role cannot call them.
  perform pg_temp.as_user(owner_a);
  msg := null;
  begin
    perform public.zb_prov_claim(req.id);
  exception when sqlstate '42501' then msg := 'refused';
  end;
  if msg is null then raise exception 'PV16 failed: authenticated role called an API provisioning wrapper'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'PV16 ok: API provisioning wrappers are not callable by signed-in users';
end $$;
rollback;
