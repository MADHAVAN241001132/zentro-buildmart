-- 0030: runtime subscription enforcement.
--
-- Rules (documented in docs/SUBSCRIPTIONS.md):
--  * A store with NO subscription rows is "legacy": it is not restricted by this
--    migration, so existing stores, seeds and tests keep working.
--  * A store that has subscription rows is "active" when a row covers today
--    (grace rows cover through grace_ends_on), "upcoming" when the next period
--    starts later, otherwise "expired".
--  * New products, new store owners (active links) and new feature use require
--    an active subscription. Existing orders, invoices, refunds and financial
--    records are not touched by anything in this migration.
--  * Limits are explicit. A plan may be unlimited only when products_unlimited or
--    users_unlimited is set; a null limit without the flag is refused.
--  * Quota checks run under a per-store advisory transaction lock, so concurrent
--    inserts cannot exceed the limit.

-- ---------------------------------------------------------------------------
-- 1. Plan model: explicit user limit and explicit unlimited flags.
-- ---------------------------------------------------------------------------
alter table subscription_plans add column if not exists max_users integer check (max_users is null or max_users > 0);
alter table subscription_plans add column if not exists users_unlimited boolean not null default false;
alter table subscription_plans add column if not exists products_unlimited boolean not null default false;

-- Existing plans keep their behaviour: the enterprise plan was unlimited for products,
-- every other plan already has an explicit product cap, and users were uncapped
-- before, so non-enterprise plans get a conservative explicit user cap.
update subscription_plans set products_unlimited = true where max_products is null;
update subscription_plans set users_unlimited = true where code = 'ENTERPRISE';
update subscription_plans set max_users = 5 where max_users is null and not users_unlimited;

alter table subscription_plans drop constraint if exists subscription_plans_products_limit_explicit;
alter table subscription_plans add constraint subscription_plans_products_limit_explicit
  check (max_products is not null or products_unlimited);
alter table subscription_plans drop constraint if exists subscription_plans_users_limit_explicit;
alter table subscription_plans add constraint subscription_plans_users_limit_explicit
  check (max_users is not null or users_unlimited);

-- ---------------------------------------------------------------------------
-- 2. Date helpers. Subscription dates are Indian calendar dates.
-- ---------------------------------------------------------------------------
create or replace function app.ist_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- Returns 'legacy', 'active', 'upcoming' or 'expired' for a store on a given day.
create or replace function app.store_subscription_state(p_store uuid, p_on date)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from subscriptions where store_id = p_store) then
    return 'legacy';
  end if;
  if exists (
    select 1 from subscriptions s
    where s.store_id = p_store
      and (
        (s.status in ('active', 'trialing') and p_on between s.period_start and s.period_end)
        or (s.status = 'grace' and p_on between s.period_start and coalesce(s.grace_ends_on, s.period_end))
      )
  ) then
    return 'active';
  end if;
  if exists (
    select 1 from subscriptions s
    where s.store_id = p_store and s.status in ('active', 'trialing', 'grace') and s.period_start > p_on
  ) then
    return 'upcoming';
  end if;
  return 'expired';
end $$;

