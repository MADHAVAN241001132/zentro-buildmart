-- ZENTRO BuildMart: checkout pricing recomputation (migrations 0049, 0052, 0054). P1-P6. Simulated; rolled back.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

-- A plan built from live prices. p_coupon_bps > 0 adds a percentage coupon on the single line, computed the way the
-- database computes it: rounded discount, taxable value, then tax at the product rate.
create or replace function pg_temp.plan(p_variant uuid, p_qty numeric, p_coupon text, p_coupon_bps integer)
returns jsonb language plpgsql as $$
declare
  v_price bigint; v_cost bigint; v_bps integer; v_sku text; v_label text; v_pname text;
  v_base bigint; v_disc bigint; v_taxable bigint; v_tax bigint;
begin
  select pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name
    into v_price, v_cost, v_bps, v_sku, v_label, v_pname
  from product_variants pv join products pr on pr.id = pv.product_id where pv.id = p_variant;
  v_base := round(v_price::numeric * p_qty)::bigint;
  v_disc := case when p_coupon is null then 0 else round(v_base * p_coupon_bps / 10000.0)::bigint end;
  v_taxable := v_base - v_disc;
  v_tax := round(v_taxable * v_bps / 10000.0)::bigint;
  return jsonb_build_object(
    'method', 'cash', 'customer_name', 'Pricing Customer', 'customer_mobile', '9999900006', 'supply_state_code', '33', 'customer_email', null,
    'coupon_code', p_coupon, 'subtotal_paise', v_base, 'discount_paise', v_disc, 'tax_paise', v_tax,
    'total_paise', v_taxable + v_tax, 'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object(
      'variant_id', p_variant, 'quantity', p_qty, 'unit_price_paise', v_price, 'cost_price_paise', v_cost,
      'gst_rate_bps', v_bps, 'product_name', v_pname, 'variant_label', v_label, 'sku', v_sku, 'hsn_code', null,
      'discount_paise', v_disc, 'taxable_paise', v_taxable, 'tax_paise', v_tax, 'line_total_paise', v_taxable + v_tax)));
end $$;

do $$
declare
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_var uuid; v_sess uuid; v_cart uuid; v_plan jsonb; v_bad jsonb; v_res jsonb; v_order uuid; v_r text;
  v_coupon_id uuid; v_used integer; v_rate integer; v_pv_price bigint; v_key text := 'pricing-key-' || substr(md5(random()::text), 1, 8);
