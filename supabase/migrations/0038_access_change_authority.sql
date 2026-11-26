-- 0038: a manager may change only the permissions it holds, in either direction. Adding or removing a
-- permission outside its own authority is refused. Replaces zb_set_store_member_access from 0036.
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
  requested text[] := coalesce(p_permissions, '{}'::text[]);
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
  if exists (select 1 from unnest(requested) k where k not in (select key from store_permission_keys)) then
    raise exception 'Unknown permission' using errcode = '22023';
  end if;

  select coalesce(array_agg(permission_key order by permission_key), '{}') into before_perms
    from store_member_permissions where store_id = p_store and profile_id = p_profile;

  if caller_role = 'manager' then
    -- Every permission that is added or removed must be one the manager holds.
    foreach perm in array (
      select coalesce(array_agg(d.x), '{}'::text[]) from (
        (select unnest(requested) as x except select unnest(before_perms))
        union
        (select unnest(before_perms) as x except select unnest(requested))
      ) d
    ) loop
      if not app.has_store_permission(p_store, perm) then
        raise exception 'You cannot change a permission you do not hold' using errcode = '42501';
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

  delete from store_member_permissions where store_id = p_store and profile_id = p_profile;
  update store_owners set role = p_role where store_id = p_store and profile_id = p_profile;
  if p_role <> 'owner' then
    insert into store_member_permissions (store_id, profile_id, permission_key, granted_by)
    select distinct p_store, p_profile, k, caller from unnest(requested) as k;
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