-- The plan limits that apply today. Returns no row when no subscription covers today.
create or replace function app.store_current_plan(p_store uuid, p_on date)
returns table (max_products integer, products_unlimited boolean, max_users integer, users_unlimited boolean, features jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.max_products, p.products_unlimited, p.max_users, p.users_unlimited, p.features
  from subscriptions s
  join subscription_plans p on p.id = s.plan_id
  where s.store_id = p_store
    and (
      (s.status in ('active', 'trialing') and p_on between s.period_start and s.period_end)
      or (s.status = 'grace' and p_on between s.period_start and coalesce(s.grace_ends_on, s.period_end))
    )
  order by s.period_end desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 3. Feature check shared by the database and the application.
--    legacy stores: only an explicit disabled flag blocks the feature.
--    subscribed stores: the subscription must cover today, the flag must be
--    enabled, and the plan must not explicitly disable the feature.
-- ---------------------------------------------------------------------------
create or replace function app.store_feature_allowed(p_store uuid, p_key text, p_on date default app.ist_today())
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  st text;
  flag_enabled boolean;
  plan_features jsonb;
begin
  st := app.store_subscription_state(p_store, p_on);
  select f.enabled into flag_enabled from feature_flags f where f.store_id = p_store and f.feature_key = p_key;

  if st = 'legacy' then
    return coalesce(flag_enabled, true);
  end if;
  if st <> 'active' then
    return false;
  end if;
  if not coalesce(flag_enabled, false) then
    return false;
  end if;
  select cp.features into plan_features from app.store_current_plan(p_store, p_on) cp;
  if plan_features ? p_key and jsonb_typeof(plan_features -> p_key) = 'boolean' and (plan_features ->> p_key)::boolean = false then
    return false;
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Quota triggers. Each takes a per-store transaction lock first.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_product_quota()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st text;
  plan record;
  current_count integer;
begin
  -- Archiving or editing an existing product never consumes quota.
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('zb-quota-products:' || new.store_id::text, 0));
  st := app.store_subscription_state(new.store_id, app.ist_today());
  if st = 'legacy' then return new; end if;
  if st <> 'active' then
    raise exception 'The subscription for this store is not active' using errcode = 'P0001';
  end if;

  select * into plan from app.store_current_plan(new.store_id, app.ist_today());
  if plan.products_unlimited then return new; end if;
  if plan.max_products is null then
    raise exception 'The plan has no product limit configured' using errcode = 'P0001';
  end if;

  select count(*) into current_count from products
  where store_id = new.store_id and status = 'active' and id <> new.id;
  if current_count >= plan.max_products then
    raise exception 'The product limit for the current plan has been reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists products_quota_guard on products;
create trigger products_quota_guard
  before insert or update of status on products
  for each row execute function app.enforce_product_quota();

create or replace function app.enforce_user_quota()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st text;
  plan record;
  current_count integer;
begin
  if not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.is_active then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('zb-quota-users:' || new.store_id::text, 0));
  st := app.store_subscription_state(new.store_id, app.ist_today());
  if st = 'legacy' then return new; end if;
  if st <> 'active' then
    raise exception 'The subscription for this store is not active' using errcode = 'P0001';
  end if;

  select * into plan from app.store_current_plan(new.store_id, app.ist_today());
  if plan.users_unlimited then return new; end if;
  if plan.max_users is null then
    raise exception 'The plan has no user limit configured' using errcode = 'P0001';
  end if;

  select count(*) into current_count from store_owners
  where store_id = new.store_id and is_active and profile_id <> new.profile_id;
  if current_count >= plan.max_users then
    raise exception 'The user limit for the current plan has been reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists store_owners_quota_guard on store_owners;
create trigger store_owners_quota_guard
  before insert or update of is_active on store_owners
  for each row execute function app.enforce_user_quota();

-- ---------------------------------------------------------------------------
-- 5. Renewal. Creates a new period after the current one (or from today when
--    the store is not covered), keeps the old row as history, and serialises
--    concurrent renewals for the same store. Platform admins only.
-- ---------------------------------------------------------------------------
create or replace function public.renew_subscription(p_store uuid, p_plan uuid, p_period_end date)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := app.ist_today();
  latest subscriptions%rowtype;
  start_on date;
  new_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Only platform administrators can renew subscriptions' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('zb-subscription:' || p_store::text, 0));

  select * into latest from subscriptions where store_id = p_store order by period_end desc limit 1;
  if latest.id is null then
    start_on := today;
  elsif latest.period_end >= today then
    start_on := latest.period_end + 1;
  else
    start_on := today;
  end if;
  if p_period_end <= start_on then
    raise exception 'The renewal end date must be after %', start_on using errcode = '22023';
  end if;

  update subscriptions
     set status = 'expired', updated_at = now()
   where store_id = p_store and status in ('active', 'trialing', 'grace') and period_end < start_on;

  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  values (p_store, p_plan, 'active', start_on, p_period_end)
  returning id into new_id;
  return new_id;
end $$;

-- Public wrappers used by the application through RPC.
create or replace function public.zb_subscription_state(p_store uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select app.store_subscription_state(p_store, app.ist_today())
$$;

create or replace function public.zb_feature_allowed(p_store uuid, p_key text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.store_feature_allowed(p_store, p_key, app.ist_today())
$$;

revoke all on function public.renew_subscription(uuid, uuid, date) from public;
grant execute on function public.renew_subscription(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.zb_subscription_state(uuid) to authenticated, service_role;
grant execute on function public.zb_feature_allowed(uuid, text) to authenticated, service_role;
