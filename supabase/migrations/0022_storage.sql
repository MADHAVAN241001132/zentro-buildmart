-- Supabase Storage: buckets, tenant policies, an upload registry and atomic product-image functions.
-- Object paths always begin with the store id: "<store_id>/<folder>/<uuid>.<ext>".
-- Catalogue and branding images are public. Customer photographs are private and are read through signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('catalogue-images', 'catalogue-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('store-branding', 'store-branding', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('private-photos', 'private-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The store id in the first folder of an object path, or null when the path is not tenant-shaped.
create or replace function app.storage_store_id(p_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[1])::uuid end
$$;

-- Public read for catalogue and branding buckets. Private photographs have no client read policy.
create policy storage_public_images_read on storage.objects for select to anon, authenticated
  using (bucket_id in ('catalogue-images', 'store-branding'));

-- Catalogue images: store staff manage files under their own store folder only.
create policy storage_catalogue_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogue-images' and app.is_store_member(app.storage_store_id(name)));
create policy storage_catalogue_update on storage.objects for update to authenticated
  using (bucket_id = 'catalogue-images' and app.is_store_member(app.storage_store_id(name)))
  with check (bucket_id = 'catalogue-images' and app.is_store_member(app.storage_store_id(name)));
create policy storage_catalogue_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalogue-images' and app.is_store_member(app.storage_store_id(name)));

-- Logos and banners: owners and managers only.
create policy storage_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'store-branding' and app.is_store_member(app.storage_store_id(name), array['owner','manager']));
create policy storage_branding_update on storage.objects for update to authenticated
  using (bucket_id = 'store-branding' and app.is_store_member(app.storage_store_id(name), array['owner','manager']))
  with check (bucket_id = 'store-branding' and app.is_store_member(app.storage_store_id(name), array['owner','manager']));
create policy storage_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'store-branding' and app.is_store_member(app.storage_store_id(name), array['owner','manager']));

-- Private photographs: store members can read and remove their store's files. Guests upload through the
-- server with the service role after checking the guest session, so no guest policy exists here.
create policy storage_private_member_read on storage.objects for select to authenticated
  using (bucket_id = 'private-photos' and app.is_store_member(app.storage_store_id(name)));
create policy storage_private_member_delete on storage.objects for delete to authenticated
  using (bucket_id = 'private-photos' and app.is_store_member(app.storage_store_id(name), array['owner','manager']));

-- Registry of every uploaded object. Claimed objects are in use; unclaimed ones are candidates for cleanup.
create table storage_uploads (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  bucket_id    text not null references storage.buckets(id),
  object_path  text not null,
  kind         text not null check (kind in ('product','category','brand','logo','banner','refund_photo','room_photo')),
  mime_type    text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes   integer not null check (size_bytes > 0),
  uploaded_by  uuid references profiles(id),
  claimed      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (bucket_id, object_path),
  check (object_path like store_id::text || '/%'),
  check ((kind in ('product','category','brand') and bucket_id = 'catalogue-images')
      or (kind in ('logo','banner') and bucket_id = 'store-branding')
      or (kind in ('refund_photo','room_photo') and bucket_id = 'private-photos'))
);
create index storage_uploads_unclaimed_idx on storage_uploads(created_at) where claimed = false;
alter table storage_uploads enable row level security;
create policy storage_uploads_manager_read on storage_uploads for select to authenticated
  using (app.is_store_member(store_id, array['owner','manager']) or app.is_platform_admin());

-- Category, brand and store images record their storage path beside the public URL.
alter table categories add column if not exists image_path text;
alter table brands add column if not exists logo_path text;
alter table stores add column if not exists logo_path text;
alter table stores add column if not exists banner_url text;
alter table stores add column if not exists banner_path text;

alter table product_images add column if not exists storage_bucket text;
-- One primary image per product, enforced by the database.
create unique index if not exists product_images_one_primary on product_images(product_id) where is_primary;

