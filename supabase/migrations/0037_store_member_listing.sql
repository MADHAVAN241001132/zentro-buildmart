-- 0037: member listing for store staff pages. profiles are self-readable only, so names come through this
-- function, which checks membership (or platform administration) before returning anything.
create or replace function public.zb_store_members(p_store uuid)
returns table (profile_id uuid, full_name text, role text, is_active boolean, permissions text[], created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not (app.is_platform_admin() or app.is_store_member(p_store)) then
    raise exception 'You are not a member of this store' using errcode = '42501';
  end if;
  return query
    select so.profile_id,
           p.full_name::text,
           so.role::text,
           so.is_active,
           case when so.role = 'owner'
                then (select coalesce(array_agg(k.key order by k.sort_order), '{}') from store_permission_keys k)
                else coalesce((select array_agg(smp.permission_key order by smp.permission_key)
                                 from store_member_permissions smp
                                where smp.store_id = so.store_id and smp.profile_id = so.profile_id), '{}')
           end,
           so.created_at
      from store_owners so
      left join profiles p on p.id = so.profile_id
     where so.store_id = p_store
     order by (so.role = 'owner') desc, so.created_at;
end $$;

revoke all on function public.zb_store_members(uuid) from public, anon;
grant execute on function public.zb_store_members(uuid) to authenticated;
