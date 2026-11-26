-- 0042: storage object access follows store permissions.
-- Catalogue images need product or category management; logos and banners need store settings;
-- private photographs need the permission that owns their kind (refund photos: refund management,
-- room photos: customer management). Ownership is read from storage_uploads through a definer helper,
-- because storage_uploads itself is readable only by owners and managers.

create or replace function app.private_photo_permitted(p_bucket text, p_name text)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from storage_uploads su
    where su.bucket_id = p_bucket and su.object_path = p_name
      and ((su.kind = 'refund_photo' and app.store_perm_any(su.store_id, array['refund_management']))
        or (su.kind = 'room_photo' and app.store_perm_any(su.store_id, array['customer_management'])))
  );
$$;
revoke all on function app.private_photo_permitted(text, text) from public, anon;
grant execute on function app.private_photo_permitted(text, text) to authenticated, service_role;

drop policy if exists storage_catalogue_insert on storage.objects;
drop policy if exists storage_catalogue_update on storage.objects;
drop policy if exists storage_catalogue_delete on storage.objects;
create policy storage_catalogue_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogue-images'
    and app.store_perm_any(app.storage_store_id(name), array['product_management','category_brand_management']));
create policy storage_catalogue_update on storage.objects for update to authenticated
  using (bucket_id = 'catalogue-images'
    and app.store_perm_any(app.storage_store_id(name), array['product_management','category_brand_management']))
  with check (bucket_id = 'catalogue-images'
    and app.store_perm_any(app.storage_store_id(name), array['product_management','category_brand_management']));
create policy storage_catalogue_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalogue-images'
    and app.store_perm_any(app.storage_store_id(name), array['product_management','category_brand_management']));

drop policy if exists storage_branding_insert on storage.objects;
drop policy if exists storage_branding_update on storage.objects;
drop policy if exists storage_branding_delete on storage.objects;
create policy storage_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'store-branding' and app.store_perm_any(app.storage_store_id(name), array['store_settings']));
create policy storage_branding_update on storage.objects for update to authenticated
  using (bucket_id = 'store-branding' and app.store_perm_any(app.storage_store_id(name), array['store_settings']))
  with check (bucket_id = 'store-branding' and app.store_perm_any(app.storage_store_id(name), array['store_settings']));
create policy storage_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'store-branding' and app.store_perm_any(app.storage_store_id(name), array['store_settings']));

drop policy if exists storage_private_member_read on storage.objects;
drop policy if exists storage_private_member_delete on storage.objects;
create policy storage_private_permission_read on storage.objects for select to authenticated
  using (bucket_id = 'private-photos' and app.private_photo_permitted(bucket_id, name));
create policy storage_private_permission_delete on storage.objects for delete to authenticated
  using (bucket_id = 'private-photos' and app.private_photo_permitted(bucket_id, name));

-- The storage policies call this pure path parser. It was not executable by the authenticated role,
-- so every catalogue and branding write was refused before the permission check could run.
grant execute on function app.storage_store_id(text) to authenticated, service_role;
