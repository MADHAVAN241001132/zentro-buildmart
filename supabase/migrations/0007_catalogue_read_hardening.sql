-- 0007: stop the public catalogue policy from exposing cost prices.
-- Before this migration, product_variants_public applied to anon AND authenticated and every column
-- was readable, so cost_price_paise was visible to any visitor through the REST API, and to every
-- signed-in owner for every store. Members still read their own store through product_variants_member_read.
-- Additive in intent: the policy is recreated for anon only, and anon loses the cost column.

drop policy if exists product_variants_public on product_variants;
create policy product_variants_public on product_variants for select to anon
  using (is_active and app.product_is_public(product_id));

revoke select on product_variants from anon;
grant select (
  id, store_id, product_id, sku, label, size_label, colour, finish, thickness_mm,
  sale_price_paise, mrp_paise, price_unit, pieces_per_box, coverage_sqft_per_box,
  is_default, is_active, created_at, updated_at
) on product_variants to anon;
