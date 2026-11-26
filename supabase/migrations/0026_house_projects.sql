-- 0026_house_projects.sql
-- House Project Planner: guest-owned construction/renovation projects with rooms,
-- room-wise product selections, and database-backed idempotency keys for
-- cart and quotation requests.

create table house_projects (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  guest_session_id    uuid not null references guest_sessions(id) on delete cascade,
  name                text not null check (length(btrim(name)) between 1 and 120),
  description         text check (description is null or length(description) <= 1000),
  project_type        text not null default 'renovation' check (project_type in ('construction','renovation')),
  budget_paise        bigint check (budget_paise is null or budget_paise >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index house_projects_session_idx on house_projects (guest_session_id, created_at);

create table house_project_rooms (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  project_id          uuid not null references house_projects(id) on delete cascade,
  room_type           text not null check (room_type in (
                        'living_room','bedroom','kitchen','bathroom','dining_room',
                        'balcony','parking_area','outdoor_area','custom')),
  name                text not null check (length(btrim(name)) between 1 and 80),
  length_value        numeric(10,2) check (length_value is null or length_value > 0),
  width_value         numeric(10,2) check (width_value is null or width_value > 0),
  height_value        numeric(10,2) check (height_value is null or height_value > 0),
  measure_unit        text not null default 'ft' check (measure_unit in ('ft','m','cm','mm')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index house_project_rooms_project_idx on house_project_rooms (project_id, created_at);

create table house_project_items (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  project_id          uuid not null references house_projects(id) on delete cascade,
  room_id             uuid references house_project_rooms(id) on delete cascade,
  variant_id          uuid not null references product_variants(id) on delete cascade,
  quantity            numeric(12,3) not null check (quantity > 0 and quantity <= 999999),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index house_project_items_project_idx on house_project_items (project_id, room_id);
-- One line per variant per room (or per project when no room is set).
create unique index house_project_items_unique_room_idx
  on house_project_items (project_id, room_id, variant_id) where room_id is not null;
create unique index house_project_items_unique_project_idx
  on house_project_items (project_id, variant_id) where room_id is null;

-- Database-backed idempotency for transaction-critical requests (cart adds from
-- the visualizer and planner, quotation requests). Cookies are not relied upon.
create table guest_request_keys (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  guest_session_id    uuid not null references guest_sessions(id) on delete cascade,
  kind                text not null check (kind in ('visualizer_cart','planner_cart','planner_quotation')),
  request_key         text not null check (length(request_key) between 8 and 120),
  status              text not null default 'pending' check (status in ('pending','done','failed')),
  result              jsonb,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  unique (guest_session_id, kind, request_key)
);

-- ---------------------------------------------------------------------------
-- Scope enforcement: every row must belong to the same store as its session,
-- and rooms/items must belong to the project they reference.
-- ---------------------------------------------------------------------------
create or replace function app.house_project_scope() returns trigger
language plpgsql set search_path = '' as $$
declare
  session_store uuid;
  parent_store uuid;
  parent_project uuid;
  variant_store uuid;
  variant_active boolean;
  room_count integer;
  project_count integer;
begin
  if tg_table_name = 'house_projects' then
    select gs.store_id into session_store from public.guest_sessions gs
      where gs.id = new.guest_session_id for update;
    if session_store is distinct from new.store_id then
      raise exception 'guest session does not belong to store' using errcode = '42501';
    end if;
    select count(*) into project_count from public.house_projects hp
      where hp.guest_session_id = new.guest_session_id and hp.id is distinct from new.id;
    if project_count >= 20 then
      raise exception 'project limit reached' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if tg_table_name = 'house_project_rooms' then
    select hp.store_id into parent_store from public.house_projects hp where hp.id = new.project_id;
    if parent_store is distinct from new.store_id then
      raise exception 'project does not belong to store' using errcode = '42501';
    end if;
    select count(*) into room_count from public.house_project_rooms r
      where r.project_id = new.project_id and r.id is distinct from new.id;
    if room_count >= 30 then
      raise exception 'room limit reached for project' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if tg_table_name = 'house_project_items' then
    select hp.store_id into parent_store from public.house_projects hp where hp.id = new.project_id;
    if parent_store is distinct from new.store_id then
      raise exception 'project does not belong to store' using errcode = '42501';
    end if;
    select pv.store_id, pv.is_active into variant_store, variant_active
      from public.product_variants pv where pv.id = new.variant_id;
    if variant_store is distinct from new.store_id or not coalesce(variant_active, false) then
      raise exception 'variant is not an active product of this store' using errcode = '42501';
    end if;
    if new.room_id is not null then
      select r.project_id into parent_project from public.house_project_rooms r where r.id = new.room_id;
      if parent_project is distinct from new.project_id then
        raise exception 'room does not belong to project' using errcode = '42501';
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  return new;
end;
$$;

create trigger house_projects_scope before insert or update on house_projects
  for each row execute function app.house_project_scope();
create trigger house_project_rooms_scope before insert or update on house_project_rooms
  for each row execute function app.house_project_scope();
create trigger house_project_items_scope before insert or update on house_project_items
  for each row execute function app.house_project_scope();

-- RLS on, no client grants: all access goes through server-side services.
alter table house_projects enable row level security;
alter table house_project_rooms enable row level security;
alter table house_project_items enable row level security;
alter table guest_request_keys enable row level security;

revoke all on house_projects, house_project_rooms, house_project_items, guest_request_keys
  from anon, authenticated;
