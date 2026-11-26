-- Product import tests (rolled back). I1-I9.
\set ON_ERROR_STOP on
begin;
do $$
declare
  s uuid; owner_id uuid; cat uuid; brand uuid; p_existing uuid; v_existing uuid; v_existing_sku text;
  b_create uuid; b_fail uuid; b_price uuid; b_update uuid; b_bad_cat uuid;
  summary jsonb; summary2 jsonb; n int; before_stock bigint; new_variant uuid; label_now text;
  price_now bigint; applied_before text;
begin
  -- Fixtures from the dev seed: a store with an owner, a category, a brand, and an existing variant.
  select pr.store_id, pr.id, pr.category_id, pr.brand_id, v.id, v.sku
    into s, p_existing, cat, brand, v_existing, v_existing_sku
    from products pr join product_variants v on v.product_id = pr.id and v.store_id = pr.store_id
   order by pr.id, v.id limit 1;
  if s is null then raise exception 'I0 needs a seeded product with a variant'; end if;
  select so.profile_id into owner_id from store_owners so where so.store_id = s and so.role = 'owner' and so.is_active limit 1;
  if owner_id is null then raise exception 'I0 needs an active owner for the seeded store'; end if;

  -- I1 create: a new product with two variants; the first has opening stock, both get reorder levels.
  insert into product_import_batches (store_id, kind, mode, file_name, file_format, status, total_rows, ready_rows, staged)
  values (s, 'catalogue', 'skip', 'import-test.csv', 'csv', 'previewed', 2, 2, jsonb_build_array(jsonb_build_object(
    'productSku', 'IMP-I1-PROD', 'productAction', 'create', 'productId', null,
    'product', jsonb_build_object('name', 'Import test tile', 'slug', 'import-test-tile', 'description', 'desc',
                                  'categoryId', cat, 'brandId', brand, 'material', 'Vitrified', 'gstRateBps', 1800,
                                  'unitOfSale', 'box', 'status', 'active'),
    'variants', jsonb_build_array(
      jsonb_build_object('variantAction', 'create', 'variantId', null, 'sku', 'IMP-I1-W', 'label', 'White',
                         'sizeLabel', '600 x 600', 'salePricePaise', 64000, 'costPricePaise', 52000, 'mrpPaise', 72000,
                         'priceUnit', 'box', 'openingStock', 5, 'reorderLevel', 2, 'isDefault', true, 'row', 2),
      jsonb_build_object('variantAction', 'create', 'variantId', null, 'sku', 'IMP-I1-G', 'label', 'Grey',
                         'sizeLabel', null, 'salePricePaise', 64000, 'costPricePaise', 0, 'mrpPaise', null,
                         'priceUnit', 'box', 'openingStock', 0, 'reorderLevel', 0, 'isDefault', false, 'row', 3)))))
  returning id into b_create;

  summary := product_import_apply(b_create, owner_id);
  if (summary->>'productsCreated')::int <> 1 or (summary->>'variantsCreated')::int <> 2 then
    raise exception 'I1 wrong summary: %', summary;
  end if;
  select v.id into new_variant from product_variants v where v.sku = 'IMP-I1-W' and v.store_id = s;
  if (select on_hand from inventory where variant_id = new_variant) <> 5 then raise exception 'I1 opening stock not recorded'; end if;
  if (select reorder_level from inventory where variant_id = new_variant) <> 2 then raise exception 'I1 reorder level not recorded'; end if;
  if not exists (select 1 from stock_movements where variant_id = new_variant and movement_type = 'opening' and quantity = 5) then
    raise exception 'I1 opening movement missing';
  end if;
  if not exists (select 1 from audit_logs where store_id = s and action = 'catalogue.product_created' and entity_id = (select product_id from product_variants where id = new_variant)) then
    raise exception 'I1 product creation not audited';
  end if;
  raise notice 'I1 ok: product, variants, opening stock, reorder level and audit';

  -- I2 re-applying an applied batch returns the stored summary and creates nothing more.
  summary2 := product_import_apply(b_create, owner_id);
  if summary2 <> summary then raise exception 'I2 re-apply changed the summary'; end if;
  if (select count(*) from products where store_id = s and sku = 'IMP-I1-PROD') <> 1 then raise exception 'I2 product duplicated'; end if;
  raise notice 'I2 ok: confirming twice does not duplicate';

  -- I3 a batch that fails part-way changes nothing and stays open for another attempt.
  insert into product_import_batches (store_id, kind, mode, file_name, file_format, status, total_rows, ready_rows, staged)
  values (s, 'catalogue', 'skip', 'fail-test.csv', 'csv', 'previewed', 1, 1, jsonb_build_array(jsonb_build_object(
    'productSku', 'IMP-I3-PROD', 'productAction', 'create', 'productId', null,
    'product', jsonb_build_object('name', 'Should roll back', 'slug', 'should-roll-back', 'description', null,
                                  'categoryId', cat, 'brandId', null, 'material', null, 'gstRateBps', 1800,
                                  'unitOfSale', 'piece', 'status', 'active'),
    'variants', jsonb_build_array(
      jsonb_build_object('variantAction', 'create', 'variantId', null, 'sku', v_existing_sku, 'label', 'Clash',
                         'sizeLabel', null, 'salePricePaise', 1000, 'costPricePaise', 0, 'mrpPaise', null,
                         'priceUnit', 'piece', 'openingStock', 0, 'reorderLevel', 0, 'isDefault', true, 'row', 2)))))
  returning id into b_fail;
  begin
    perform product_import_apply(b_fail, owner_id);
    raise exception 'I3 duplicate variant SKU accepted';
  exception when unique_violation then null;
  end;
  if exists (select 1 from products where store_id = s and sku = 'IMP-I3-PROD') then raise exception 'I3 partial product kept'; end if;
  if (select status from product_import_batches where id = b_fail) <> 'previewed' then raise exception 'I3 batch closed after failure'; end if;
  raise notice 'I3 ok: a failed batch leaves no partial product and stays open';

  -- I4 price update: the sale price changes and the old and new values are audited.
  select sale_price_paise into price_now from product_variants where id = v_existing;
  insert into product_import_batches (store_id, kind, mode, file_name, file_format, status, total_rows, ready_rows, staged)
  values (s, 'prices', 'update', 'prices.csv', 'csv', 'previewed', 1, 1, jsonb_build_array(jsonb_build_object(
    'variantId', v_existing, 'variantSku', v_existing_sku, 'salePricePaise', price_now + 1234,
    'costPricePaise', 100, 'mrpPaise', null)))
  returning id into b_price;
  perform product_import_apply(b_price, owner_id);
  if (select sale_price_paise from product_variants where id = v_existing) <> price_now + 1234 then raise exception 'I4 price not updated'; end if;
  if not exists (select 1 from audit_logs where action = 'catalogue.price_updated' and entity_id = v_existing and before_state->>'sale_price_paise' = price_now::text) then
    raise exception 'I4 price change not audited';
  end if;
  raise notice 'I4 ok: price update applied and audited';

  -- I5 existing variant update: label changes, stock does not.
  select on_hand into before_stock from inventory where variant_id = v_existing;
  insert into product_import_batches (store_id, kind, mode, file_name, file_format, status, total_rows, ready_rows, staged)
  values (s, 'catalogue', 'update', 'update.csv', 'csv', 'previewed', 1, 1, jsonb_build_array(jsonb_build_object(
    'productSku', (select sku from products where id = p_existing), 'productAction', 'none', 'productId', p_existing,
    'product', null,
    'variants', jsonb_build_array(jsonb_build_object('variantAction', 'update', 'variantId', v_existing, 'sku', v_existing_sku,
      'label', 'Renamed label', 'sizeLabel', null, 'salePricePaise', 5000, 'costPricePaise', 0, 'mrpPaise', null,
      'priceUnit', 'piece', 'openingStock', 0, 'reorderLevel', 3, 'isDefault', false, 'row', 2)))))
  returning id into b_update;
  perform product_import_apply(b_update, owner_id);
  select label into label_now from product_variants where id = v_existing;
  if label_now <> 'Renamed label' then raise exception 'I5 label not updated'; end if;
  if (select on_hand from inventory where variant_id = v_existing) <> before_stock then raise exception 'I5 stock changed by import'; end if;
  raise notice 'I5 ok: variant updated, stock untouched';

  -- I6 a category from outside the store is refused.
  insert into product_import_batches (store_id, kind, mode, file_name, file_format, status, total_rows, ready_rows, staged)
  values (s, 'catalogue', 'skip', 'bad-category.csv', 'csv', 'previewed', 1, 1, jsonb_build_array(jsonb_build_object(
    'productSku', 'IMP-I6-PROD', 'productAction', 'create', 'productId', null,
    'product', jsonb_build_object('name', 'Bad category', 'slug', 'bad-category', 'description', null,
                                  'categoryId', gen_random_uuid(), 'brandId', null, 'material', null, 'gstRateBps', 1800,
                                  'unitOfSale', 'piece', 'status', 'active'),
    'variants', jsonb_build_array(jsonb_build_object('variantAction', 'create', 'variantId', null, 'sku', 'IMP-I6-V',
      'label', 'x', 'sizeLabel', null, 'salePricePaise', 100, 'costPricePaise', 0, 'mrpPaise', null,
      'priceUnit', 'piece', 'openingStock', 0, 'reorderLevel', 0, 'isDefault', true, 'row', 2)))))
  returning id into b_bad_cat;
  begin
    perform product_import_apply(b_bad_cat, owner_id);
    raise exception 'I6 foreign category accepted';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'I6 ok: category outside the store refused';

  -- I7 someone who is not an owner or manager of the store cannot apply the batch.
  begin
    perform product_import_apply(b_bad_cat, gen_random_uuid());
    raise exception 'I7 non-manager applied an import';
  exception when insufficient_privilege then null;
  end;
  raise notice 'I7 ok: only owners and managers of the store can apply';

  -- I8 an empty staged list is refused.
  insert into product_import_batches (store_id, kind, mode, file_name, file_format, status, total_rows, ready_rows, staged)
  values (s, 'catalogue', 'skip', 'empty.csv', 'csv', 'previewed', 0, 0, '[]'::jsonb)
  returning id into applied_before;
  begin
    perform product_import_apply(applied_before::uuid, owner_id);
    raise exception 'I8 empty import accepted';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'I8 ok: empty import refused';

  -- I9 signed-in users cannot read the staged change set; they can read the preview.
  begin
    execute 'set local role authenticated';
    perform 1 from product_import_batches where false;
    begin
      perform staged from product_import_batches limit 1;
      raise exception 'I9 staged column readable by a client';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  exception when others then
    execute 'reset role';
    if sqlerrm like 'I9%' then raise; end if;
  end;
  raise notice 'I9 ok: staged change set is not readable by signed-in users';
end $$;
rollback;
