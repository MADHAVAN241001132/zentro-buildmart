-- 0028_idempotency_leases.sql
-- Fenced, lease-based idempotency for planner and visualizer requests, per-line step records for
-- cart additions, and a keyed quotation wrapper so a reclaimed request cannot create a second quotation.

alter table guest_request_keys
  add column if not exists attempt integer not null default 1 check (attempt >= 1),
  add column if not exists lease_expires_at timestamptz;

-- A pending claim without a lease (written before this migration) is treated as expired.
update guest_request_keys set lease_expires_at = created_at where status = 'pending' and lease_expires_at is null;

-- One row per cart line of a keyed request. 'started' with no 'done' means the outcome is uncertain
-- and is never retried automatically, so an interrupted request cannot add the same line twice.
create table if not exists guest_request_steps (
  request_id   uuid not null references guest_request_keys(id) on delete cascade,
  step_index   integer not null check (step_index >= 0 and step_index < 200),
  status       text not null check (status in ('started','done','failed')),
  variant_id   uuid not null references product_variants(id) on delete cascade,
  quantity     integer not null check (quantity > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (request_id, step_index)
);
alter table guest_request_steps enable row level security;
revoke all on guest_request_steps from anon, authenticated;

alter table quotations add column if not exists guest_request_key text
  check (guest_request_key is null or length(guest_request_key) between 8 and 120);
create unique index if not exists quotations_guest_request_key_idx
  on quotations (store_id, guest_request_key) where guest_request_key is not null;

-- Creates a guest quotation at most once per (store, request key). Concurrent calls with the same key
-- are serialised by an advisory transaction lock, so the second call returns the first quotation.
create or replace function public.planner_quotation_request(
  p_store uuid, p_guest_session uuid, p_payload jsonb, p_request_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_existing record;
  v_id uuid;
begin
  if p_request_key is null or length(p_request_key) < 8 then
    raise exception 'request key is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store::text || ':' || p_request_key, 0));

  select q.id, q.guest_session_id into v_existing
    from quotations q
   where q.store_id = p_store and q.guest_request_key = p_request_key;
  if found then
    if v_existing.guest_session_id is distinct from p_guest_session then
      raise exception 'quotation belongs to another guest session' using errcode = '42501';
    end if;
    return v_existing.id;
  end if;

  v_id := public.quotation_guest_request(p_store, p_guest_session, p_payload);
  update quotations set guest_request_key = p_request_key where id = v_id;
  return v_id;
end;
$$;

revoke execute on function public.planner_quotation_request(uuid, uuid, jsonb, text) from public, anon, authenticated;
