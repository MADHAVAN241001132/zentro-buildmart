-- 0024: bulk catalogue import and price updates.
--
-- A preview is validated by the server and staged in product_import_batches. Confirming calls product_import_apply,
-- which applies every staged row inside one database transaction (a function call is atomic). If any row fails,
-- nothing from that batch is kept and the batch stays open, so it can be confirmed again. An applied batch returns
-- its stored summary without changing anything, so a repeated confirm never duplicates products.
--
-- Stock: new variants start with an 'opening' stock movement, the same record create_inventory_batch writes.
-- Existing variants never have their stock changed by an import.

-- ---------------------------------------------------------------------------
-- Batches
-- ---------------------------------------------------------------------------

create table product_import_batches (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  actor_id      uuid references profiles(id) on delete set null,
  kind          text not null check (kind in ('catalogue','prices')),
  mode          text not null check (mode in ('skip','update')),
  file_name     text not null check (length(file_name) between 1 and 200),
  file_format   text not null check (file_format in ('csv','xlsx')),
  status        text not null default 'previewed' check (status in ('previewed','applied')),
  total_rows    integer not null default 0 check (total_rows >= 0),
  ready_rows    integer not null default 0 check (ready_rows >= 0),
  skipped_rows  integer not null default 0 check (skipped_rows >= 0),
  error_rows    integer not null default 0 check (error_rows >= 0),
  -- Per-row results for the preview and the error report. Readable by owners.
  row_results   jsonb not null default '[]'::jsonb,
  -- The validated change set. Written and read by the server only; no client role can see it.
  staged        jsonb not null default '[]'::jsonb,
  summary       jsonb,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz,
  check ((status = 'applied') = (applied_at is not null)),
  check (jsonb_typeof(row_results) = 'array'),
  check (jsonb_typeof(staged) = 'array')
);

create index product_import_batches_store_idx on product_import_batches (store_id, created_at desc);

alter table product_import_batches enable row level security;

create policy product_import_batches_read on product_import_batches
  for select to authenticated
  using (app.is_store_member(store_id, array['owner','manager']));

revoke all on product_import_batches from public, anon, authenticated;
grant select (id, store_id, kind, mode, file_name, file_format, status, total_rows, ready_rows,
              skipped_rows, error_rows, row_results, summary, created_at, applied_at)
  on product_import_batches to authenticated;

-- ---------------------------------------------------------------------------
-- Apply
-- ---------------------------------------------------------------------------

