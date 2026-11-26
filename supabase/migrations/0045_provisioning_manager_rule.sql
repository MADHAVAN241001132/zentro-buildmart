-- 0045: a manager may provision staff accounts only. Creating a manager needs an owner or a platform administrator.
-- Also keeps the existing rule that a manager cannot grant a permission it does not hold.
create or replace function app.prov_assert_actor(p_store uuid, p_actor uuid, p_actor_type text, p_role text, p_perms text[])
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_role text;
  v_perm text;
begin
  if p_actor_type = 'super_admin' then
    if not exists (select 1 from platform_admins where profile_id = p_actor) then
      raise exception 'forbidden: not a platform administrator' using errcode = '42501';
    end if;
  elsif p_actor_type = 'shop_owner' then
    select so.role into v_role from store_owners so
     where so.store_id = p_store and so.profile_id = p_actor and so.is_active;
    if v_role is null then
      raise exception 'forbidden: not an active member of this store' using errcode = '42501';
    end if;
    if v_role <> 'owner' then
      if v_role <> 'manager' or p_role <> 'staff' or not exists (
           select 1 from store_member_permissions smp
            where smp.store_id = p_store and smp.profile_id = p_actor and smp.permission_key = 'staff_management') then
        raise exception 'forbidden: only an owner can create this account' using errcode = '42501';
      end if;
      foreach v_perm in array coalesce(p_perms, '{}') loop
        if not exists (select 1 from store_member_permissions smp
                        where smp.store_id = p_store and smp.profile_id = p_actor and smp.permission_key = v_perm) then
          raise exception 'forbidden: a permission cannot be granted that the actor does not hold' using errcode = '42501';
        end if;
      end loop;
    end if;
  else
    raise exception 'invalid actor type' using errcode = '22023';
  end if;
  foreach v_perm in array coalesce(p_perms, '{}') loop
    if not exists (select 1 from store_permission_keys where key = v_perm) then
      raise exception 'unknown permission key' using errcode = '22023';
    end if;
  end loop;
end $$;
