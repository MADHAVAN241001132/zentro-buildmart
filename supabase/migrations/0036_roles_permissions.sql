-- 0036: granular store permissions, authorised access changes and last-owner protection.
-- Roles stay as store_owners.role (owner, manager, staff). Owners hold every permission implicitly;
-- managers and staff hold the rows in store_member_permissions. Writes go through the RPCs below, which
-- refuse grants beyond the caller's own authority, changes to the caller's own access, and removal of the
-- last active owner. Direct table writes are also guarded (triggers and revoked grants), so the RPCs are
-- not the only protection.

-- 1. Permission catalogue.
create table if not exists store_permission_keys (
  key         text primary key,
  label       text not null,
  area        text not null,
  sort_order  integer not null
);

insert into store_permission_keys (key, label, area, sort_order) values
  ('product_management', 'Product management', 'Catalogue', 1),
  ('category_brand_management', 'Category and brand management', 'Catalogue', 2),
  ('inventory_management', 'Inventory management', 'Stock', 3),
  ('tile_batch_management', 'Tile batch management', 'Stock', 4),
  ('pos_billing', 'POS billing', 'Sales', 5),
  ('order_management', 'Order management', 'Sales', 6),
  ('cash_confirmation', 'Cash confirmation', 'Finance', 7),
  ('refund_management', 'Refund management', 'Finance', 8),
  ('supplier_management', 'Supplier management', 'Purchasing', 9),
  ('purchasing', 'Purchasing', 'Purchasing', 10),
  ('customer_management', 'Customer management', 'Customers', 11),
  ('credit_management', 'Credit management', 'Customers', 12),
  ('quotations', 'Quotations', 'Sales', 13),
  ('reports_exports', 'Reports and exports', 'Reports', 14),
  ('qr_management', 'QR management', 'Marketing', 15),
  ('qr_analytics', 'QR analytics', 'Marketing', 16),
  ('store_settings', 'Store settings', 'Administration', 17),
  ('staff_management', 'Staff management', 'Administration', 18)
on conflict (key) do nothing;

alter table store_permission_keys enable row level security;
drop policy if exists store_permission_keys_read on store_permission_keys;
create policy store_permission_keys_read on store_permission_keys for select to authenticated using (true);

-- 2. Per-member grants for managers and staff.
create table if not exists store_member_permissions (
  store_id        uuid not null,
  profile_id      uuid not null,
  permission_key  text not null references store_permission_keys(key),
  granted_by      uuid references profiles(id) on delete set null,
  granted_at      timestamptz not null default now(),
  primary key (store_id, profile_id, permission_key),
  constraint store_member_permissions_member_fk foreign key (store_id, profile_id)
    references store_owners(store_id, profile_id) on delete cascade
);

alter table store_member_permissions enable row level security;
drop policy if exists store_member_permissions_read on store_member_permissions;
create policy store_member_permissions_read on store_member_permissions for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
revoke insert, update, delete on store_member_permissions from anon, authenticated;

-- 3. Default permissions for a role. Applied by the access RPC when a role is assigned.
create or replace function app.default_permissions(p_role text)
returns text[]
language sql immutable as $$
  select case p_role
    when 'manager' then array[
      'product_management', 'category_brand_management', 'inventory_management', 'tile_batch_management',
      'pos_billing', 'order_management', 'cash_confirmation', 'refund_management', 'supplier_management',
      'purchasing', 'customer_management', 'credit_management', 'quotations', 'reports_exports',
      'qr_management', 'qr_analytics']::text[]
    when 'staff' then array[
      'pos_billing', 'order_management', 'customer_management', 'inventory_management', 'tile_batch_management']::text[]
    else array[]::text[]
  end
$$;

-- 4. Authority checks. Owners are implicit; grants apply only while the membership is active.
create or replace function app.has_store_permission(p_store uuid, p_key text)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from store_owners so
    where so.store_id = p_store
      and so.profile_id = auth.uid()
      and so.is_active
      and (
        so.role = 'owner'
        or exists (
          select 1 from store_member_permissions smp
          where smp.store_id = so.store_id and smp.profile_id = so.profile_id and smp.permission_key = p_key
        )
      )
  )
