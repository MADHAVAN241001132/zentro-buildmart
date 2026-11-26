-- Provisioning hardening (rolled back). H1-H5 cover migration 0047.
\set ON_ERROR_STOP on
begin;
do $$
declare
  tag text := substr(gen_random_uuid()::text, 1, 6);
  today date := app.ist_today();
  plan_h uuid; store_h uuid; owner_h uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); admin_id uuid := gen_random_uuid();
  unverified uuid := gen_random_uuid(); member_elsewhere uuid := gen_random_uuid(); other_store uuid;
  key1 uuid := gen_random_uuid(); key2 uuid := gen_random_uuid(); r1 uuid; r2 uuid; r3 uuid; v_hint text; v_state text; ok boolean;
  email_unv text := 'ph-unv-' || tag || '@example.test';
  email_mem text := 'ph-mem-' || tag || '@example.test';
  email_new text := 'ph-new-' || tag || '@example.test';
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (admin_id, 'ph-admin-' || tag || '@example.test', now()),
    (owner_h, 'ph-own-' || tag || '@example.test', now()),
    (mgr, 'ph-mgr-' || tag || '@example.test', now()),
    (unverified, email_unv, null),
    (member_elsewhere, email_mem, now());
  insert into profiles (id, full_name) values (admin_id, 'Admin'), (owner_h, 'Owner'), (mgr, 'Manager'),
    (unverified, 'Unverified'), (member_elsewhere, 'Member elsewhere') on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (admin_id) on conflict do nothing;
  insert into stores (slug, name, status) values ('ph-h-' || tag, 'Hardening H', 'active') returning id into store_h;
  insert into stores (slug, name, status) values ('ph-o-' || tag, 'Other store', 'active') returning id into other_store;
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_h, today + 5, 'hardening test');
  insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
    values ('PH_PLAN_' || tag, 'Hardening plan', 'monthly', 1000, 10, 10, '{}') returning id into plan_h;
  insert into subscriptions (store_id, plan_id, status, period_start, period_end) values (store_h, plan_h, 'active', today - 1, today + 30);
  insert into subscriptions (store_id, plan_id, status, period_start, period_end) values (other_store, plan_h, 'active', today - 1, today + 30);
  insert into store_owners (store_id, profile_id, role) values (store_h, owner_h, 'owner'), (store_h, mgr, 'manager');
  insert into store_member_permissions (store_id, profile_id, permission_key, granted_by) values
    (store_h, mgr, 'staff_management', owner_h), (store_h, mgr, 'pos_billing', owner_h)
    on conflict (store_id, profile_id, permission_key) do nothing;
  insert into store_owners (store_id, profile_id, role) values (other_store, member_elsewhere, 'owner');

  -- H1: a reused key with the same details replays; with different details it is refused.
  r1 := (app.prov_create(store_h, mgr, 'shop_owner', key1, email_new, 'New Person', null, 'staff', array['pos_billing'], null)).id;
  r2 := (app.prov_create(store_h, mgr, 'shop_owner', key1, email_new, 'New Person', null, 'staff', array['pos_billing'], null)).id;
  if r1 is distinct from r2 then raise exception 'H1 failed: replay with the same key returned a different request'; end if;
  v_hint := null;
  begin
    perform app.prov_create(store_h, mgr, 'shop_owner', key1, 'other-' || email_new, 'New Person', null, 'staff', array['pos_billing'], null);
  exception when sqlstate '22023' then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'key_reused' then raise exception 'H1 failed: a reused key with other details was accepted'; end if;
  raise notice 'H1 ok: a reused request key replays the same details and refuses different ones';

  -- H2: a stored actor who lost staff_management cannot resume the request.
  delete from store_member_permissions where store_id = store_h and profile_id = mgr and permission_key = 'staff_management';
  ok := false;
  begin
    perform app.prov_claim(r1, 120);
  exception when sqlstate '42501' then ok := true;
  end;
  if not ok then raise exception 'H2 failed: a revoked actor could resume a privileged request'; end if;
  insert into store_member_permissions (store_id, profile_id, permission_key, granted_by)
    values (store_h, mgr, 'staff_management', owner_h) on conflict do nothing;
  if not (app.prov_claim(r1, 120)->>'outcome' = 'claimed') then raise exception 'H2 failed: restored actor could not resume'; end if;
  raise notice 'H2 ok: resume re-checks the stored actor and refuses after authority is revoked';

  -- H3: an existing account with an unverified email is not linked.
  r3 := (app.prov_create(store_h, admin_id, 'super_admin', key2, email_unv, 'Unverified', null, 'owner', '{}', null)).id;
  if (select status from account_provisioning_requests where id = r3) <> 'RECONCILIATION_REQUIRED' then
    raise exception 'H3 failed: an existing account was not routed to review';
  end if;
  v_hint := null;
  begin
    perform app.prov_reconcile_link_existing(r3, admin_id, unverified, 'Confirmed by phone with the account holder.', email_unv);
  exception when sqlstate 'P0001' then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'unverified_account' then raise exception 'H3 failed: an unverified account was linked'; end if;
  raise notice 'H3 ok: an unverified existing account cannot be linked';

  -- H4: the administrator must retype the request email.
  update auth.users set email_confirmed_at = now() where id = unverified;
  v_hint := null;
  begin
    perform app.prov_reconcile_link_existing(r3, admin_id, unverified, 'Confirmed by phone with the account holder.', 'wrong@example.test');
  exception when sqlstate 'P0001' then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'confirm_mismatch' then raise exception 'H4 failed: a link without the retyped email was accepted'; end if;
  raise notice 'H4 ok: linking needs the request email retyped';

  -- H5: an account that is an active member of another store is not linked silently.
  update account_provisioning_requests set profile_id = null where id = r3;
  update auth.users set email = email_mem where id = member_elsewhere;
  update account_provisioning_requests set email = email_mem where id = r3;
  update auth.users set email_confirmed_at = now() where id = member_elsewhere;
  v_hint := null;
  begin
    perform app.prov_reconcile_link_existing(r3, admin_id, member_elsewhere, 'Confirmed by phone with the account holder.', email_mem);
  exception when sqlstate 'P0001' then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'existing_membership' then raise exception 'H5 failed: an account with an active membership was linked'; end if;
  raise notice 'H5 ok: an account with an active membership elsewhere is not linked';
end $$;
rollback;
