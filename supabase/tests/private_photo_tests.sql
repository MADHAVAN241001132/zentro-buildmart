-- Private guest photograph tests (rolled back). P1-P10.
\set ON_ERROR_STOP on
begin;
do $$
declare
  s uuid; ord uuid; sess1 uuid; sess2 uuid; req uuid; u uuid; ua uuid; ub uuid; ur uuid; ruleft uuid;
  p1 uuid; p2 uuid; rp record; n int; i int; tmp uuid;
  h text := encode(sha256(convert_to('x','UTF8')), 'hex');
begin
  select o.store_id, o.id into s, ord from orders o
  where not exists (select 1 from refund_requests rr where rr.order_id = o.id) order by o.id limit 1;
  if s is null then raise exception 'P0 needs a seeded order without a refund request'; end if;

  insert into guest_sessions (store_id, token_hash, expires_at)
    values (s, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), now() + interval '1 day') returning id into sess1;
  insert into guest_sessions (store_id, token_hash, expires_at)
    values (s, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), now() + interval '1 day') returning id into sess2;
  insert into refund_requests (store_id, order_id, guest_session_id, reason_code, reason)
    values (s, ord, sess1, 'damaged', 'Photograph test') returning id into req;

  -- Five refund uploads, one room upload, and one upload of the wrong kind.
  for i in 1..5 loop
    insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
      values (s, 'private-photos', s::text || '/refund-photos/r' || i || '.jpg', 'refund_photo', 'image/jpeg', 100) returning id into tmp;
    if i = 1 then ua := tmp; elsif i = 2 then ub := tmp; elsif i = 3 then u := tmp; end if;
    if i = 4 then ur := tmp; end if;
    if i = 5 then ruleft := tmp; end if;
  end loop;
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
    values (s, 'private-photos', s::text || '/room-photos/room.jpg', 'room_photo', 'image/jpeg', 100) returning id into tmp;
  -- tmp now holds the room upload

  -- P1 the owning session attaches a photograph.
  p1 := refund_photo_attach(s, sess1, req, ua);
  if p1 is null then raise exception 'P1 attach failed'; end if;
  raise notice 'P1 ok: owning guest attaches a refund photograph';

  -- P2 another guest session cannot attach to this request.
  begin
    perform refund_photo_attach(s, sess2, req, ub);
    raise exception 'P2 other guest attached';
  exception when no_data_found then null;
  end;
  raise notice 'P2 ok: other guest refused';

  -- P3 at most four photographs per request.
  perform refund_photo_attach(s, sess1, req, ub);
  perform refund_photo_attach(s, sess1, req, u);
  perform refund_photo_attach(s, sess1, req, ur);
  begin
    perform refund_photo_attach(s, sess1, req, ruleft);
    raise exception 'P3 fifth photograph accepted';
  exception when check_violation then null;
  end;
  raise notice 'P3 ok: four photograph limit';

  -- P4 a room upload cannot be attached as a refund photograph.
  select count(*) into n from storage_uploads where store_id = s and kind = 'room_photo';
  if n < 1 then raise exception 'P4 setup'; end if;
  begin
    perform refund_photo_attach(s, sess1, req, (select id from storage_uploads where store_id = s and kind = 'room_photo' limit 1));
    raise exception 'P4 kind mismatch accepted';
  exception when no_data_found then null;
  end;
  raise notice 'P4 ok: upload kind enforced';

  -- P5 photographs cannot change once the store has decided.
  update refund_requests set status = 'rejected' where id = req;
  begin
    perform refund_photo_attach(s, sess1, req, (select id from storage_uploads where store_id = s and kind = 'refund_photo' and claimed = false and id <> ruleft limit 1));
    raise exception 'P5 attached to a decided request';
  exception when invalid_parameter_value then null;
  end;
  update refund_requests set status = 'submitted' where id = req;
  raise notice 'P5 ok: no changes after a decision';

  -- P6 removal is limited to the owning guest; the removed object is released.
  begin
    perform refund_photo_remove(s, sess2, p1);
    raise exception 'P6 other guest removed';
  exception when no_data_found then null;
  end;
  select * into rp from refund_photo_remove(s, sess1, p1);
  if rp.removed_path <> s::text || '/refund-photos/r1.jpg' then raise exception 'P6 wrong path released'; end if;
  select count(*) into n from storage_uploads where id = ua and claimed = false;
  if n <> 1 then raise exception 'P6 object not released'; end if;
  raise notice 'P6 ok: owner-only removal releases the object';

  -- P7 room photographs: session isolation and a limit of six.
  for i in 1..6 loop
    insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
      values (s, 'private-photos', s::text || '/room-photos/rm' || i || '.jpg', 'room_photo', 'image/png', 100) returning id into tmp;
    p2 := room_photo_attach(s, sess1, tmp, 'Hall ' || i);
  end loop;
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
    values (s, 'private-photos', s::text || '/room-photos/extra.jpg', 'room_photo', 'image/png', 100) returning id into tmp;
  begin
    perform room_photo_attach(s, sess1, tmp, 'Seventh');
    raise exception 'P7 seventh room photograph accepted';
  exception when check_violation then null;
  end;
  begin
    perform room_photo_remove(s, sess2, p2);
    raise exception 'P7 other guest removed a room photograph';
  exception when no_data_found then null;
  end;
  raise notice 'P7 ok: room photograph limit and isolation';

  -- P8 expired sessions cannot attach.
  update guest_sessions set expires_at = now() - interval '1 minute' where id = sess2;
  begin
    perform room_photo_attach(s, sess2, (select id from storage_uploads where store_id = s and claimed = false and kind = 'room_photo' limit 1), 'Late');
    raise exception 'P8 expired session accepted';
  exception when no_data_found then null;
  end;
  raise notice 'P8 ok: expired session refused';

  -- P9 the photograph tables have RLS on and no client privileges.
  if not (select relrowsecurity from pg_class where relname = 'guest_room_photos')
     or not (select relrowsecurity from pg_class where relname = 'refund_request_photos') then
    raise exception 'P9 RLS not enabled';
  end if;
  if has_table_privilege('anon', 'guest_room_photos', 'select') or has_table_privilege('authenticated', 'refund_request_photos', 'select') then
    raise exception 'P9 client role can read photograph tables';
  end if;
  raise notice 'P9 ok: RLS on, no client privileges';

  -- P10 the functions are service-only.
  if has_function_privilege('anon', 'refund_photo_attach(uuid,uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'room_photo_attach(uuid,uuid,uuid,text)', 'execute') then
    raise exception 'P10 client role can execute photograph functions';
  end if;
  raise notice 'P10 ok: service-only functions';
end $$;
rollback;