$$;

-- The permissions the signed-in user holds in a store (all keys for an active owner, none when inactive).
create or replace function public.zb_my_store_permissions(p_store uuid)
returns text[]
language sql stable security definer set search_path = public, app as $$
  select case
    when so.role = 'owner' then (select coalesce(array_agg(k.key order by k.sort_order), '{}') from store_permission_keys k)
    else coalesce((select array_agg(smp.permission_key order by smp.permission_key) from store_member_permissions smp
                   where smp.store_id = so.store_id and smp.profile_id = so.profile_id), '{}')
  end
  from store_owners so
  where so.store_id = p_store and so.profile_id = auth.uid() and so.is_active
$$;

-- 5. QR analytics: membership, the qr_analytics permission and the subscription feature must all hold.
--    Platform administrators are not limited by the store's subscription.
create or replace function app.qr_analytics_allowed(p_store uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_platform_admin()
      or (p_store is not null
          and app.is_store_member(p_store, array['owner', 'manager'])
          and app.has_store_permission(p_store, 'qr_analytics')
          and app.store_feature_allowed(p_store, 'qr_scan_analytics'))
$$;

-- 6. Last-owner protection enforced on the table, so direct writes cannot remove the final active owner.
create or replace function app.guard_store_owner_rows()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  remaining integer;
begin
  if tg_op = 'UPDATE' then
    if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active) then
      select count(*) into remaining from store_owners
       where store_id = old.store_id and role = 'owner' and is_active and profile_id <> old.profile_id;
      if remaining = 0 then
        raise exception 'The store must keep at least one active owner' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  -- Deletion cascaded from a deleted store is allowed; deleting the last owner of a live store is not.
  if old.role = 'owner' and old.is_active and exists (select 1 from stores where id = old.store_id) then
    select count(*) into remaining from store_owners
     where store_id = old.store_id and role = 'owner' and is_active and profile_id <> old.profile_id;
    if remaining = 0 then
      raise exception 'The store must keep at least one active owner' using errcode = 'P0001';
    end if;
  end if;
  return old;
end $$;

drop trigger if exists store_owners_last_owner_guard on store_owners;
create trigger store_owners_last_owner_guard before update or delete on store_owners
  for each row execute function app.guard_store_owner_rows();

-- 7. Shared caller check for access changes. Returns the caller's role ('platform_admin' for administrators).
create or replace function app.access_manager_role(p_store uuid)
returns text
language plpgsql stable security definer set search_path = public, app as $$
declare
  caller_role text;
begin
  if app.is_platform_admin() then return 'platform_admin'; end if;
  select so.role into caller_role from store_owners so
   where so.store_id = p_store and so.profile_id = auth.uid() and so.is_active;
  if caller_role is null then
    raise exception 'You are not an active member of this store' using errcode = '42501';
  end if;
  if caller_role = 'manager' and not app.has_store_permission(p_store, 'staff_management') then
    raise exception 'You do not have permission to manage staff' using errcode = '42501';
  end if;
  if caller_role = 'staff' then
    raise exception 'You do not have permission to manage staff' using errcode = '42501';
  end if;
  return caller_role;
end $$;

-- 8. Assign a role and permissions. Replaces the member's grants atomically and writes an audit entry.
create or replace function public.zb_set_store_member_access(
  p_store uuid, p_profile uuid, p_role text, p_permissions text[]
) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  target store_owners%rowtype;
  perm text;
  active_owners integer;
  before_perms text[];
  after_perms text[];
