-- 0032: subscription policy completion.
--
--  1. Plan description.
--  2. Feature-flag backfill for every premium key, so stores that had access before a key
--     existed keep it. Keys were not gated before, so every existing store gets enabled=true
--     where no flag row exists. Stores created later get explicit flags from onboarding.
--  3. The Visualizer key is spelled room_visualiser in code. The seed used room_visualizer;
--     existing rows under that spelling are copied to the code key.
--  4. Commercial rows: a new order or quotation may be inserted only for a store whose
--     state allows commerce (active or allowance). Existing rows are not affected, so
--     payments, cancellations, refunds and settlements of existing orders still work.
--  5. Allowance grants and revocations are written to audit_logs inside the database function.
--  6. Usage counts for the Admin screen, using the same counting rules as the quota triggers:
--     active products (status = 'active') and active store links (is_active = true).

alter table subscription_plans add column if not exists description text
  check (description is null or length(description) <= 500);

-- ---------------------------------------------------------------------------
-- 2 and 3. Feature flags.
-- ---------------------------------------------------------------------------
insert into feature_flags (store_id, feature_key, enabled)
select s.id, k.feature_key, true
from stores s
cross join (values
  ('pos_billing'), ('quotations'), ('room_visualiser'), ('house_project_planner'),
  ('bulk_imports'), ('qr_scan_analytics'), ('tile_batches'), ('purchase_orders'), ('reports')
) as k(feature_key)
on conflict (store_id, feature_key) do nothing;

insert into feature_flags (store_id, feature_key, enabled)
select f.store_id, 'room_visualiser', f.enabled
from feature_flags f
where f.feature_key = 'room_visualizer'
on conflict (store_id, feature_key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Commercial-row guard.
-- ---------------------------------------------------------------------------
create or replace function app.require_commerce_store()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.store_commerce_allowed(new.store_id, app.ist_today()) then
    raise exception 'Commercial operations are not allowed for this store until its subscription is active' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists orders_commerce_guard on orders;
create trigger orders_commerce_guard
  before insert on orders
  for each row execute function app.require_commerce_store();

drop trigger if exists quotations_commerce_guard on quotations;
create trigger quotations_commerce_guard
  before insert on quotations
  for each row execute function app.require_commerce_store();

-- ---------------------------------------------------------------------------
-- 5. Allowance administration with audit (replaces the 0031 versions).
-- ---------------------------------------------------------------------------
create or replace function public.grant_migration_allowance(p_store uuid, p_expires_on date, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := app.ist_today();
  prior date;
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
  select expires_on into prior from subscription_migration_allowances where store_id = p_store;

  insert into subscription_migration_allowances (store_id, expires_on, reason, granted_by)
  values (p_store, p_expires_on, trim(p_reason), auth.uid())
  on conflict (store_id) do update
    set expires_on = excluded.expires_on, reason = excluded.reason, granted_by = excluded.granted_by, updated_at = now();

  insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
  values (p_store, auth.uid(), 'super_admin', 'subscription.allowance_granted', 'store', p_store,
          case when prior is null then null else jsonb_build_object('expires_on', prior) end,
          jsonb_build_object('expires_on', p_expires_on, 'reason', trim(p_reason)));
end $$;

create or replace function public.revoke_migration_allowance(p_store uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  removed integer;
  prior date;
begin
  if not app.is_platform_admin() then
    raise exception 'Only platform administrators can revoke allowances' using errcode = '42501';
  end if;
  select expires_on into prior from subscription_migration_allowances where store_id = p_store;
  delete from subscription_migration_allowances where store_id = p_store;
  get diagnostics removed = row_count;
  if removed > 0 then
    insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state)
    values (p_store, auth.uid(), 'super_admin', 'subscription.allowance_revoked', 'store', p_store,
            jsonb_build_object('expires_on', prior));
  end if;
  return removed > 0;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Usage for the Admin screen. Platform administrators only.
-- ---------------------------------------------------------------------------
create or replace function public.zb_subscription_usage()
returns table (store_id uuid, products_count bigint, users_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Only platform administrators can read usage' using errcode = '42501';
  end if;
  return query
    select s.id,
           (select count(*) from products p where p.store_id = s.id and p.status = 'active'),
           (select count(*) from store_owners o where o.store_id = s.id and o.is_active)
    from stores s
    where exists (select 1 from subscriptions x where x.store_id = s.id);
end $$;

revoke all on function public.zb_subscription_usage() from public;
grant execute on function public.zb_subscription_usage() to authenticated, service_role;