begin
  select pv.id into v_var from product_variants pv where pv.sku = 'AMB-V001';
  select pr.gst_rate_bps into v_rate from product_variants pv join products pr on pr.id = pv.product_id where pv.id = v_var;
  update inventory set on_hand = 500, reserved = 0 where variant_id = v_var;
  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, is_active)
  values (store_a, 'PRICE10', 'percent', 1000, 0, true) returning id into v_coupon_id;

  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 1);

  -- P2: a plan whose tax is zero but whose lines still add up is refused.
  v_plan := pg_temp.plan(v_var, 1, null, 0);
  v_bad := jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_plan, '{tax_paise}', '0'), '{total_paise}', to_jsonb((v_plan->>'subtotal_paise')::bigint)),
           '{lines,0,tax_paise}', '0'), '{lines,0,line_total_paise}', to_jsonb((v_plan->>'subtotal_paise')::bigint));
  v_r := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L, %L, %L, %L::jsonb)$f$, store_a, v_sess, v_key || '-p2', v_bad));
  if v_r not like 'P0001%' or v_r not like '%does not match the server calculation%' then
    raise exception 'P2 FAILED: zero-tax plan accepted: %', v_r;
  end if;
  raise notice 'P2 ok: understated tax refused (%)', v_r;

  -- P6 (before any placement): a changed live price refuses the plan.
  update product_variants set sale_price_paise = sale_price_paise + 100 where id = v_var;
  v_r := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L, %L, %L, %L::jsonb)$f$, store_a, v_sess, v_key || '-p6', v_plan));
  update product_variants set sale_price_paise = sale_price_paise - 100 where id = v_var;
  if v_r not like 'P0001%cart_changed%' then raise exception 'P6 FAILED: stale price accepted: %', v_r; end if;
  raise notice 'P6 ok: stale price refused';

  -- P3: a coupon plan that claims the discount on the order but not on the line is refused.
  v_plan := pg_temp.plan(v_var, 1, 'PRICE10', 1000);
  v_bad := jsonb_set(jsonb_set(v_plan, '{lines,0,discount_paise}', '0'), '{lines,0,taxable_paise}', (v_plan->'subtotal_paise'));
  v_bad := jsonb_set(v_bad, '{lines,0,tax_paise}', to_jsonb(round((v_plan->>'subtotal_paise')::numeric * v_rate / 10000.0)::bigint));
  v_bad := jsonb_set(v_bad, '{lines,0,line_total_paise}', to_jsonb((v_plan->>'subtotal_paise')::bigint + round((v_plan->>'subtotal_paise')::numeric * v_rate / 10000.0)::bigint));
  v_bad := jsonb_set(jsonb_set(v_bad, '{tax_paise}', v_bad->'lines'->0->'tax_paise'), '{total_paise}', v_bad->'lines'->0->'line_total_paise');
  v_bad := jsonb_set(v_bad, '{discount_paise}', '0');
  v_r := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L, %L, %L, %L::jsonb)$f$, store_a, v_sess, v_key || '-p3', v_bad));
  if v_r = 'ok' then raise exception 'P3 FAILED: coupon discount removed from line accepted'; end if;
  raise notice 'P3 ok: coupon allocation tampering refused (%)', v_r;

  -- P4: the correct coupon plan is accepted; the database stores the recomputed discount and tax, and redeems once.
  v_res := guest_checkout_place(store_a, v_sess, v_key || '-p4', v_plan);
  v_order := (v_res ->> 'order_id')::uuid;
  if (select discount_paise from orders where id = v_order) <> (v_plan->>'discount_paise')::bigint then raise exception 'P4 FAILED: discount stored wrong'; end if;
  if (select tax_paise from orders where id = v_order) <> (v_plan->>'tax_paise')::bigint then raise exception 'P4 FAILED: tax stored wrong'; end if;
  select used_count into v_used from coupons where id = v_coupon_id;
  if v_used <> 1 then raise exception 'P4 FAILED: coupon used_count = %', v_used; end if;
  raise notice 'P1/P4 ok: correct coupon plan accepted; discount %, tax %, redeemed once', v_plan->>'discount_paise', v_plan->>'tax_paise';

  -- P5: after the cart is cleared, the same key and plan replay the committed result; a changed plan under the same key is refused.
  delete from cart_items where cart_id = v_cart;
  v_res := guest_checkout_place(store_a, v_sess, v_key || '-p4', v_plan);
  if (v_res ->> 'order_id')::uuid <> v_order or (v_res ->> 'replayed') <> 'true' then
    raise exception 'P5 FAILED: replay after cart cleared did not return the committed order: %', v_res;
  end if;
  if (select count(*) from orders where guest_session_id = v_sess) <> 1 then raise exception 'P5 FAILED: replay created an order'; end if;
  v_r := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L, %L, %L, %L::jsonb)$f$, store_a, v_sess, v_key || '-p4', pg_temp.plan(v_var, 2, null, 0)));
  if v_r not like '22023%' then raise exception 'P5 FAILED: changed plan under a used key not refused: %', v_r; end if;
  select used_count into v_used from coupons where id = v_coupon_id;
  if v_used <> 1 then raise exception 'P5 FAILED: replay changed coupon count to %', v_used; end if;
  raise notice 'P5 ok: replay after cart cleared returns the committed order; changed plan refused';
end $$;

rollback;
