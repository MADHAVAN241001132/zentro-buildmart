-- 0029: Admin store onboarding progress.
-- One onboarding row per new store. store_id and owner_profile_id are set once and cannot be changed,
-- so a retried step cannot create a second store or a second owner link. Drafts never hold passwords.

create table store_onboardings (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid unique references stores(id) on delete set null,
  owner_profile_id  uuid references profiles(id) on delete set null,
  current_step      smallint not null default 1 check (current_step between 1 and 8),
  step_data         jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(step_data) = 'object' and step_data::text !~* 'password'),
  status            text not null default 'in_progress' check (status in ('in_progress','completed')),
  created_by        uuid references profiles(id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status <> 'completed' or (store_id is not null and owner_profile_id is not null and completed_at is not null))
);
create index store_onboardings_status_idx on store_onboardings(status, updated_at desc);

create or replace function app.onboarding_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.store_id is not null and new.store_id is distinct from old.store_id then
    raise exception 'onboarding store link cannot change' using errcode = '42501';
  end if;
  if old.owner_profile_id is not null and new.owner_profile_id is distinct from old.owner_profile_id then
    raise exception 'onboarding owner link cannot change' using errcode = '42501';
  end if;
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'a completed onboarding cannot be reopened' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger store_onboardings_guard before update on store_onboardings
  for each row execute function app.onboarding_guard();

alter table store_onboardings enable row level security;
create policy store_onboardings_platform_admin on store_onboardings for all
  using (app.is_platform_admin()) with check (app.is_platform_admin());
