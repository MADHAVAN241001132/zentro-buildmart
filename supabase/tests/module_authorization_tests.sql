-- Module authorisation through direct RPC calls, as the authenticated role (rolled back). M1-M9.
\set ON_ERROR_STOP on
begin;
-- Client calls run as the authenticated role with JWT claims. Without the role, app.is_server() treats a
-- superuser session as a trusted server path and the checks are not exercised.
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
  store_a uuid; store_b uuid; cust_store uuid;
  oa uuid := gen_random_uuid(); sa uuid := gen_random_uuid(); ma uuid := gen_random_uuid();
  ob uuid := gen_random_uuid(); ghost uuid := gen_random_uuid();
  msg text; n integer; ok boolean;
begin
  insert into auth.users (id, email) values
    (oa, 'ma-oa-' || tag || '@example.test'), (sa, 'ma-sa-' || tag || '@example.test'),
    (ma, 'ma-ma-' || tag || '@example.test'), (ob, 'ma-ob-' || tag || '@example.test'),
    (ghost, 'ma-gh-' || tag || '@example.test');
  insert into profiles (id, full_name) values (oa, 'Owner A'), (sa, 'Staff A'), (ma, 'Manager A'), (ob, 'Owner B'), (ghost, 'Former')
    on conflict (id) do nothing;
  insert into stores (slug, name, status) values ('ma-a-' || tag, 'Auth A', 'active') returning id into store_a;
  insert into stores (slug, name, status) values ('ma-b-' || tag, 'Auth B', 'active') returning id into store_b;
  insert into subscription_migration_allowances (store_id, expires_on, reason)
    values (store_a, today + 5, 'authorisation test'), (store_b, today + 5, 'authorisation test');
  insert into store_owners (store_id, profile_id, role) values
    (store_a, oa, 'owner'), (store_a, sa, 'staff'), (store_a, ma, 'manager'), (store_a, ghost, 'staff'), (store_b, ob, 'owner');
  -- Rows inserted directly receive the role defaults (migration 0040). Set the staff member to a known state.
  perform pg_temp.as_user(oa);
  perform zb_set_store_member_access(store_a, sa, 'staff', array['pos_billing']);
  perform zb_set_store_member_access(store_a, ma, 'manager', array['cash_confirmation', 'staff_management']);
  perform zb_set_store_member_access(store_a, ghost, 'staff', array['pos_billing']);

  -- M1: a staff member without cash confirmation cannot close the cash day directly.
  perform pg_temp.as_user(sa);
  begin
    perform close_cash_day(store_a, today, 0, 0, sa);
    raise exception 'M1 failed: staff closed the cash day';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'M1 ok: direct close_cash_day refused without cash confirmation';

  -- M2: a granted permission passes the gate. The call then fails on its own validation, not on authority.
  perform pg_temp.as_user(sa);
  msg := null;
  begin
    perform pos_save_bill(gen_random_uuid(), store_a, null, '[]'::jsonb, null);
  exception when others then msg := sqlstate;
  end;
  if msg = '42501' then raise exception 'M2 failed: staff with pos billing refused by the gate'; end if;
  raise notice 'M2 ok: a granted permission passes the gate (failed later with %)', msg;

  -- M3: an owner revokes pos billing; the same direct call is then refused.
  perform pg_temp.as_user(oa);
  perform zb_set_store_member_access(store_a, sa, 'staff', array[]::text[]);
  perform pg_temp.as_user(sa);
  begin
    perform pos_save_bill(gen_random_uuid(), store_a, null, '[]'::jsonb, null);
    raise exception 'M3 failed: revoked permission still honoured';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'M3 ok: a revoked permission is refused on the next direct call';

  -- M4: an inactive membership is refused even though its grants remain on file.
  perform pg_temp.as_user(oa);
  perform zb_set_store_member_access(store_a, ghost, 'staff', array['pos_billing']);
  perform zb_set_store_member_active(store_a, ghost, false);
  perform pg_temp.as_user(ghost);
  begin
    perform pos_save_bill(gen_random_uuid(), store_a, null, '[]'::jsonb, null);
    raise exception 'M4 failed: inactive membership honoured';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'M4 ok: an inactive membership is refused on direct calls';

  -- M5: cross-store. The owner of store B cannot act on store A.
  perform pg_temp.as_user(ob);
  begin
    perform pos_save_bill(gen_random_uuid(), store_a, null, '[]'::jsonb, null);
    raise exception 'M5 failed: owner of store B acted on store A';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'M5 ok: cross-store direct calls are refused';

  -- M6: a manager cannot close the cash day once the owner revokes its cash permission.
  perform pg_temp.as_user(oa);
  perform zb_set_store_member_access(store_a, ma, 'manager', array['staff_management']);
  perform pg_temp.as_user(ma);
  begin
    perform close_cash_day(store_a, today, 0, 0, ma);
    raise exception 'M6 failed: manager closed cash without the permission';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'M6 ok: a manager without cash confirmation is refused';

  -- M7: privilege escalation. A manager with staff management cannot grant a permission it does not hold.
  perform pg_temp.as_user(ma);
  begin
    perform zb_set_store_member_access(store_a, sa, 'staff', array['store_settings']);
    raise exception 'M7 failed: manager granted store settings';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'M7 ok: a manager cannot escalate privileges';

  -- M8: financial and refund operations that must not be reachable from the client are not executable by authenticated.
  for msg in select unnest(array[
      'create_refund(uuid, jsonb, text, text, uuid)', 'approve_refund_request(uuid, uuid, uuid, text)',
      'reject_refund_request(uuid, uuid, text)', 'settle_online_payment(text, text, text, bigint, boolean, text)',
      'settle_refund(text, boolean, text, bigint)', 'mark_refund_succeeded(uuid, text)', 'begin_gateway_refund(uuid)',
      'create_payment_attempt(uuid, text, text, text, bigint, timestamp with time zone, text)', 'quotation_convert(uuid, uuid, uuid, text, text, text, text, timestamp with time zone)'
    ]) loop
    if has_function_privilege('authenticated', 'public.' || msg, 'EXECUTE') then
      raise exception 'M8 failed: % is executable by the authenticated role', msg;
    end if;
  end loop;
  raise notice 'M8 ok: server-only financial functions are not executable by client sessions';

  -- M9: a revocation of the membership row removes all access, including owner-only paths.
  perform pg_temp.as_user(sa);
  select coalesce(cardinality(zb_my_store_permissions(store_a)), 0) into n;
  if n <> 0 then raise exception 'M9 failed: a member with no grants reports % permissions', n; end if;
  raise notice 'M9 ok: a member without grants reports no permissions';
end $$;
rollback;
