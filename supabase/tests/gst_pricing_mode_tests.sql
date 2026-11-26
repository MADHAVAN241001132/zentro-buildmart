-- GST pricing-mode tests (migrations 0059 and 0060). Exact values match tests/gst-pricing-mode.test.ts. Rolled back.
begin;

create or replace function pg_temp.sqlstate_of(p_sql text) returns text
language plpgsql as $$
declare v_code text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text;
  return v_code || ': ' || v_msg;
end $$;

do $$
declare
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_var uuid; v_price bigint; v_cost bigint; v_bps integer; v_sku text; v_label text; v_pname text;
  v_sess uuid; v_cart uuid; v_key text; v_plan jsonb; v_state text; v_res jsonb;
  v_base bigint; v_taxable_pre bigint; v_tax_pre bigint;
  v_d bigint; v_post bigint; v_taxable_post bigint; v_tax_post bigint; v_row record;
begin
  -- P-1: line amounts, exact values.
  if (app.line_amounts(1180, 1800, true, true) ->> 'taxable')::bigint <> 1000
     or (app.line_amounts(1180, 1800, true, true) ->> 'tax')::bigint <> 180
     or (app.line_amounts(1180, 1800, true, true) ->> 'total')::bigint <> 1180 then
    raise exception 'P-1a FAILED';
  end if;
  -- Spec example, exclusive: 1,180 + 18% GST = 212.40 tax, 1,392.40 payable (paise 21240 and 139240).
  if (app.line_amounts(118000, 1800, false, true) ->> 'tax')::bigint <> 21240
     or (app.line_amounts(118000, 1800, false, true) ->> 'total')::bigint <> 139240 then
    raise exception 'P-1b FAILED';
  end if;
  if (app.line_amounts(999, 1800, true, true) ->> 'taxable')::bigint <> 847
     or (app.line_amounts(999, 1800, true, true) ->> 'tax')::bigint <> 152 then
    raise exception 'P-1c FAILED';
  end if;
  if (app.line_amounts(1180, 1800, true, false) ->> 'tax')::bigint <> 0
     or (app.line_amounts(1180, 1800, true, false) ->> 'total')::bigint <> 1180 then
    raise exception 'P-1d FAILED';
  end if;
  raise notice 'P-1 ok: line amounts incl. spec examples (1,180 inclusive; 1,180 exclusive = 212.40 GST, 1,392.40 payable)';

  select pv.id, pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name
    into v_var, v_price, v_cost, v_bps, v_sku, v_label, v_pname
    from product_variants pv join products pr on pr.id = pv.product_id where pv.sku = 'AMB-V001';
  update inventory set on_hand = 500, reserved = 0 where variant_id = v_var;
  v_base := round(v_price::numeric * 2)::bigint;

  -- Inclusive store (intrastate). Price is gross: the tax is extracted, nothing is added.
  alter table stores disable trigger stores_guard_legal_profile;
  update stores set prices_include_gst = true where id = store_a;
  v_taxable_pre := round(v_base::numeric * 10000 / (10000 + v_bps))::bigint;
  v_tax_pre := v_base - v_taxable_pre;

  -- P-2: inclusive checkout without coupon. Ledger: subtotal = taxable, tax = extracted, total = gross.
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  v_key := 'incl-plain-' || substr(gen_random_uuid()::text, 1, 12);
  v_plan := jsonb_build_object(
    'method', 'cash', 'customer_name', 'Incl Plain', 'customer_mobile', '9999900031', 'customer_email', null,
    'supply_state_code', '33', 'coupon_code', null, 'subtotal_paise', v_taxable_pre, 'discount_paise', 0,
    'tax_paise', v_tax_pre, 'total_paise', v_base, 'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 2,
      'unit_price_paise', v_price, 'cost_price_paise', v_cost, 'gst_rate_bps', v_bps, 'product_name', v_pname,
      'variant_label', v_label, 'sku', v_sku, 'hsn_code', null, 'discount_paise', 0,
      'taxable_paise', v_taxable_pre, 'tax_paise', v_tax_pre, 'line_total_paise', v_base)));
  v_res := guest_checkout_place(store_a, v_sess, v_key, v_plan);
  select o.subtotal_paise, o.discount_paise, o.taxable_paise, o.tax_paise, o.total_paise, o.gross_subtotal_paise,
         o.cgst_paise, o.sgst_paise, o.igst_paise
    into v_row from orders o where o.id = (v_res ->> 'order_id')::uuid;
  if v_row.subtotal_paise <> v_taxable_pre or v_row.discount_paise <> 0 or v_row.tax_paise <> v_tax_pre
     or v_row.total_paise <> v_base or v_row.gross_subtotal_paise <> v_base
     or v_row.cgst_paise + v_row.sgst_paise <> v_tax_pre or v_row.igst_paise <> 0 then
    raise exception 'P-2 FAILED: %', v_row;
  end if;
  raise notice 'P-2 ok: inclusive checkout extracts tax from the gross price (ledger subtotal %, tax %, total %)',
    v_taxable_pre, v_tax_pre, v_base;

  -- P-3: inclusive with a 10% coupon. Discount on the gross amount first, then tax is extracted from what remains.
  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, is_active)
  values (store_a, 'GSTTEST10', 'percent', 1000, 0, true);
  v_d := round(v_base * 1000 / 10000.0)::bigint;
  v_post := v_base - v_d;
  v_taxable_post := round(v_post::numeric * 10000 / (10000 + v_bps))::bigint;
  v_tax_post := v_post - v_taxable_post;
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  v_key := 'incl-coupon-' || substr(gen_random_uuid()::text, 1, 12);
  v_plan := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_plan,
      '{coupon_code}', '"GSTTEST10"'), '{discount_paise}', to_jsonb(v_taxable_pre - v_taxable_post)),
      '{tax_paise}', to_jsonb(v_tax_post)), '{total_paise}', to_jsonb(v_post)),
      '{lines,0}', (v_plan -> 'lines' -> 0)
        || jsonb_build_object('discount_paise', v_taxable_pre - v_taxable_post, 'taxable_paise', v_taxable_post,
                              'tax_paise', v_tax_post, 'line_total_paise', v_post));
  v_res := guest_checkout_place(store_a, v_sess, v_key, v_plan);
  select o.subtotal_paise, o.discount_paise, o.tax_paise, o.total_paise, o.gross_discount_paise
    into v_row from orders o where o.id = (v_res ->> 'order_id')::uuid;
  if v_row.gross_discount_paise <> v_d or v_row.discount_paise <> v_taxable_pre - v_taxable_post
     or v_row.tax_paise <> v_tax_post or v_row.total_paise <> v_post
     or v_row.subtotal_paise - v_row.discount_paise + v_row.tax_paise <> v_post then
    raise exception 'P-3 FAILED: %', v_row;
  end if;
  if (select discount_paise from coupon_redemptions where order_id = (v_res ->> 'order_id')::uuid) <> v_d then
    raise exception 'P-3b FAILED: redemption not on the gross basis';
  end if;
  raise notice 'P-3 ok: 10%% coupon on gross (discount %, tax after extraction %, payable %)', v_d, v_tax_post, v_post;

  -- P-4: a tampered inclusive tax amount is refused.
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  v_key := 'incl-tamper-' || substr(gen_random_uuid()::text, 1, 12);
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$, store_a, v_sess, v_key,
    jsonb_set(jsonb_set(v_plan, '{coupon_code}', 'null'), '{discount_paise}', '0')::text));
  if v_state not like 'P0001:%' then raise exception 'P-4 FAILED: %', v_state; end if;
  raise notice 'P-4 ok: tampered inclusive plan refused (%)', v_state;

  -- P-5: POS (channel pos) cannot place an inclusive, GST-collecting order yet: explicit refusal.
  v_state := pg_temp.sqlstate_of(format($f$insert into orders (store_id, order_number, channel, payment_method,
      subtotal_paise, discount_paise, taxable_paise, tax_paise, total_paise, tax_mode, fulfilment)
    values (%L, 'PX-GUARD-1', 'pos', 'cash', 1000, 0, 1000, 180, 1180, 'taxed', 'pickup')$f$, store_a));
  if v_state not like 'P0001:%pricing_mode_unsupported%' then raise exception 'P-5 FAILED: %', v_state; end if;
  raise notice 'P-5 ok: direct inclusive POS-channel inserts outside pos_place_bill are refused';
end $$;

rollback;
