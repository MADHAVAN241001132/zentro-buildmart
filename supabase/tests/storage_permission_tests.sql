-- Storage access follows store permissions (rolled back). SP1-SP4, as the authenticated role.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(p_user uuid) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user::text)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;
do $$
declare
  tag text := substr(gen_random_uuid()::text, 1, 6);
  today date := app.ist_today();
  store_a uuid; photo_name text; n integer; msg text;
  oa uuid := gen_random_uuid(); s_ord uuid := gen_random_uuid(); s_prod uuid := gen_random_uuid(); s_ref uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (oa, 'sp-oa-' || tag || '@example.test'), (s_ord, 'sp-so-' || tag || '@example.test'),
    (s_prod, 'sp-pr-' || tag || '@example.test'), (s_ref, 'sp-rf-' || tag || '@example.test');
  insert into profiles (id, full_name) values (oa, 'Owner'), (s_ord, 'Orders'), (s_prod, 'Products'), (s_ref, 'Refunds')
    on conflict (id) do nothing;
  insert into stores (slug, name, status) values ('sp-a-' || tag, 'Storage A', 'active') returning id into store_a;
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_a, today + 5, 'storage test');
  insert into store_owners (store_id, profile_id, role) values
    (store_a, oa, 'owner'), (store_a, s_ord, 'staff'), (store_a, s_prod, 'staff'), (store_a, s_ref, 'staff');

  -- Fixtures are inserted as the superuser session, so storage policies do not apply here.
  photo_name := store_a::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
    values (store_a, 'private-photos', photo_name, 'refund_photo', 'image/jpeg', 1000);
  insert into storage.objects (bucket_id, name) values ('private-photos', photo_name);

  perform pg_temp.as_user(oa);
  perform zb_set_store_member_access(store_a, s_ord, 'staff', array['order_management']);
  perform zb_set_store_member_access(store_a, s_prod, 'staff', array['product_management']);
  perform zb_set_store_member_access(store_a, s_ref, 'staff', array['refund_management']);

  -- SP1: order management alone cannot add catalogue images.
  perform pg_temp.as_user(s_ord);
  msg := null;
  begin
    insert into storage.objects (bucket_id, name) values ('catalogue-images', store_a::text || '/cat-' || tag || '.jpg');
    raise exception 'SP1 failed: order-only staff uploaded a catalogue image';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'SP1 ok: order management alone cannot add catalogue images';

  -- SP2: product management can add catalogue images.
  perform pg_temp.as_user(s_prod);
  insert into storage.objects (bucket_id, name) values ('catalogue-images', store_a::text || '/cat-' || tag || '.jpg');
  raise notice 'SP2 ok: product management adds catalogue images';

  -- SP3: order-only staff cannot see the private refund photograph.
  perform pg_temp.as_user(s_ord);
  select count(*) into n from storage.objects where bucket_id = 'private-photos' and name = photo_name;
  if n <> 0 then raise exception 'SP3 failed: order-only staff can see a refund photograph (% rows)', n; end if;
  raise notice 'SP3 ok: refund photographs are hidden without refund management';

  -- SP4: refund management can see it.
  perform pg_temp.as_user(s_ref);
  select count(*) into n from storage.objects where bucket_id = 'private-photos' and name = photo_name;
  if n <> 1 then raise exception 'SP4 failed: refund-management staff see % rows, expected 1', n; end if;
  raise notice 'SP4 ok: refund management reads refund photographs';
end $$;
rollback;
