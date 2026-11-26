-- Store roles and permissions (rolled back). P1-P11.
\set ON_ERROR_STOP on
begin;
do $$
declare
  tag text := substr(gen_random_uuid()::text, 1, 6);
  today date := app.ist_today();
  store_a uuid; store_b uuid; store_c uuid; plan_1 uuid;
  owner1 uuid := gen_random_uuid(); owner2 uuid := gen_random_uuid(); mgr uuid := gen_random_uuid();
  stf uuid := gen_random_uuid(); other_owner uuid := gen_random_uuid(); spare uuid := gen_random_uuid();
  n integer; ok boolean;
begin
  insert into auth.users (id, email) values
    (owner1, 'pm-o1-' || tag || '@example.test'), (owner2, 'pm-o2-' || tag || '@example.test'),
    (mgr, 'pm-mg-' || tag || '@example.test'), (stf, 'pm-st-' || tag || '@example.test'),
    (other_owner, 'pm-ob-' || tag || '@example.test'), (spare, 'pm-sp-' || tag || '@example.test');
  insert into profiles (id, full_name) values
    (owner1, 'Owner 1'), (owner2, 'Owner 2'), (mgr, 'Manager'), (stf, 'Staff'), (other_owner, 'Other owner'), (spare, 'Spare')
    on conflict (id) do nothing;

  insert into stores (slug, name, status) values ('pm-a-' || tag, 'Perm A', 'active') returning id into store_a;
  insert into stores (slug, name, status) values ('pm-b-' || tag, 'Perm B', 'active') returning id into store_b;
  insert into stores (slug, name, status) values ('pm-c-' || tag, 'Perm C', 'active') returning id into store_c;
  insert into subscription_migration_allowances (store_id, expires_on, reason)
    values (store_a, today + 5, 'permission test'), (store_b, today + 5, 'permission test');

  insert into store_owners (store_id, profile_id, role) values
    (store_a, owner1, 'owner'), (store_a, owner2, 'owner'), (store_a, mgr, 'manager'), (store_a, stf, 'staff'),
    (store_b, other_owner, 'owner');

  -- P1: an active owner holds every permission.
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  select count(*) into n from unnest(zb_my_store_permissions(store_a));
  if n <> (select count(*) from store_permission_keys) then raise exception 'P1 failed: owner holds % permissions', n; end if;
  raise notice 'P1 ok: an active owner holds all % permissions', n;

  -- P2: an owner grants a manager a limited set; the manager may then assign staff within that set,
  --     and may not grant a permission it does not hold.
  perform zb_set_store_member_access(store_a, mgr, 'manager', array['staff_management', 'pos_billing', 'refund_management']);
  -- The staff member starts with the staff defaults. The owner sets it to a known state first; the manager may
  -- then change only what it holds, which is pos_billing here.
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  perform zb_set_store_member_access(store_a, stf, 'staff', array['pos_billing']);
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform zb_set_store_member_access(store_a, stf, 'staff', array['pos_billing']);
  select count(*) into n from store_member_permissions where store_id = store_a and profile_id = stf;
  if n <> 1 then raise exception 'P2 failed: staff grants % rows', n; end if;
  begin
    perform zb_set_store_member_access(store_a, stf, 'staff', array['store_settings']);
    raise exception 'P2 failed: manager granted a permission it does not hold';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'P2 ok: a manager assigns only permissions it holds';

  -- P3: staff cannot change access.
  perform set_config('request.jwt.claim.sub', stf::text, true);
  begin
    perform zb_set_store_member_access(store_a, mgr, 'staff', '{}');
    raise exception 'P3 failed: staff changed a role';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'P3 ok: staff cannot change roles or permissions';

  -- P4: cross-store isolation. An owner of store A cannot change store B.
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  begin
    perform zb_set_store_member_access(store_b, other_owner, 'staff', '{}');
    raise exception 'P4 failed: owner of store A changed store B';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'P4 ok: no cross-store access changes';

  -- P5: inactive memberships. Owner 2 is deactivated by owner 1 and then cannot act.
  perform zb_set_store_member_active(store_a, owner2, false);
  perform set_config('request.jwt.claim.sub', owner2::text, true);
  begin
    perform zb_set_store_member_access(store_a, stf, 'staff', '{}');
    raise exception 'P5 failed: inactive owner changed access';
  exception when sqlstate '42501' then null;
  end;
  select app.has_store_permission(store_a, 'pos_billing') into ok;
  if ok then raise exception 'P5 failed: inactive owner still holds a permission'; end if;
  raise notice 'P5 ok: an inactive membership holds no permission and changes nothing';

  -- P6: last-owner protection. Owner 1 is now the only active owner; direct writes and self-demotion are refused.
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  begin
    perform zb_set_store_member_access(store_a, owner1, 'staff', '{}');
    raise exception 'P6 failed: owner changed their own access';
  exception when sqlstate '42501' then null;
  end;
  begin
    update store_owners set is_active = false where store_id = store_a and profile_id = owner1;
    raise exception 'P6 failed: the last active owner was deactivated by a direct write';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    update store_owners set role = 'staff' where store_id = store_a and profile_id = owner1;
    raise exception 'P6 failed: the last active owner was demoted by a direct write';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'P6 ok: the last active owner cannot be removed or demoted';

  -- P7: managers cannot touch owners or create owners.
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  begin
    perform zb_set_store_member_active(store_a, owner1, false);
    raise exception 'P7 failed: manager deactivated an owner';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform zb_set_store_member_access(store_a, stf, 'owner', '{}');
    raise exception 'P7 failed: manager promoted a member to owner';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'P7 ok: managers cannot change owners or promote to owner';

  -- P8: nobody changes their own access.
  begin
    perform zb_set_store_member_access(store_a, mgr, 'staff', '{}');
    raise exception 'P8 failed: manager changed their own role';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'P8 ok: a member cannot change their own access';

  -- P9: direct table writes are not granted to the application role.
  if has_table_privilege('authenticated', 'store_member_permissions', 'INSERT')
     or has_table_privilege('authenticated', 'store_member_permissions', 'UPDATE')
     or has_table_privilege('authenticated', 'store_member_permissions', 'DELETE') then
    raise exception 'P9 failed: authenticated can write store_member_permissions directly';
  end if;
  raise notice 'P9 ok: store_member_permissions is written only through the access RPCs';

  -- P10: unknown permission keys are refused.
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  begin
    perform zb_set_store_member_access(store_a, stf, 'staff', array['not_a_permission']);
    raise exception 'P10 failed: unknown permission accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'P10 ok: unknown permission keys are refused';

  -- P11: the user quota counts active members. With a one-user plan, a second active owner is refused.
  insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
    values ('PERM_SMALL_' || tag, 'Perm small', 'monthly', 1000, 10, 1, '{}') returning id into plan_1;
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
    values (store_c, plan_1, 'active', today - 1, today + 30);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into store_owners (store_id, profile_id, role) values (store_c, spare, 'owner');
  begin
    insert into store_owners (store_id, profile_id, role) values (store_c, gen_random_uuid(), 'owner');
    raise exception 'P11 failed: a second active member exceeded the one-user plan';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'P11 ok: the subscription user limit is enforced on membership creation';

  -- P12: access changes are audited.
  select count(*) into n from audit_logs where store_id = store_a and action in ('staff.access_changed', 'staff.deactivated');
  if n < 2 then raise exception 'P12 failed: only % audit rows for access changes', n; end if;
  raise notice 'P12 ok: access changes and deactivations are written to the audit log';
  -- P13: member listing is limited to members of the store.
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  select count(*) into n from zb_store_members(store_a);
  if n < 3 then raise exception 'P13 failed: owner sees % members', n; end if;
  begin
    perform zb_store_members(store_b);
    raise exception 'P13 failed: a non-member listed store B';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'P13 ok: member listing is refused outside the store';

  -- P14: a manager cannot remove a permission it does not hold.
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  perform zb_set_store_member_access(store_a, stf, 'staff', array['store_settings', 'pos_billing']);
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  begin
    perform zb_set_store_member_access(store_a, stf, 'staff', array['pos_billing']);
    raise exception 'P14 failed: manager removed a permission it does not hold';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claim.sub', owner1::text, true);
  perform zb_set_store_member_access(store_a, stf, 'staff', array['store_settings', 'pos_billing']);
  raise notice 'P14 ok: a manager cannot remove a permission outside its own authority';

end $$;
rollback;
