-- Subscription policy tests (rolled back). SP1-SP6.
\set ON_ERROR_STOP on
begin;
do $$
declare
  today date := app.ist_today();
  tag text := substr(gen_random_uuid()::text, 1, 6);
  plan_small uuid; store_draft uuid; store_expired uuid; store_allow uuid; store_busy uuid;
  store_seed uuid := '11111111-1111-4111-8111-111111111111';
  cat uuid; n int; ord uuid; before_count int; after_count int;
  admin_profile uuid := gen_random_uuid(); owner_x uuid := gen_random_uuid();
  state text; allowed boolean; audit_n int;
begin
  insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
  values ('P_SMALL_' || tag, 'Policy small', 'monthly', 1000, 3, 2, '{}') returning id into plan_small;

  insert into stores (slug, name, status) values ('pol-d-' || tag, 'Draft', 'draft') returning id into store_draft;
  insert into stores (slug, name, status) values ('pol-e-' || tag, 'Expired', 'active') returning id into store_expired;
  insert into stores (slug, name, status) values ('pol-a-' || tag, 'Allow', 'active') returning id into store_allow;
  insert into stores (slug, name, status) values ('pol-b-' || tag, 'Busy', 'active') returning id into store_busy;
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  values (store_busy, plan_small, 'active', today - 10, today + 20);
  insert into categories (store_id, slug, name) values (store_busy, 'pol-c', 'C') returning id into cat;

  -- SP1: commercial rows. Draft and expired stores refuse new orders; allowance and active stores accept them.
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  values (store_expired, plan_small, 'active', today - 60, today - 1);
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_allow, today + 5, 'SP1 allowance');

  begin
    insert into orders (store_id, order_number, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise)
    values (store_draft, 'SP1-D-' || tag, 'Test', 'cash', 100, 100, 0, 100);
    raise exception 'SP1 failed: draft store accepted an order';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    insert into orders (store_id, order_number, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise)
    values (store_expired, 'SP1-E-' || tag, 'Test', 'cash', 100, 100, 0, 100);
    raise exception 'SP1 failed: expired store accepted an order';
  exception when sqlstate 'P0001' then null;
  end;
  insert into orders (store_id, order_number, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise)
  values (store_allow, 'SP1-A-' || tag, 'Test', 'cash', 100, 100, 0, 100);
  insert into orders (store_id, order_number, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise)
  values (store_seed, 'SP1-S-' || tag, 'Test', 'cash', 100, 100, 0, 100) returning id into ord;
  raise notice 'SP1 ok: draft and expired stores refuse new orders; allowance and active stores accept them';

  -- SP2: existing orders remain editable (settlement, cancellation and refund records are not blocked by the commerce guard).
  update subscriptions set period_end = today - 1 where store_id = store_seed;
  update orders set customer_name = 'Settled later' where id = ord;
  if (select customer_name from orders where id = ord) <> 'Settled later' then
    raise exception 'SP2 failed: existing order could not be updated after expiry';
  end if;
  update subscriptions set period_end = today + 365 where store_id = store_seed;
  raise notice 'SP2 ok: existing orders stay updatable after the subscription lapses';

  -- SP3: lowering a plan limit does not remove products, and blocks new products until usage drops below the limit.
  for i in 1..3 loop
    insert into products (store_id, category_id, sku, slug, name) values (store_busy, cat, 'SP3-' || i || tag, 'sp3-' || i || tag, 'P' || i);
  end loop;
  update subscription_plans set max_products = 1 where id = plan_small;
  select count(*) into n from products where store_id = store_busy and status = 'active';
  if n <> 3 then raise exception 'SP3 failed: lowering the limit removed products (%)', n; end if;
  begin
    insert into products (store_id, category_id, sku, slug, name) values (store_busy, cat, 'SP3-X' || tag, 'sp3-x' || tag, 'X');
    raise exception 'SP3 failed: product added above the lowered limit';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'SP3 ok: lowered limits keep existing products and refuse new ones above the limit';

  -- SP4: flags are backfilled for seeded subscribed stores; Visualizer uses the code spelling.
  allowed := app.store_feature_allowed(store_seed, 'room_visualiser', today);
  if not allowed then raise exception 'SP4 failed: seeded store lost room_visualiser'; end if;
  allowed := app.store_feature_allowed(store_seed, 'reports', today);
  if not allowed then raise exception 'SP4 failed: seeded store lost reports'; end if;
  allowed := app.store_feature_allowed(store_seed, 'house_project_planner', today);
  if not allowed then raise exception 'SP4 failed: seeded store lost house_project_planner'; end if;
  raise notice 'SP4 ok: premium flags are present for subscribed stores';

  -- SP5: usage counts match direct counts, and are readable by platform administrators only.
  insert into auth.users (id, email) values (owner_x, 'px-' || tag || '@example.test') on conflict (id) do nothing;
  insert into profiles (id, full_name) values (owner_x, 'Owner X') on conflict (id) do update set full_name = excluded.full_name;
  insert into store_owners (store_id, profile_id, role, is_active) values (store_allow, owner_x, 'owner', true);
  begin
    perform * from public.zb_subscription_usage();
    raise exception 'SP5 failed: non-admin read usage';
  exception when sqlstate '42501' then null;
  end;
  insert into auth.users (id, email) values (admin_profile, 'pa-' || tag || '@example.test') on conflict (id) do nothing;
  insert into profiles (id, full_name) values (admin_profile, 'Admin') on conflict (id) do update set full_name = excluded.full_name;
  insert into platform_admins (profile_id) values (admin_profile) on conflict do nothing;
  perform set_config('request.jwt.claim.sub', admin_profile::text, true);
  select count(*) into n from public.zb_subscription_usage() u
  where u.store_id = store_busy and u.products_count = 3 and u.users_count = 0;
  if n <> 1 then raise exception 'SP5 failed: usage counts for the busy store do not match direct counts'; end if;
  raise notice 'SP5 ok: usage is read by administrators only and matches direct counts';

end $$;

-- SP6 runs in its own block: a block-level exception handler would roll back the admin claim set above.
do $$
declare
  today date := app.ist_today();
  admin_profile uuid;
  store_free uuid; audit_n int;
begin
  select profile_id into admin_profile from platform_admins limit 1;
  perform set_config('request.jwt.claim.sub', admin_profile::text, true);
  insert into stores (slug, name, status) values ('pol-f-' || substr(gen_random_uuid()::text, 1, 6), 'Free', 'draft') returning id into store_free;

  perform public.grant_migration_allowance(store_free, today + 10, 'SP6 audit grant');
  select count(*) into audit_n from audit_logs where action = 'subscription.allowance_granted' and store_id = store_free;
  if audit_n < 1 then raise exception 'SP6 failed: grant not audited'; end if;
  perform public.revoke_migration_allowance(store_free);
  select count(*) into audit_n from audit_logs where action = 'subscription.allowance_revoked' and store_id = store_free;
  if audit_n < 1 then raise exception 'SP6 failed: revocation not audited'; end if;
  raise notice 'SP6 ok: allowance grants and revocations are audited';
end $$;
rollback;
