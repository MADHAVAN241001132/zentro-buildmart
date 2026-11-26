-- Storage tests (rolled back). S1-S10.
\set ON_ERROR_STOP on
begin;
do $$
declare
  s uuid; p uuid; other uuid := gen_random_uuid();
  u1 uuid; u2 uuid; u3 uuid; i1 uuid; i2 uuid; i3 uuid; v record; n int; ids uuid[];
  url1 text; url2 text;
begin
  select pr.store_id, pr.id into s, p from products pr order by pr.id limit 1;
  if s is null then raise exception 'S0 needs a seeded product'; end if;

  -- S1 buckets: catalogue and branding public, private photographs private.
  if not exists (select 1 from storage.buckets where id = 'catalogue-images' and public) then raise exception 'S1 catalogue bucket not public'; end if;
  if not exists (select 1 from storage.buckets where id = 'store-branding' and public) then raise exception 'S1 branding bucket not public'; end if;
  if exists (select 1 from storage.buckets where id = 'private-photos' and public) then raise exception 'S1 private bucket is public'; end if;
  raise notice 'S1 ok: bucket visibility';

  -- S2 tenant path parsing.
  if app.storage_store_id(s::text || '/products/x.jpg') <> s then raise exception 'S2 valid path not parsed'; end if;
  if app.storage_store_id('not-a-store/products/x.jpg') is not null then raise exception 'S2 bad folder accepted'; end if;
  if app.storage_store_id('x.jpg') is not null then raise exception 'S2 root object accepted'; end if;
  raise notice 'S2 ok: tenant path parsing';

  -- S3 storage policies exist for every bucket class.
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects';
  if n < 9 then raise exception 'S3 expected storage policies, found %', n; end if;
  raise notice 'S3 ok: % storage policies', n;

  -- S4 uploads: registry rows, and the bucket and kind check rejects a mismatch.
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
    values (s, 'catalogue-images', s::text || '/products/a.jpg', 'product', 'image/jpeg', 100) returning id into u1;
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
    values (s, 'catalogue-images', s::text || '/products/b.jpg', 'product', 'image/png', 100) returning id into u2;
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
    values (s, 'catalogue-images', s::text || '/products/c.jpg', 'product', 'image/webp', 100) returning id into u3;
  begin
    insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
      values (s, 'catalogue-images', s::text || '/room/x.jpg', 'room_photo', 'image/jpeg', 100);
    raise exception 'S4 bucket and kind mismatch accepted';
  exception when check_violation then null;
  end;
  raise notice 'S4 ok: uploads registered and kind-bucket check enforced';

  url1 := 'https://example.supabase.co/storage/v1/object/public/catalogue-images/' || s::text || '/products/a.jpg';
  url2 := 'https://example.supabase.co/storage/v1/object/public/catalogue-images/' || s::text || '/products/b.jpg';

  -- S5 attach: first image becomes primary; a second image is not; a reused upload is refused.
  i1 := product_image_attach(s, p, u1, 'Front', url1);
  i2 := product_image_attach(s, p, u2, 'Side', url2);
  if not (select is_primary from product_images where id = i1) then raise exception 'S5 first image not primary'; end if;
  if (select is_primary from product_images where id = i2) then raise exception 'S5 second image primary'; end if;
  begin
    perform product_image_attach(s, p, u1, 'Again', url1);
    raise exception 'S5 reused upload accepted';
  exception when unique_violation then null;
  end;
  raise notice 'S5 ok: attach, primary and reuse refusal';

  -- S6 public URL must be the real object URL for the upload.
  begin
    perform product_image_attach(s, p, u3, 'Bad', 'https://evil.example/fake.jpg');
    raise exception 'S6 fabricated URL accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'S6 ok: fabricated URLs refused';

  -- S7 primary selection keeps exactly one primary; another store cannot change this product.
  perform product_image_set_primary(s, p, i2);
  select count(*) into n from product_images where product_id = p and is_primary;
  if n <> 1 or not (select is_primary from product_images where id = i2) then raise exception 'S7 primary not unique'; end if;
  begin
    perform product_image_set_primary(other, p, i1);
    raise exception 'S7 cross-store change accepted';
  exception when no_data_found then null;
  end;
  raise notice 'S7 ok: single primary and tenant check';

  -- S8 reorder requires every image exactly once.
  perform product_image_reorder(s, p, array[i2, i1]);
  if (select sort_order from product_images where id = i2) <> 0 then raise exception 'S8 reorder failed'; end if;
  begin
    perform product_image_reorder(s, p, array[i2]);
    raise exception 'S8 partial order accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'S8 ok: reorder rules';

  -- S9 delete renumbers and promotes a new primary when the primary is removed.
  select * into v from product_image_delete(s, i2);
  if v.removed_path <> s::text || '/products/b.jpg' then raise exception 'S9 wrong object returned'; end if;
  if not (select is_primary from product_images where id = i1) then raise exception 'S9 no new primary'; end if;
  if (select sort_order from product_images where id = i1) <> 0 then raise exception 'S9 not renumbered'; end if;
  raise notice 'S9 ok: delete, renumber and promote';

  -- S10 orphan candidates: old unclaimed rows only; privileges are service-only.
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes, created_at)
    values (s, 'catalogue-images', s::text || '/products/old.jpg', 'product', 'image/jpeg', 100, now() - interval '3 days');
  select count(*) into n from storage_orphan_candidates(now() - interval '1 day', 100) where object_path = s::text || '/products/old.jpg';
  if n <> 1 then raise exception 'S10 old orphan not listed'; end if;
  select count(*) into n from storage_orphan_candidates(now() - interval '1 day', 100) where object_path = s::text || '/products/c.jpg';
  if n <> 0 then raise exception 'S10 fresh unclaimed upload listed'; end if;
  if has_function_privilege('anon', 'product_image_attach(uuid,uuid,uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'product_image_attach(uuid,uuid,uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'storage_orphan_candidates(timestamptz,int)', 'execute') then
    raise exception 'S10 client role can execute image functions';
  end if;
  raise notice 'S10 ok: orphan candidates and service-only privileges';
end $$;

-- S11 claim rules for category, brand and store images.
do $$
declare s uuid; u uuid; path text; url text; n int;
begin
  select pr.store_id into s from products pr order by pr.id limit 1;
  insert into storage_uploads (store_id, bucket_id, object_path, kind, mime_type, size_bytes)
    values (s, 'catalogue-images', s::text || '/categories/cat.jpg', 'category', 'image/jpeg', 100) returning id into u;
  url := 'https://example.supabase.co/storage/v1/object/public/catalogue-images/' || s::text || '/categories/cat.jpg';
  begin
    perform storage_claim_upload(s, u, 'brand', url);
    raise exception 'S11 wrong kind accepted';
  exception when no_data_found then null;
  end;
  begin
    perform storage_claim_upload(s, u, 'category', 'https://evil.example/x.jpg');
    raise exception 'S11 fabricated URL accepted';
  exception when invalid_parameter_value then null;
  end;
  path := storage_claim_upload(s, u, 'category', url);
  if path <> s::text || '/categories/cat.jpg' then raise exception 'S11 wrong path returned'; end if;
  begin
    perform storage_claim_upload(s, u, 'category', url);
    raise exception 'S11 reclaim accepted';
  exception when unique_violation then null;
  end;
  perform storage_release_object(s, 'catalogue-images', path);
  select count(*) into n from storage_uploads where id = u and claimed = false;
  if n <> 1 then raise exception 'S11 release did not unclaim'; end if;
  raise notice 'S11 ok: category claim, kind, URL and release rules';
end $$;
rollback;
