-- 0031: legacy-store policy.
--
-- Store states (app.store_subscription_state):
--   active / upcoming / expired  a store with subscription rows (unchanged from 0030)
--   allowance                    no subscription rows, but a platform administrator granted
--                                a time-limited migration allowance that has not expired
--   setup                        draft store, not yet activated: catalogue work only
--   unsubscribed                 anything else: an active store with no subscription and no
--                                valid allowance. New business operations are refused.
--
-- Rules:
--  * Activating a store (any route, including direct updates) requires a subscription that
--    covers today. Enforced by trigger stores_activation_guard.
--  * An allowance is granted only by a platform administrator, for at most 90 days,
--    and is removed when revoked. It is never created automatically except by the one-time
--    migration step below.
--  * Quotas do not apply during setup or an allowance (the allowance is an explicit
--    unlimited configuration for its window). Activation checks the product and user
--    counts against the plan before the store goes live.
--  * Existing paid orders, invoices, refunds and financial records are never blocked. Only
--    new business operations are gated (see lib/services/entitlements.ts).

create table if not exists subscription_migration_allowances (
  store_id    uuid primary key references stores(id) on delete cascade,
  expires_on  date not null,
  reason      text not null check (length(trim(reason)) between 5 and 300),
  granted_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table subscription_migration_allowances enable row level security;
drop policy if exists allowances_platform_admin on subscription_migration_allowances;
create policy allowances_platform_admin on subscription_migration_allowances
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- State function (replaces the 0030 version; the subscription-row logic is unchanged).
-- ---------------------------------------------------------------------------
create or replace function app.store_subscription_state(p_store uuid, p_on date)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  st text;
begin
  if exists (select 1 from subscriptions where store_id = p_store) then
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
  end if;

  if exists (
    select 1 from subscription_migration_allowances a where a.store_id = p_store and a.expires_on >= p_on
  ) then
    return 'allowance';
  end if;

  select s.status into st from stores s where s.id = p_store;
  if st = 'draft' then return 'setup'; end if;
  return 'unsubscribed';
end $$;

-- True for the states in which new commercial operations (sales, quotations, guest orders) are allowed.
create or replace function app.store_commerce_allowed(p_store uuid, p_on date default app.ist_today())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.store_subscription_state(p_store, p_on) in ('active', 'allowance')
$$;

-- ---------------------------------------------------------------------------
-- Feature check: setup and allowance follow the flag only (explicit false blocks).
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

  if st in ('setup', 'allowance') then
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
-- Quota triggers (replace 0030 versions): setup and allowance skip quota; unsubscribed,
-- expired and upcoming are refused for new active rows.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_product_quota()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st text;
  plan record;
  current_count integer;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('zb-quota-products:' || new.store_id::text, 0));
  st := app.store_subscription_state(new.store_id, app.ist_today());
  if st in ('setup', 'allowance') then return new; end if;
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
  if st in ('setup', 'allowance') then return new; end if;
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

-- ---------------------------------------------------------------------------
-- Activation guard: any route that moves a store to active must have a covering
-- subscription, and the existing catalogue and staff must fit the plan.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_activation_subscription()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st text;
  plan record;
  cnt integer;
begin
  st := app.store_subscription_state(new.id, app.ist_today());
  if st <> 'active' then
    raise exception 'A subscription that covers today is required before the store can be activated' using errcode = 'P0001';
  end if;

  select * into plan from app.store_current_plan(new.id, app.ist_today());
  if not plan.products_unlimited then
    select count(*) into cnt from products where store_id = new.id and status = 'active';
    if plan.max_products is null or cnt > plan.max_products then
      raise exception 'The store has more active products than the plan allows. Archive products before activation' using errcode = 'P0001';
    end if;
  end if;
  if not plan.users_unlimited then
    select count(*) into cnt from store_owners where store_id = new.id and is_active;
    if plan.max_users is null or cnt > plan.max_users then
      raise exception 'The store has more active users than the plan allows. Deactivate users before activation' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stores_activation_guard on stores;
create trigger stores_activation_guard
  before update of status on stores
  for each row
  when (new.status = 'active' and old.status is distinct from 'active')
  execute function app.enforce_activation_subscription();

-- ---------------------------------------------------------------------------
-- Allowance administration (platform administrators only, at most 90 days).
-- ---------------------------------------------------------------------------
create or replace function public.grant_migration_allowance(p_store uuid, p_expires_on date, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := app.ist_today();
begin
  if not app.is_platform_admin() then
    raise exception 'Only platform administrators can grant allowances' using errcode = '42501';
  end if;
  if p_expires_on <= today or p_expires_on > today + 90 then
    raise exception 'An allowance must end between tomorrow and 90 days from today' using errcode = '22023';
  end if;
  if exists (select 1 from subscriptions where store_id = p_store) then
    raise exception 'The store already has subscription rows; no allowance is needed' using errcode = 'P0001';
  end if;
  insert into subscription_migration_allowances (store_id, expires_on, reason, granted_by)
  values (p_store, p_expires_on, trim(p_reason), auth.uid())
  on conflict (store_id) do update
    set expires_on = excluded.expires_on, reason = excluded.reason, granted_by = excluded.granted_by, updated_at = now();
end $$;

create or replace function public.revoke_migration_allowance(p_store uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  removed integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Only platform administrators can revoke allowances' using errcode = '42501';
  end if;
  delete from subscription_migration_allowances where store_id = p_store;
  get diagnostics removed = row_count;
  return removed > 0;
end $$;

-- ---------------------------------------------------------------------------
-- One-time migration: every store that is active today and has no subscription receives a
-- 30-day allowance so that existing trading is not interrupted at deployment. The allowance
-- is visible and revocable in the Admin subscriptions screen.
-- ---------------------------------------------------------------------------
insert into subscription_migration_allowances (store_id, expires_on, reason, granted_by)
select s.id,
       app.ist_today() + 30,
       'Migration 0031: existing active store before subscription enforcement. Add a subscription before this date.',
       null
from stores s
where s.status = 'active'
  and not exists (select 1 from subscriptions x where x.store_id = s.id)
on conflict (store_id) do nothing;

-- Public wrappers: the subscription and commerce checks used by the application.
create or replace function public.zb_commerce_allowed(p_store uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.store_commerce_allowed(p_store, app.ist_today())
$$;

revoke all on function public.grant_migration_allowance(uuid, date, text) from public;
revoke all on function public.revoke_migration_allowance(uuid) from public;
grant execute on function public.grant_migration_allowance(uuid, date, text) to authenticated, service_role;
grant execute on function public.revoke_migration_allowance(uuid) to authenticated, service_role;
grant execute on function public.zb_commerce_allowed(uuid) to authenticated, service_role;
