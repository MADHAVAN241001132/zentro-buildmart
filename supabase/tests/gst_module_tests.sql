-- GST module tests (migration 0058). Exact-value checks on GSTIN validation, store tax policy, the component split and
-- checkout placement. Store changes and every order are rolled back at the end.
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
  v_sess uuid; v_cart uuid; v_key text; v_plan jsonb; v_res jsonb; v_order uuid; v_row record;
  v_base bigint; v_tax bigint; v_cg bigint; v_st bigint; v_state text; v_n integer;
  v_plan_tax_override bigint;
  v_c jsonb; v_ok boolean;
begin
  -- G-1: GSTIN vectors (format, state code, check digit).
  if app.gstin_problem('27AAPFU0939F1ZV') is not null then raise exception 'G-1a FAILED'; end if;
  if app.gstin_problem('27AAPFU0939F1ZX') <> 'check_digit' then raise exception 'G-1b FAILED'; end if;
  if app.gstin_problem('99AAPFU0939F1ZV') <> 'state_code' then raise exception 'G-1c FAILED'; end if;
  if app.gstin_problem('27AAPFU0939F1Z') <> 'format' then raise exception 'G-1d FAILED'; end if;
  if app.gstin_problem('27aapfu0939f1zv') <> 'format' then raise exception 'G-1e FAILED'; end if;
  if app.gstin_problem(null) <> 'missing' then raise exception 'G-1f FAILED'; end if;
  raise notice 'G-1 ok: GSTIN format, state and check-digit vectors';

  -- G-2: component split, exact values. 999 at 18%: total 180, CGST 90, SGST 90.
  v_c := app.gst_components(999, 1800, true, false, false);
  if (v_c ->> 'total')::bigint <> 180 or (v_c ->> 'cgst')::bigint <> 90 or (v_c ->> 'sgst')::bigint <> 90
     or (v_c ->> 'igst')::bigint <> 0 then
    raise exception 'G-2a FAILED: %', v_c;
  end if;
  v_c := app.gst_components(10000, 1800, true, false, true);
  if (v_c ->> 'utgst')::bigint <> 900 or (v_c ->> 'sgst')::bigint <> 0 then raise exception 'G-2b FAILED: %', v_c; end if;
  v_c := app.gst_components(10001, 500, true, true, false);
  if (v_c ->> 'igst')::bigint <> 500 or (v_c ->> 'cgst')::bigint <> 0 then raise exception 'G-2c FAILED: %', v_c; end if;
  v_c := app.gst_components(10000, 1800, false, true, false);
  if (v_c ->> 'total')::bigint <> 0 then raise exception 'G-2d FAILED: %', v_c; end if;
  raise notice 'G-2 ok: intrastate, UTGST, interstate and not-collected components are exact';

  -- G-3: store tax mode, per registration, on the seeded store.
  if app.store_gst_mode(store_a) <> 'taxed' then raise exception 'G-3a FAILED: %', app.store_gst_mode(store_a); end if;
  set local session_replication_role = replica;
  update stores set gst_registration = 'composition' where id = store_a;
  if app.store_gst_mode(store_a) <> 'not_collected' then raise exception 'G-3b FAILED'; end if;
  update stores set gst_registration = 'unregistered' where id = store_a;
  if app.store_gst_mode(store_a) <> 'not_collected' then raise exception 'G-3c FAILED'; end if;
  update stores set gst_registration = 'regular', gstin = '33AAAAA1234A1Z5' where id = store_a;
  if app.store_gst_mode(store_a) <> 'invalid_profile' then raise exception 'G-3d FAILED'; end if;
  raise notice 'G-3 ok: store tax mode follows registration and a valid GSTIN';
  -- Restore the seeded profile for the checkout scenarios below (rolled back at the end anyway).
  update stores set gst_registration = 'regular', gstin = '33AAAAA1234A1ZV', state_code = '33' where id = store_a;

  -- Product and price for the checkout scenarios.
  select pv.id, pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name
    into v_var, v_price, v_cost, v_bps, v_sku, v_label, v_pname
    from product_variants pv join products pr on pr.id = pv.product_id where pv.sku = 'AMB-V001';
  update inventory set on_hand = 500, reserved = 0 where variant_id = v_var;
  v_base := round(v_price::numeric * 2)::bigint;
  v_tax := round(v_base * v_bps / 10000.0)::bigint;
  v_cg := round(v_base * floor(v_bps / 2)::integer / 10000.0)::bigint;

  -- Helper: a fresh session with two of the variant in its cart.
  -- (Inline per scenario below; each uses its own key.)

  -- G-4: intrastate taxed checkout. Components: CGST = half rate, SGST = remainder, IGST zero.
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  v_key := 'gst-intra-' || substr(gen_random_uuid()::text, 1, 12);
  v_plan := jsonb_build_object(
    'method', 'cash', 'customer_name', 'GST Intra', 'customer_mobile', '9999900021', 'customer_email', null,
    'supply_state_code', '33', 'coupon_code', null, 'subtotal_paise', v_base, 'discount_paise', 0, 'tax_paise', v_tax,
    'total_paise', v_base + v_tax, 'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 2,
      'unit_price_paise', v_price, 'cost_price_paise', v_cost, 'gst_rate_bps', v_bps, 'product_name', v_pname,
      'variant_label', v_label, 'sku', v_sku, 'hsn_code', null, 'discount_paise', 0,
      'taxable_paise', v_base, 'tax_paise', v_tax, 'line_total_paise', v_base + v_tax)));
  v_res := guest_checkout_place(store_a, v_sess, v_key, v_plan);
  select o.cgst_paise, o.sgst_paise, o.utgst_paise, o.igst_paise, o.tax_paise, o.supply_state_code,
         o.store_state_code, o.is_interstate, o.tax_mode, o.gst_registration_snapshot
    into v_row from orders o where o.id = (v_res ->> 'order_id')::uuid;
  if v_row.tax_paise <> v_tax or v_row.cgst_paise <> v_cg or v_row.sgst_paise <> v_tax - v_cg
     or v_row.igst_paise <> 0 or v_row.utgst_paise <> 0 then
    raise exception 'G-4a FAILED: cgst=% sgst=% igst=% tax=%', v_row.cgst_paise, v_row.sgst_paise, v_row.igst_paise, v_row.tax_paise;
  end if;
  if v_row.is_interstate <> false or v_row.tax_mode <> 'taxed' or v_row.supply_state_code <> '33'
     or v_row.store_state_code <> '33' or v_row.gst_registration_snapshot <> 'regular' then
    raise exception 'G-4b FAILED: %', v_row;
  end if;
  select coalesce(sum(cgst_paise + sgst_paise + utgst_paise + igst_paise) = v_tax, false) into v_ok
    from order_items where order_id = (v_res ->> 'order_id')::uuid;
  if not v_ok then raise exception 'G-4c FAILED: line components do not add to line tax'; end if;
  raise notice 'G-4 ok: intrastate taxed checkout splits into CGST and SGST exactly';

  -- G-5: interstate taxed checkout (customer in Maharashtra). Components: IGST = full tax, CGST and SGST zero.
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  v_key := 'gst-inter-' || substr(gen_random_uuid()::text, 1, 12);
  v_plan := jsonb_set(v_plan, '{supply_state_code}', '"27"');
  v_plan := jsonb_set(v_plan, '{customer_name}', '"GST Inter"');
  v_res := guest_checkout_place(store_a, v_sess, v_key, v_plan);
  select o.cgst_paise, o.sgst_paise, o.igst_paise, o.tax_paise, o.is_interstate into v_row
    from orders o where o.id = (v_res ->> 'order_id')::uuid;
  if v_row.igst_paise <> v_tax or v_row.cgst_paise <> 0 or v_row.sgst_paise <> 0 or v_row.is_interstate is not true then
    raise exception 'G-5 FAILED: igst=% cgst=% sgst=%', v_row.igst_paise, v_row.cgst_paise, v_row.sgst_paise;
  end if;
  raise notice 'G-5 ok: interstate taxed checkout is IGST only';

  -- G-6: refusals for a taxed store: missing place of supply, unknown code, tampered tax.
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  v_key := 'gst-refuse-' || substr(gen_random_uuid()::text, 1, 12);
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$, store_a, v_sess, v_key,
    (v_plan - 'supply_state_code')::text));
  if v_state not like 'P0001:%place of supply%' then raise exception 'G-6a FAILED: %', v_state; end if;
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$, store_a, v_sess, v_key,
    jsonb_set(v_plan, '{supply_state_code}', '"99"')::text));
  if v_state not like 'P0001:%unknown place of supply%' then raise exception 'G-6b FAILED: %', v_state; end if;
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$, store_a, v_sess, v_key,
    jsonb_set(v_plan, '{tax_paise}', to_jsonb(v_tax - 1))::text));
  if v_state not like 'P0001:%plan_mismatch%' then raise exception 'G-6c FAILED: %', v_state; end if;
  raise notice 'G-6 ok: missing or unknown place of supply and tampered tax are refused';

  -- G-7: an unregistered store collects no GST: the plan must carry zero tax.
  update stores set gst_registration = 'unregistered' where id = store_a;
  v_key := 'gst-unreg-' || substr(gen_random_uuid()::text, 1, 12);
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$, store_a, v_sess, v_key, v_plan::text));
  if v_state not like 'P0001:%plan_mismatch%' then raise exception 'G-7a FAILED: %', v_state; end if;
  v_plan_tax_override := 0;
  v_plan := jsonb_set(jsonb_set(v_plan, '{tax_paise}', to_jsonb(v_plan_tax_override)),
                      '{total_paise}', to_jsonb(v_base));
  v_plan := jsonb_set(v_plan, '{lines,0,tax_paise}', to_jsonb(v_plan_tax_override));
  v_plan := jsonb_set(v_plan, '{lines,0,line_total_paise}', to_jsonb(v_base));
  v_res := guest_checkout_place(store_a, v_sess, v_key, v_plan);
  select o.tax_paise, o.tax_mode, o.cgst_paise + o.sgst_paise + o.igst_paise + o.utgst_paise as comp into v_row
    from orders o where o.id = (v_res ->> 'order_id')::uuid;
  if v_row.tax_paise <> 0 or v_row.tax_mode <> 'not_collected' or v_row.comp <> 0 then
    raise exception 'G-7b FAILED: %', v_row;
  end if;
  raise notice 'G-7 ok: unregistered store checks out with zero tax and tax_mode not_collected';

  -- Fresh cart for this scenario (the previous one was converted).
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  -- G-8: a composition store cannot supply outside its state, and cannot charge tax.
  update stores set gst_registration = 'composition' where id = store_a;
  v_key := 'gst-comp-' || substr(gen_random_uuid()::text, 1, 12);
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$, store_a, v_sess, v_key,
    jsonb_set(jsonb_set(v_plan, '{supply_state_code}', '"27"'), '{customer_name}', '"Comp"')::text));
  if v_state not like 'P0001:%gst_composition_interstate%' then raise exception 'G-8a FAILED: %', v_state; end if;
  -- Intrastate composition supply with zero tax is accepted (v_plan carries zero tax after G-7).
  v_res := guest_checkout_place(store_a, v_sess, v_key, jsonb_set(v_plan, '{supply_state_code}', '"33"'));
  select o.tax_paise, o.is_interstate into v_row from orders o where o.id = (v_res ->> 'order_id')::uuid;
  if v_row.tax_paise <> 0 or v_row.is_interstate is not false then raise exception 'G-8b FAILED: %', v_row; end if;
  raise notice 'G-8 ok: composition store refuses interstate supply and collects no GST';

  -- Fresh cart for this scenario (the previous one was converted).
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);
  -- G-9: a regular store with an invalid GSTIN cannot take orders.
  update stores set gst_registration = 'regular', gstin = '33AAAAA1234A1Z5' where id = store_a;
  v_key := 'gst-badprof-' || substr(gen_random_uuid()::text, 1, 12);
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$, store_a, v_sess, v_key, v_plan::text));
  if v_state not like 'P0001:%gst_profile_incomplete%' then raise exception 'G-9 FAILED: %', v_state; end if;
  raise notice 'G-9 ok: a regular store with an invalid GSTIN is refused, not silently untaxed';

end $$;

rollback;