create or replace function product_import_apply(p_batch uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_batch product_import_batches%rowtype;
  v_actor uuid;
  v_item jsonb;
  v_var jsonb;
  v_product uuid;
  v_variant uuid;
  v_category uuid;
  v_brand uuid;
  v_stock bigint;
  v_old_product products%rowtype;
  v_old_variant product_variants%rowtype;
  v_products_created integer := 0;
  v_products_updated integer := 0;
  v_variants_created integer := 0;
  v_variants_updated integer := 0;
  v_prices_updated integer := 0;
  v_summary jsonb;
begin
  select * into v_batch from product_import_batches where id = p_batch for update;
  if not found then raise exception 'import not found' using errcode = 'P0002'; end if;

  -- Owner or manager of the batch's store only, whether called by the server or by a signed-in user.
  v_actor := app.assert_store_manager(v_batch.store_id, p_actor);

  if v_batch.status = 'applied' then
    return v_batch.summary;
  end if;
  if jsonb_array_length(v_batch.staged) = 0 then
    raise exception 'there are no valid rows to import' using errcode = 'P0001';
  end if;

  if v_batch.kind = 'prices' then
    for v_item in select value from jsonb_array_elements(v_batch.staged) loop
      select * into v_old_variant from product_variants
       where id = (v_item->>'variantId')::uuid and store_id = v_batch.store_id
       for update;
      if not found then
        raise exception 'variant % is no longer in this store', v_item->>'variantSku' using errcode = 'P0002';
      end if;
      update product_variants set
        sale_price_paise = (v_item->>'salePricePaise')::bigint,
        cost_price_paise = (v_item->>'costPricePaise')::bigint,
        mrp_paise = nullif(v_item->>'mrpPaise', '')::bigint,
        updated_at = now()
       where id = v_old_variant.id;
      insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
      values (v_batch.store_id, v_actor, 'shop_owner', 'catalogue.price_updated', 'product_variants', v_old_variant.id,
              jsonb_build_object('sale_price_paise', v_old_variant.sale_price_paise, 'cost_price_paise', v_old_variant.cost_price_paise, 'mrp_paise', v_old_variant.mrp_paise),
              jsonb_build_object('sale_price_paise', (v_item->>'salePricePaise')::bigint, 'cost_price_paise', (v_item->>'costPricePaise')::bigint, 'mrp_paise', nullif(v_item->>'mrpPaise', '')::bigint));
      v_prices_updated := v_prices_updated + 1;
    end loop;
  else
    for v_item in select value from jsonb_array_elements(v_batch.staged) loop
      if v_item->>'productAction' = 'create' then
        v_category := (v_item->'product'->>'categoryId')::uuid;
        v_brand := nullif(v_item->'product'->>'brandId', '')::uuid;
        if not exists (select 1 from categories where id = v_category and store_id = v_batch.store_id) then
          raise exception 'category is not in this store' using errcode = 'P0001';
        end if;
        if v_brand is not null and not exists (select 1 from brands where id = v_brand and store_id = v_batch.store_id) then
          raise exception 'brand is not in this store' using errcode = 'P0001';
        end if;
        insert into products (store_id, category_id, brand_id, sku, slug, name, description, material,
                              gst_rate_bps, unit_of_sale, status, visibility, archived_at)
        values (v_batch.store_id, v_category, v_brand, v_item->>'productSku', v_item->'product'->>'slug',
                v_item->'product'->>'name', nullif(v_item->'product'->>'description', ''),
                nullif(v_item->'product'->>'material', ''),
                (v_item->'product'->>'gstRateBps')::integer, v_item->'product'->>'unitOfSale',
                v_item->'product'->>'status', 'public',
                case when v_item->'product'->>'status' = 'archived' then now() end)
        returning id into v_product;
        v_products_created := v_products_created + 1;
        insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, after_state)
        values (v_batch.store_id, v_actor, 'shop_owner', 'catalogue.product_created', 'products', v_product,
                jsonb_build_object('sku', v_item->>'productSku', 'name', v_item->'product'->>'name'));

      elsif v_item->>'productAction' = 'update' then
        v_product := (v_item->>'productId')::uuid;
        select * into v_old_product from products where id = v_product and store_id = v_batch.store_id for update;
        if not found then raise exception 'product is no longer in this store' using errcode = 'P0002'; end if;
        v_category := (v_item->'product'->>'categoryId')::uuid;
        v_brand := nullif(v_item->'product'->>'brandId', '')::uuid;
        if not exists (select 1 from categories where id = v_category and store_id = v_batch.store_id) then
          raise exception 'category is not in this store' using errcode = 'P0001';
        end if;
        if v_brand is not null and not exists (select 1 from brands where id = v_brand and store_id = v_batch.store_id) then
          raise exception 'brand is not in this store' using errcode = 'P0001';
        end if;
        update products set
          category_id = v_category,
          brand_id = v_brand,
          name = v_item->'product'->>'name',
          description = nullif(v_item->'product'->>'description', ''),
          material = nullif(v_item->'product'->>'material', ''),
          gst_rate_bps = (v_item->'product'->>'gstRateBps')::integer,
          unit_of_sale = v_item->'product'->>'unitOfSale',
          status = v_item->'product'->>'status',
          archived_at = case when v_item->'product'->>'status' = 'archived' then coalesce(archived_at, now()) else null end,
          updated_at = now()
         where id = v_old_product.id;
        v_products_updated := v_products_updated + 1;
        insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
        values (v_batch.store_id, v_actor, 'shop_owner', 'catalogue.product_updated', 'products', v_old_product.id,
                jsonb_build_object('name', v_old_product.name, 'status', v_old_product.status, 'gst_rate_bps', v_old_product.gst_rate_bps),
                jsonb_build_object('name', v_item->'product'->>'name', 'status', v_item->'product'->>'status', 'gst_rate_bps', (v_item->'product'->>'gstRateBps')::integer));

      else
        -- Product unchanged; its new variants (if any) attach to it.
        v_product := (v_item->>'productId')::uuid;
        if not exists (select 1 from products where id = v_product and store_id = v_batch.store_id) then
          raise exception 'product is no longer in this store' using errcode = 'P0002';
        end if;
      end if;

      for v_var in select value from jsonb_array_elements(v_item->'variants') loop
        if v_var->>'variantAction' = 'create' then
          -- The variant insert trigger creates its inventory row with zero stock.
          insert into product_variants (store_id, product_id, sku, label, size_label, sale_price_paise, cost_price_paise,
                                        mrp_paise, price_unit, pieces_per_box, is_default, is_active)
          values (v_batch.store_id, v_product, v_var->>'sku', v_var->>'label', nullif(v_var->>'sizeLabel', ''),
                  (v_var->>'salePricePaise')::bigint, (v_var->>'costPricePaise')::bigint,
                  nullif(v_var->>'mrpPaise', '')::bigint, v_var->>'priceUnit', 1,
                  (v_var->>'isDefault')::boolean, true)
          returning id into v_variant;

          update inventory set reorder_level = (v_var->>'reorderLevel')::bigint, updated_at = now()
           where variant_id = v_variant and store_id = v_batch.store_id;

          v_stock := (v_var->>'openingStock')::bigint;
          if v_stock > 0 then
            update inventory set on_hand = on_hand + v_stock, updated_at = now() where variant_id = v_variant;
            insert into stock_movements (store_id, variant_id, movement_type, quantity, actor_id, note)
            values (v_batch.store_id, v_variant, 'opening', v_stock, v_actor, 'catalogue import ' || v_batch.file_name);
          end if;

          v_variants_created := v_variants_created + 1;
          insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, after_state)
          values (v_batch.store_id, v_actor, 'shop_owner', 'catalogue.variant_created', 'product_variants', v_variant,
                  jsonb_build_object('sku', v_var->>'sku', 'sale_price_paise', (v_var->>'salePricePaise')::bigint, 'opening_stock', v_stock));

        elsif v_var->>'variantAction' = 'update' then
          select * into v_old_variant from product_variants
           where id = (v_var->>'variantId')::uuid and store_id = v_batch.store_id for update;
          if not found then raise exception 'variant is no longer in this store' using errcode = 'P0002'; end if;
          update product_variants set
            label = v_var->>'label',
            size_label = nullif(v_var->>'sizeLabel', ''),
            sale_price_paise = (v_var->>'salePricePaise')::bigint,
            cost_price_paise = (v_var->>'costPricePaise')::bigint,
            mrp_paise = nullif(v_var->>'mrpPaise', '')::bigint,
            price_unit = v_var->>'priceUnit',
            updated_at = now()
           where id = v_old_variant.id;
          update inventory set reorder_level = (v_var->>'reorderLevel')::bigint, updated_at = now()
           where variant_id = v_old_variant.id and store_id = v_batch.store_id;
          v_variants_updated := v_variants_updated + 1;
          insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
          values (v_batch.store_id, v_actor, 'shop_owner', 'catalogue.variant_updated', 'product_variants', v_old_variant.id,
                  jsonb_build_object('sale_price_paise', v_old_variant.sale_price_paise, 'cost_price_paise', v_old_variant.cost_price_paise, 'mrp_paise', v_old_variant.mrp_paise),
                  jsonb_build_object('sale_price_paise', (v_var->>'salePricePaise')::bigint, 'cost_price_paise', (v_var->>'costPricePaise')::bigint, 'mrp_paise', nullif(v_var->>'mrpPaise', '')::bigint));
        end if;
      end loop;
    end loop;
  end if;

  v_summary := jsonb_build_object(
    'kind', v_batch.kind,
    'productsCreated', v_products_created,
    'productsUpdated', v_products_updated,
    'variantsCreated', v_variants_created,
    'variantsUpdated', v_variants_updated,
    'pricesUpdated', v_prices_updated,
    'readyRows', v_batch.ready_rows,
    'skippedRows', v_batch.skipped_rows,
    'errorRows', v_batch.error_rows);

  update product_import_batches set status = 'applied', applied_at = now(), summary = v_summary, actor_id = coalesce(actor_id, v_actor)
   where id = p_batch;

  insert into audit_logs (store_id, actor_id, actor_type, action, entity_type, entity_id, after_state)
  values (v_batch.store_id, v_actor, 'shop_owner', 'catalogue.import_applied', 'product_import_batches', p_batch, v_summary);

  return v_summary;
end $$;

revoke execute on function product_import_apply(uuid, uuid) from public, anon, authenticated;
