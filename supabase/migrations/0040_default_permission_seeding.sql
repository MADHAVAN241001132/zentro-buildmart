-- 0040: a manager or staff membership starts with its role's default permissions, whichever path created it.
-- Before this, a membership inserted without explicit grants held nothing. Owners hold every permission implicitly.
create or replace function app.seed_default_permissions()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.role <> 'owner' then
    insert into store_member_permissions (store_id, profile_id, permission_key, granted_by)
    select new.store_id, new.profile_id, k, null
      from unnest(app.default_permissions(new.role)) as k
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists store_owners_seed_permissions on store_owners;
create trigger store_owners_seed_permissions after insert on store_owners
  for each row execute function app.seed_default_permissions();

-- Backfill: existing manager or staff memberships with no grant rows receive the role defaults once.
insert into store_member_permissions (store_id, profile_id, permission_key, granted_by)
select so.store_id, so.profile_id, k, null
  from store_owners so
  cross join lateral unnest(app.default_permissions(so.role)) as k
 where so.role <> 'owner'
   and not exists (select 1 from store_member_permissions smp where smp.store_id = so.store_id and smp.profile_id = so.profile_id)
on conflict do nothing;
