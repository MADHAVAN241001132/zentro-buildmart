-- Subscription enforcement tests (rolled back). SE1-SE8.
\set ON_ERROR_STOP on
begin;
do $$
declare
  today date := app.ist_today();
  tag text := substr(gen_random_uuid()::text, 1, 6);
  plan_small uuid; plan_unlimited uuid;
  store_a uuid; store_b uuid; store_legacy uuid; store_expired uuid; store_upcoming uuid;
  cat_a uuid; cat_b uuid; cat_e uuid; cat_u uuid;
  admin_profile uuid := gen_random_uuid();
  owner_1 uuid := gen_random_uuid();
  owner_2 uuid := gen_random_uuid();
  sub_a uuid; new_sub uuid; n int; state text; allowed boolean;
begin
  -- Plans: one small explicit plan (1 product, 1 user) and one explicitly unlimited plan.
  insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
  values ('T_SMALL_' || tag, 'Small', 'monthly', 1000, 1, 1, '{"room_visualiser":false}') returning id into plan_small;
  insert into subscription_plans (code, name, billing_interval, price_paise, products_unlimited, users_unlimited, features)
  values ('T_UNL_' || tag, 'Unlimited', 'annual', 1000, true, true, '{}') returning id into plan_unlimited;

  insert into stores (slug, name, status) values ('sub-a-' || tag, 'A', 'active') returning id into store_a;
  insert into stores (slug, name, status) values ('sub-b-' || tag, 'B', 'active') returning id into store_b;
  insert into stores (slug, name, status) values ('sub-l-' || tag, 'Legacy', 'active') returning id into store_legacy;
  insert into stores (slug, name, status) values ('sub-e-' || tag, 'Expired', 'active') returning id into store_expired;
  insert into stores (slug, name, status) values ('sub-u-' || tag, 'Upcoming', 'active') returning id into store_upcoming;

  insert into categories (store_id, slug, name) values (store_a, 'c-a', 'A') returning id into cat_a;
  insert into categories (store_id, slug, name) values (store_b, 'c-b', 'B') returning id into cat_b;
  insert into categories (store_id, slug, name) values (store_expired, 'c-e', 'E') returning id into cat_e;

  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  values (store_a, plan_small, 'active', today - 10, today + 20) returning id into sub_a;
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  values (store_b, plan_small, 'active', today - 10, today + 20);
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  values (store_expired, plan_unlimited, 'active', today - 60, today - 1);
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  values (store_upcoming, plan_unlimited, 'active', today + 5, today + 40);

  -- SE1: state classification
  state := app.store_subscription_state(store_a, today);
  if state <> 'active' then raise exception 'SE1 failed: covered store is %', state; end if;
  state := app.store_subscription_state(store_legacy, today);
  if state <> 'unsubscribed' then raise exception 'SE1 failed: active store without subscription is %', state; end if;
  state := app.store_subscription_state(store_expired, today);
  if state <> 'expired' then raise exception 'SE1 failed: lapsed store is %', state; end if;
  state := app.store_subscription_state(store_upcoming, today);
  if state <> 'upcoming' then raise exception 'SE1 failed: future store is %', state; end if;
  raise notice 'SE1 ok: active, unsubscribed, expired and upcoming states are classified';

  -- SE2: expired and upcoming stores cannot add products; legacy stores are unaffected
  begin
    insert into products (store_id, category_id, sku, slug, name) values (store_expired, cat_e, 'SKU-E1', 'e-one', 'E one');
    raise exception 'SE2 failed: expired store added a product';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    insert into products (store_id, category_id, sku, slug, name) values (store_upcoming, cat_e, 'SKU-U1', 'u-one', 'U one');
    raise exception 'SE2 failed: upcoming store added a product';
  exception when sqlstate 'P0001' then null;
  end;
  -- An active store without a subscription is refused until a platform administrator grants an allowance.
  insert into categories (store_id, slug, name) values (store_legacy, 'c-l', 'L') returning id into cat_u;
  begin
    insert into products (store_id, category_id, sku, slug, name) values (store_legacy, cat_u, 'SKU-L0', 'l-zero', 'L zero');
    raise exception 'SE2 failed: unsubscribed active store added a product';
  exception when sqlstate 'P0001' then null;
  end;
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_legacy, today + 10, 'test allowance for SE2');
  insert into products (store_id, category_id, sku, slug, name) values (store_legacy, cat_u, 'SKU-L1', 'l-one', 'L one');
  raise notice 'SE2 ok: expired, upcoming and unsubscribed stores refused; allowance store allowed';

  -- SE3: product quota is enforced for an explicit small plan; archiving frees a slot
  insert into products (store_id, category_id, sku, slug, name) values (store_a, cat_a, 'SKU-A1', 'a-one', 'A one');
  begin
    insert into products (store_id, category_id, sku, slug, name) values (store_a, cat_a, 'SKU-A2', 'a-two', 'A two');
    raise exception 'SE3 failed: product limit exceeded';
  exception when sqlstate 'P0001' then null;
  end;
  update products set status = 'archived' where store_id = store_a and sku = 'SKU-A1';
  insert into products (store_id, category_id, sku, slug, name) values (store_a, cat_a, 'SKU-A2', 'a-two', 'A two');
  raise notice 'SE3 ok: product quota enforced and archiving frees a slot';

  -- SE4: tenant isolation: store B has its own quota
  insert into products (store_id, category_id, sku, slug, name) values (store_b, cat_b, 'SKU-B1', 'b-one', 'B one');
  raise notice 'SE4 ok: quota for one store does not consume another store quota';

  -- SE5: user quota. Owners need auth users and profiles.
  insert into auth.users (id, email) values (owner_1, 'o1-' || tag || '@example.test'), (owner_2, 'o2-' || tag || '@example.test'), (admin_profile, 'adm-' || tag || '@example.test');
  insert into profiles (id, full_name) values (owner_1, 'Owner One'), (owner_2, 'Owner Two'), (admin_profile, 'Admin')
  on conflict (id) do update set full_name = excluded.full_name;
  insert into store_owners (store_id, profile_id, role, is_active) values (store_a, owner_1, 'owner', true);
  begin
    insert into store_owners (store_id, profile_id, role, is_active) values (store_a, owner_2, 'staff', true);
    raise exception 'SE5 failed: user limit exceeded';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'SE5 ok: user limit enforced for active store links';

  -- SE6: feature restriction. Flag enabled but plan explicitly disables the feature.
  insert into feature_flags (store_id, feature_key, enabled) values (store_a, 'room_visualiser', true);
  allowed := app.store_feature_allowed(store_a, 'room_visualiser', today);
  if allowed then raise exception 'SE6 failed: plan-disabled feature allowed'; end if;
  insert into feature_flags (store_id, feature_key, enabled) values (store_a, 'quotations', true);
  allowed := app.store_feature_allowed(store_a, 'quotations', today);
  if not allowed then raise exception 'SE6 failed: enabled feature refused'; end if;
  allowed := app.store_feature_allowed(store_expired, 'quotations', today);
  if allowed then raise exception 'SE6 failed: expired store kept a feature'; end if;
  raise notice 'SE6 ok: plan, flag and subscription state all restrict features';

  -- SE7: renewal requires a platform administrator and creates history, not an overwrite.
  begin
    perform public.renew_subscription(store_expired, plan_unlimited, today + 90);
    raise exception 'SE7 failed: non-admin renewed';
  exception when sqlstate '42501' then null;
  end;
  insert into platform_admins (profile_id) values (admin_profile);
  perform set_config('request.jwt.claim.sub', admin_profile::text, true);
  new_sub := public.renew_subscription(store_expired, plan_unlimited, today + 90);
  select count(*) into n from subscriptions where store_id = store_expired;
  if n <> 2 then raise exception 'SE7 failed: renewal did not keep history (rows %)', n; end if;
  state := app.store_subscription_state(store_expired, today);
  if state <> 'active' then raise exception 'SE7 failed: renewed store is %', state; end if;
  raise notice 'SE7 ok: renewal requires an administrator, keeps history and reactivates';

  -- SE8: a renewal dated before the current period ends starts after it (no overlap loss).
  perform public.renew_subscription(store_a, plan_small, today + 200);
  select count(*) into n from subscriptions where store_id = store_a and period_start > today;
  if n <> 1 then raise exception 'SE8 failed: renewal did not queue after the current period'; end if;
  raise notice 'SE8 ok: renewal queues after the current period';

  -- SE9: allowance window. Expired allowance returns the store to unsubscribed.
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_expired, today - 1, 'test expired allowance');
  -- store_expired was renewed in SE7, so its subscription covers today and wins over any allowance.
  state := app.store_subscription_state(store_expired, today);
  if state <> 'active' then raise exception 'SE9 failed: subscribed store with an allowance is %', state; end if;
  insert into stores (slug, name, status) values ('sub-x-' || tag, 'X', 'active') returning id into store_upcoming;
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_upcoming, today - 1, 'test lapsed allowance');
  state := app.store_subscription_state(store_upcoming, today);
  if state <> 'unsubscribed' then raise exception 'SE9 failed: lapsed allowance is %', state; end if;
  raise notice 'SE9 ok: lapsed allowance returns the store to unsubscribed';

  -- SE10: a draft store is in setup; catalogue work is allowed without quota; activation needs a covering subscription.
  insert into stores (slug, name, status) values ('sub-d-' || tag, 'D', 'draft') returning id into store_upcoming;
  state := app.store_subscription_state(store_upcoming, today);
  if state <> 'setup' then raise exception 'SE10 failed: draft store is %', state; end if;
  insert into categories (store_id, slug, name) values (store_upcoming, 'c-d', 'D') returning id into cat_e;
  insert into products (store_id, category_id, sku, slug, name) values (store_upcoming, cat_e, 'SKU-D1', 'd-one', 'D one');
  begin
    update stores set status = 'active' where id = store_upcoming;
    raise exception 'SE10 failed: activation without a subscription accepted';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'SE10 ok: draft store is setup; activation without a covering subscription is refused';

  -- SE11: activation with a covering subscription is refused when the catalogue exceeds the plan limit (plan_small allows 1 product).
  insert into products (store_id, category_id, sku, slug, name) values (store_upcoming, cat_e, 'SKU-D2', 'd-two', 'D two');
  insert into subscriptions (store_id, plan_id, status, period_start, period_end) values (store_upcoming, plan_small, 'active', today - 1, today + 30);
  begin
    update stores set status = 'active' where id = store_upcoming;
    raise exception 'SE11 failed: activation accepted with a catalogue over the plan product limit';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'SE11 ok: activation refused when the catalogue exceeds the plan limit';

  -- SE12: allowance administration is limited to platform administrators and 90 days.
  perform set_config('request.jwt.claim.sub', owner_1::text, true);
  begin
    perform public.grant_migration_allowance(store_upcoming, today + 30, 'not an admin');
    raise exception 'SE12 failed: non-admin granted an allowance';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claim.sub', admin_profile::text, true);
  begin
    perform public.grant_migration_allowance(store_legacy, today + 120, 'too long a window');
    raise exception 'SE12 failed: allowance longer than 90 days accepted';
  exception when sqlstate '22023' then null;
  end;
  perform public.grant_migration_allowance(store_legacy, today + 45, 'Migration review for SE12');
  state := app.store_subscription_state(store_legacy, today);
  if state <> 'allowance' then raise exception 'SE12 failed: granted allowance state is %', state; end if;
  raise notice 'SE12 ok: allowances need an administrator and are at most 90 days';

  -- SE13: quotas do not apply during an allowance, and an allowance never reaches a subscribed store's limits.
  insert into products (store_id, category_id, sku, slug, name) values (store_legacy, cat_u, 'SKU-L2', 'l-two', 'L two');
  raise notice 'SE13 ok: an allowance store is not subject to product quota';
end $$;
rollback;
