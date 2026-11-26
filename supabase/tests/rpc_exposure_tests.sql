-- Subscription gate functions are not open to anonymous or unrelated callers (rolled back). X1-X4.
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
  store_a uuid; store_b uuid; oa uuid := gen_random_uuid(); ob uuid := gen_random_uuid(); msg text; v text;
begin
  insert into auth.users (id, email) values (oa, 'rx-oa-' || tag || '@example.test'), (ob, 'rx-ob-' || tag || '@example.test');
  insert into profiles (id, full_name) values (oa, 'Owner A'), (ob, 'Owner B') on conflict (id) do nothing;
  insert into stores (slug, name, status) values ('rx-a-' || tag, 'Expose A', 'active') returning id into store_a;
  insert into stores (slug, name, status) values ('rx-b-' || tag, 'Expose B', 'active') returning id into store_b;
  insert into subscription_migration_allowances (store_id, expires_on, reason)
    values (store_a, today + 5, 'exposure test'), (store_b, today + 5, 'exposure test');
  insert into store_owners (store_id, profile_id, role) values (store_a, oa, 'owner'), (store_b, ob, 'owner');

  -- X1: an owner of store A reads its own subscription state.
  perform pg_temp.as_user(oa);
  v := zb_subscription_state(store_a);
  if v is null then raise exception 'X1 failed: own store state unreadable'; end if;
  raise notice 'X1 ok: a member reads the state of its own store (%)', v;

  -- X2: an owner of store A cannot read store B's state.
  msg := null;
  begin
    v := zb_subscription_state(store_b);
  exception when sqlstate '42501' then msg := sqlstate;
  end;
  if msg is distinct from '42501' then raise exception 'X2 failed: another store state was readable'; end if;
  raise notice 'X2 ok: another store subscription state is refused';

  -- X3: the same member cannot read another store's feature or commerce gate.
  msg := null;
  begin
    perform zb_feature_allowed(store_b, 'pos_billing');
  exception when sqlstate '42501' then msg := sqlstate;
  end;
  if msg is distinct from '42501' then raise exception 'X3 failed: feature gate readable for another store'; end if;
  msg := null;
  begin
    perform zb_commerce_allowed(store_b);
  exception when sqlstate '42501' then msg := sqlstate;
  end;
  if msg is distinct from '42501' then raise exception 'X3 failed: commerce gate readable for another store'; end if;
  raise notice 'X3 ok: feature and commerce gates are refused for another store';

  -- X4: anonymous callers hold no execute privilege on these functions.
  if has_function_privilege('anon', 'public.zb_subscription_state(uuid)', 'execute')
     or has_function_privilege('anon', 'public.zb_feature_allowed(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.zb_commerce_allowed(uuid)', 'execute') then
    raise exception 'X4 failed: anon can execute a subscription gate';
  end if;
  raise notice 'X4 ok: anonymous callers cannot execute the subscription gates';
end $$;
rollback;