-- Attach an uploaded product image. The public URL must be the real object URL for that upload.
create or replace function product_image_attach(p_store uuid, p_product uuid, p_upload uuid, p_alt text, p_public_url text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  u storage_uploads%rowtype;
  n int; next_sort int; img uuid;
begin
  if not exists (select 1 from products where id = p_product and store_id = p_store) then
    raise exception 'product not found in this store' using errcode = 'P0002';
  end if;
  select * into u from storage_uploads where id = p_upload and store_id = p_store and kind = 'product' for update;
  if not found then raise exception 'upload not found for this store' using errcode = 'P0002'; end if;
  if u.claimed then raise exception 'upload is already attached' using errcode = '23505'; end if;
  if p_public_url is null or p_public_url not like '%/storage/v1/object/public/' || u.bucket_id || '/' || u.object_path then
    raise exception 'public URL does not match the upload' using errcode = '22023';
  end if;
  select count(*), coalesce(max(sort_order) + 1, 0) into n, next_sort from product_images where product_id = p_product;
  if n >= 8 then raise exception 'a product can have at most 8 images' using errcode = '23514'; end if;
  insert into product_images (store_id, product_id, storage_path, storage_bucket, public_url, alt_text, sort_order, is_primary)
  values (p_store, p_product, u.object_path, u.bucket_id, p_public_url, coalesce(p_alt, ''), next_sort, n = 0)
  returning id into img;
  update storage_uploads set claimed = true where id = u.id;
  return img;
end $$;

-- Make one image the only primary image of its product.
create or replace function product_image_set_primary(p_store uuid, p_product uuid, p_image uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from product_images where id = p_image and product_id = p_product and store_id = p_store) then
    raise exception 'image not found for this product' using errcode = 'P0002';
  end if;
  update product_images set is_primary = false where product_id = p_product and is_primary and id <> p_image;
  update product_images set is_primary = true where id = p_image and not is_primary;
end $$;

-- Set the display order. The list must name every image of the product exactly once.
create or replace function product_image_reorder(p_store uuid, p_product uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare total int;
begin
  select count(*) into total from product_images where product_id = p_product and store_id = p_store;
  if total <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'the order must list every image of the product' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_ids) x) <> total then
    raise exception 'the order lists an image twice' using errcode = '22023';
  end if;
  update product_images pi set sort_order = o.pos
  from (select x as id, (ord - 1)::int as pos from unnest(p_ids) with ordinality as t(x, ord)) o
  where pi.id = o.id and pi.product_id = p_product and pi.store_id = p_store;
end $$;

-- Delete an image, renumber the rest, promote a new primary if needed, and return the object to remove.
create or replace function product_image_delete(p_store uuid, p_image uuid)
returns table (removed_bucket text, removed_path text)
language plpgsql security definer set search_path = public as $$
declare v_product uuid; v_primary boolean; v_bucket text; v_path text;
begin
  select pi.product_id, pi.is_primary, pi.storage_bucket, pi.storage_path
    into v_product, v_primary, v_bucket, v_path
  from product_images pi where pi.id = p_image and pi.store_id = p_store for update;
  if not found then raise exception 'image not found in this store' using errcode = 'P0002'; end if;
  delete from product_images where id = p_image;
  with r as (
    select id, row_number() over (order by sort_order, created_at, id) - 1 as pos
    from product_images where product_id = v_product
  )
  update product_images pi set sort_order = r.pos from r where pi.id = r.id;
  if v_primary then
    update product_images set is_primary = true
    where id = (select id from product_images where product_id = v_product order by sort_order limit 1);
  end if;
  delete from storage_uploads where store_id = p_store and bucket_id = v_bucket and object_path = v_path;
  return query select v_bucket, v_path;
end $$;

-- Unclaimed uploads older than the cut-off. The service removes these objects and then their rows.
create or replace function storage_orphan_candidates(p_before timestamptz, p_limit int)
returns table (upload_id uuid, bucket_id text, object_path text)
language sql stable set search_path = public as $$
  select id, bucket_id, object_path from storage_uploads
  where claimed = false and created_at < p_before
  order by created_at
  limit least(greatest(p_limit, 1), 500);
$$;

-- Set or clear a category, brand or store image. Returns the object path to record.
create or replace function storage_claim_upload(p_store uuid, p_upload uuid, p_kind text, p_public_url text)
returns text language plpgsql security definer set search_path = public as $$
declare u storage_uploads%rowtype;
begin
  select * into u from storage_uploads where id = p_upload and store_id = p_store and kind = p_kind for update;
  if not found then raise exception 'upload not found for this store and kind' using errcode = 'P0002'; end if;
  if u.claimed then raise exception 'upload is already in use' using errcode = '23505'; end if;
  if p_public_url is null or p_public_url not like '%/storage/v1/object/public/' || u.bucket_id || '/' || u.object_path then
    raise exception 'public URL does not match the upload' using errcode = '22023';
  end if;
  update storage_uploads set claimed = true where id = u.id;
  return u.object_path;
end $$;

-- Mark an object as no longer in use, so cleanup can remove it later.
create or replace function storage_release_object(p_store uuid, p_bucket text, p_path text)
returns void language sql security definer set search_path = public as $$
  update storage_uploads set claimed = false
  where store_id = p_store and bucket_id = p_bucket and object_path = p_path;
$$;

revoke execute on function app.storage_store_id(text) from public, anon, authenticated;
revoke execute on function product_image_attach(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function product_image_set_primary(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function product_image_reorder(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function product_image_delete(uuid, uuid) from public, anon, authenticated;
revoke execute on function storage_orphan_candidates(timestamptz, int) from public, anon, authenticated;
revoke execute on function storage_claim_upload(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function storage_release_object(uuid, text, text) from public, anon, authenticated;