begin
  caller_role := app.access_manager_role(p_store);
  if p_role not in ('owner', 'manager', 'staff') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if caller is not null and caller = p_profile and caller_role <> 'platform_admin' then
    raise exception 'You cannot change your own access' using errcode = '42501';
  end if;
  select * into target from store_owners where store_id = p_store and profile_id = p_profile for update;
  if not found then
    raise exception 'That person is not a member of this store' using errcode = 'P0002';
  end if;
  if caller_role = 'manager' and (target.role = 'owner' or p_role = 'owner') then
    raise exception 'Only an owner can change owner access' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_permissions, '{}'::text[])) k where k not in (select key from store_permission_keys)) then
    raise exception 'Unknown permission' using errcode = '22023';
  end if;
  if caller_role = 'manager' then
    foreach perm in array coalesce(p_permissions, '{}'::text[]) loop
      if not app.has_store_permission(p_store, perm) then
        raise exception 'You cannot grant a permission you do not hold' using errcode = '42501';
      end if;
    end loop;
  end if;
  if target.role = 'owner' and target.is_active and p_role <> 'owner' then
    select count(*) into active_owners from store_owners
     where store_id = p_store and role = 'owner' and is_active and profile_id <> p_profile;
    if active_owners = 0 then
      raise exception 'The store must keep at least one active owner' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(array_agg(permission_key order by permission_key), '{}') into before_perms
    from store_member_permissions where store_id = p_store and profile_id = p_profile;

  delete from store_member_permissions where store_id = p_store and profile_id = p_profile;
  update store_owners set role = p_role where store_id = p_store and profile_id = p_profile;
  if p_role <> 'owner' then
    insert into store_member_permissions (store_id, profile_id, permission_key, granted_by)
    select distinct p_store, p_profile, k, caller
      from unnest(coalesce(p_permissions, '{}'::text[])) as k;
  end if;

  select coalesce(array_agg(permission_key order by permission_key), '{}') into after_perms
    from store_member_permissions where store_id = p_store and profile_id = p_profile;

  insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
  values (
    p_store, caller, case when caller_role = 'platform_admin' then 'super_admin' else 'shop_owner' end,
    'staff.access_changed', 'store_owner', p_profile,
    jsonb_build_object('role', target.role, 'permissions', before_perms),
    jsonb_build_object('role', p_role, 'permissions', after_perms)
  );
end $$;

-- 9. Activate or deactivate a member. Activation runs the existing user-quota trigger.
create or replace function public.zb_set_store_member_active(p_store uuid, p_profile uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public, app as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  target store_owners%rowtype;
  active_owners integer;
begin
  caller_role := app.access_manager_role(p_store);
  if caller is not null and caller = p_profile and caller_role <> 'platform_admin' then
    raise exception 'You cannot change your own access' using errcode = '42501';
  end if;
  select * into target from store_owners where store_id = p_store and profile_id = p_profile for update;
  if not found then
    raise exception 'That person is not a member of this store' using errcode = 'P0002';
  end if;
  if caller_role = 'manager' and target.role = 'owner' then
    raise exception 'Only an owner can change owner access' using errcode = '42501';
  end if;
  if target.is_active = p_active then return; end if;
  if not p_active and target.role = 'owner' then
    select count(*) into active_owners from store_owners
     where store_id = p_store and role = 'owner' and is_active and profile_id <> p_profile;
    if active_owners = 0 then
      raise exception 'The store must keep at least one active owner' using errcode = 'P0001';
    end if;
  end if;

  update store_owners set is_active = p_active where store_id = p_store and profile_id = p_profile;

  insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
  values (
    p_store, caller, case when caller_role = 'platform_admin' then 'super_admin' else 'shop_owner' end,
    case when p_active then 'staff.activated' else 'staff.deactivated' end,
    'store_owner', p_profile,
    jsonb_build_object('is_active', target.is_active),
    jsonb_build_object('is_active', p_active)
  );
end $$;

revoke all on function public.zb_my_store_permissions(uuid) from public, anon;
revoke all on function public.zb_set_store_member_access(uuid, uuid, text, text[]) from public, anon;
revoke all on function public.zb_set_store_member_active(uuid, uuid, boolean) from public, anon;
grant execute on function public.zb_my_store_permissions(uuid) to authenticated;
grant execute on function public.zb_set_store_member_access(uuid, uuid, text, text[]) to authenticated;
grant execute on function public.zb_set_store_member_active(uuid, uuid, boolean) to authenticated;
