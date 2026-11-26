-- Private guest photographs: refund supporting photos and room photographs.
-- Ownership is checked in the database: each row is tied to the guest session that created it, and every
-- function requires that session to be unexpired and to match. Store membership alone is not enough.

create table refund_request_photos (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id) on delete cascade,
  refund_request_id  uuid not null references refund_requests(id) on delete cascade,
  guest_session_id   uuid not null references guest_sessions(id) on delete cascade,
  upload_id          uuid not null unique references storage_uploads(id) on delete cascade,
  created_at         timestamptz not null default now()
);
create index refund_request_photos_request_idx on refund_request_photos(refund_request_id);

create table guest_room_photos (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id) on delete cascade,
  guest_session_id   uuid not null references guest_sessions(id) on delete cascade,
  upload_id          uuid not null unique references storage_uploads(id) on delete cascade,
  label              text not null default '' check (length(label) <= 80),
  created_at         timestamptz not null default now()
);
create index guest_room_photos_session_idx on guest_room_photos(guest_session_id);

alter table refund_request_photos enable row level security;
alter table guest_room_photos enable row level security;
revoke all on refund_request_photos, guest_room_photos from anon, authenticated;

-- Attach a refund photo. The guest session must own the request, and the request must still be open.
create or replace function refund_photo_attach(p_store uuid, p_session uuid, p_request uuid, p_upload uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare st text; u storage_uploads%rowtype; n int; img uuid;
begin
  if not exists (select 1 from guest_sessions where id = p_session and store_id = p_store and expires_at > now()) then
    raise exception 'guest session not valid' using errcode = 'P0002';
  end if;
  select rr.status into st from refund_requests rr
  where rr.id = p_request and rr.store_id = p_store and rr.guest_session_id = p_session for update;
  if not found then raise exception 'refund request not found for this guest' using errcode = 'P0002'; end if;
  if st <> 'submitted' then raise exception 'photos can only change while the request is open' using errcode = '22023'; end if;
  select * into u from storage_uploads where id = p_upload and store_id = p_store and kind = 'refund_photo' for update;
  if not found then raise exception 'upload not found for this store' using errcode = 'P0002'; end if;
  if u.claimed then raise exception 'upload is already attached' using errcode = '23505'; end if;
  select count(*) into n from refund_request_photos where refund_request_id = p_request;
  if n >= 4 then raise exception 'a request can have at most 4 photographs' using errcode = '23514'; end if;
  insert into refund_request_photos (store_id, refund_request_id, guest_session_id, upload_id)
  values (p_store, p_request, p_session, p_upload) returning id into img;
  update storage_uploads set claimed = true where id = p_upload;
  return img;
end $$;

-- Remove a refund photo while the request is open. The object is released and the caller removes it.
create or replace function refund_photo_remove(p_store uuid, p_session uuid, p_photo uuid)
returns table (removed_bucket text, removed_path text)
language plpgsql security definer set search_path = public as $$
declare rp refund_request_photos%rowtype; st text; b text; pth text;
begin
  select * into rp from refund_request_photos
  where id = p_photo and store_id = p_store and guest_session_id = p_session for update;
  if not found then raise exception 'photograph not found for this guest' using errcode = 'P0002'; end if;
  select rr.status into st from refund_requests rr where rr.id = rp.refund_request_id;
  if st <> 'submitted' then raise exception 'photos can only change while the request is open' using errcode = '22023'; end if;
  delete from refund_request_photos where id = rp.id;
  update storage_uploads set claimed = false where id = rp.upload_id returning bucket_id, object_path into b, pth;
  return query select b, pth;
end $$;

-- Attach a room photograph. A guest session may keep at most six.
create or replace function room_photo_attach(p_store uuid, p_session uuid, p_upload uuid, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare u storage_uploads%rowtype; n int; img uuid;
begin
  if not exists (select 1 from guest_sessions where id = p_session and store_id = p_store and expires_at > now()) then
    raise exception 'guest session not valid' using errcode = 'P0002';
  end if;
  select * into u from storage_uploads where id = p_upload and store_id = p_store and kind = 'room_photo' for update;
  if not found then raise exception 'upload not found for this store' using errcode = 'P0002'; end if;
  if u.claimed then raise exception 'upload is already attached' using errcode = '23505'; end if;
  select count(*) into n from guest_room_photos where guest_session_id = p_session;
  if n >= 6 then raise exception 'a guest can keep at most 6 room photographs' using errcode = '23514'; end if;
  insert into guest_room_photos (store_id, guest_session_id, upload_id, label)
  values (p_store, p_session, p_upload, left(coalesce(p_label, ''), 80)) returning id into img;
  update storage_uploads set claimed = true where id = p_upload;
  return img;
end $$;

create or replace function room_photo_remove(p_store uuid, p_session uuid, p_photo uuid)
returns table (removed_bucket text, removed_path text)
language plpgsql security definer set search_path = public as $$
declare rp guest_room_photos%rowtype; b text; pth text;
begin
  select * into rp from guest_room_photos
  where id = p_photo and store_id = p_store and guest_session_id = p_session for update;
  if not found then raise exception 'photograph not found for this guest' using errcode = 'P0002'; end if;
  delete from guest_room_photos where id = rp.id;
  update storage_uploads set claimed = false where id = rp.upload_id returning bucket_id, object_path into b, pth;
  return query select b, pth;
end $$;

revoke execute on function refund_photo_attach(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function refund_photo_remove(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function room_photo_attach(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function room_photo_remove(uuid, uuid, uuid) from public, anon, authenticated;
