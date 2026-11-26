-- ZENTRO BuildMart: tests for migration 0049 (atomic Guest checkout). Rolled back at the end.
-- Simulated only: no Razorpay call is made. G1-G7.
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

-- A plan that matches the cart line for the given variant and quantity, priced from live rows.
create or replace function pg_temp.plan(p_variant uuid, p_qty numeric, p_key text, p_method text, p_name text)
returns jsonb language plpgsql as $$
declare
  v_price bigint; v_cost bigint; v_bps integer; v_sku text; v_label text; v_pname text; v_base bigint; v_tax bigint;
begin
  select pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name
    into v_price, v_cost, v_bps, v_sku, v_label, v_pname
  from product_variants pv join products pr on pr.id = pv.product_id where pv.id = p_variant;
  v_base := round(v_price::numeric * p_qty)::bigint;
  v_tax := round(v_base * v_bps / 10000.0)::bigint;
  return jsonb_build_object(
    'method', p_method, 'customer_name', p_name, 'customer_mobile', '9999900001', 'supply_state_code', '33', 'customer_email', null,
    'coupon_code', null, 'subtotal_paise', v_base, 'discount_paise', 0, 'tax_paise', v_tax,
    'total_paise', v_base + v_tax, 'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object(
      'variant_id', p_variant, 'quantity', p_qty, 'unit_price_paise', v_price, 'cost_price_paise', v_cost,
      'gst_rate_bps', v_bps, 'product_name', v_pname, 'variant_label', v_label, 'sku', v_sku, 'hsn_code', null,
      'discount_paise', 0, 'taxable_paise', v_base, 'tax_paise', v_tax, 'line_total_paise', v_base + v_tax)));
end $$;

do $$
declare
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_var uuid; v_price bigint;
  v_sess uuid; v_cart uuid;
  v_plan jsonb; v_res jsonb; v_res2 jsonb; v_order uuid;
  v_reserved_before integer; v_reserved_after integer;
  v_orders_before integer; v_orders_after integer;
  v_state text; v_pay uuid; v_pay2 uuid; v_msg text;
  v_key text := 'checkout-key-' || substr(gen_random_uuid()::text, 1, 12);
begin
  select pv.id, pv.sale_price_paise into v_var, v_price from product_variants pv where pv.sku = 'AMB-V001';
  update inventory set on_hand = 50, reserved = 0 where variant_id = v_var;

  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 2);

  v_plan := pg_temp.plan(v_var, 2, v_key, 'cash', 'Guest One');
  select count(*) into v_orders_before from orders where store_id = store_a;

  -- G1: a cash placement commits order, items, one reservation, the cash attempt and the converted cart.
  v_res := guest_checkout_place(store_a, v_sess, v_key, v_plan);
  select reserved into v_reserved_after from inventory where variant_id = v_var;
  if v_res ->> 'replayed' <> 'false' or v_reserved_after <> 2 then
    raise exception 'G1 FAILED: result % reserved %', v_res, v_reserved_after;
  end if;
  if not exists (select 1 from payments where order_id = (v_res ->> 'order_id')::uuid and status = 'CASH_PENDING') then
    raise exception 'G1 FAILED: no cash attempt';
  end if;
  if (select status from carts where id = v_cart) <> 'converted' then raise exception 'G1 FAILED: cart not converted'; end if;
  if (select count(*) from order_items where order_id = (v_res ->> 'order_id')::uuid) <> 1 then
    raise exception 'G1 FAILED: items missing';
  end if;
  raise notice 'G1 ok: cash placement is atomic';

  -- G2: the same key and details replay the committed result without a second order or reservation.
  v_reserved_before := v_reserved_after;
  v_res2 := guest_checkout_place(store_a, v_sess, v_key, v_plan);
  select reserved into v_reserved_after from inventory where variant_id = v_var;
  select count(*) into v_orders_after from orders where store_id = store_a;
  if v_res2 ->> 'replayed' <> 'true' or v_res2 ->> 'order_id' <> v_res ->> 'order_id'
     or v_reserved_after <> v_reserved_before or v_orders_after <> v_orders_before + 1 then
    raise exception 'G2 FAILED: replay % orders % reserved %', v_res2, v_orders_after, v_reserved_after;
  end if;
  raise notice 'G2 ok: replay is safe';

  -- G3: the same key with different details is refused.
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$,
    store_a, v_sess, v_key, replace(v_plan::text, 'Guest One', 'Someone Else')));
  if v_state not like '22023:%' then raise exception 'G3 FAILED: %', v_state; end if;
  raise notice 'G3 ok: key reuse with other details refused';

  -- G4: a price that changed after the cart was read is refused and the claim is rolled back.
  update carts set status = 'active' where id = v_cart;
  v_plan := pg_temp.plan(v_var, 2, 'drift-key-x1', 'cash', 'Guest Two');
  v_plan := jsonb_set(v_plan, '{lines,0,unit_price_paise}', to_jsonb((v_price + 1)));
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$,
    store_a, v_sess, 'drift-key-x1', v_plan));
  if v_state not like 'P0001:%cart_changed%' then raise exception 'G4 FAILED: %', v_state; end if;
  if (select status from carts where id = v_cart) <> 'active' then raise exception 'G4 FAILED: cart changed'; end if;
  if exists (select 1 from guest_checkout_requests where request_key = 'drift-key-x1') then
    raise exception 'G4 FAILED: a request claim survived a rollback';
  end if;
  raise notice 'G4 ok: price drift refused, claim rolled back';

  -- G5: a placement that cannot reserve stock rolls back completely.
  -- The cart is active again (G4 left it so); quantity beyond stock.
  update cart_items set quantity = 500 where cart_id = v_cart and variant_id = v_var;
  v_plan := pg_temp.plan(v_var, 500, 'stock-key-' || substr(gen_random_uuid()::text, 1, 12), 'cash', 'Guest Three');
  select count(*) into v_orders_before from orders where store_id = store_a;
  select reserved into v_reserved_before from inventory where variant_id = v_var;
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_place(%L,%L,%L,%L::jsonb)$f$,
    store_a, v_sess, 'stock-key-x5', v_plan));
  select count(*) into v_orders_after from orders where store_id = store_a;
  select reserved into v_reserved_after from inventory where variant_id = v_var;
  if v_state not like 'P0001:%insufficient_stock%' then raise exception 'G5 FAILED: %', v_state; end if;
  if v_orders_after <> v_orders_before or v_reserved_after <> v_reserved_before
     or (select status from carts where id = v_cart) <> 'active' then
    raise exception 'G5 FAILED: partial write after failure';
  end if;
  raise notice 'G5 ok: oversell rolls back the whole placement';

  -- G6: an online order is placed, then its provider order is attached once; a repeat is idempotent and a
  -- different provider order is refused.
  update cart_items set quantity = 1 where cart_id = v_cart and variant_id = v_var;
  v_plan := pg_temp.plan(v_var, 1, 'online-key-' || substr(gen_random_uuid()::text, 1, 12), 'online', 'Guest Four');
  v_res := guest_checkout_place(store_a, v_sess, 'online-key-g6', v_plan);
  v_order := (v_res ->> 'order_id')::uuid;
  if exists (select 1 from payments where order_id = v_order) then raise exception 'G6 FAILED: payment before attach'; end if;
  v_pay := guest_checkout_attach_payment(v_order, 'simulator', 'sim_g6_' || v_order::text, now() + interval '15 minutes');
  v_pay2 := guest_checkout_attach_payment(v_order, 'simulator', 'sim_g6_' || v_order::text, now() + interval '15 minutes');
  if v_pay <> v_pay2 then raise exception 'G6 FAILED: attach not idempotent'; end if;
  v_state := pg_temp.sqlstate_of(format($f$select guest_checkout_attach_payment(%L,'simulator','other_g6',now()+interval '5 minutes')$f$, v_order));
  if v_state not like 'P0001:%payment_already_attached%' then raise exception 'G6 FAILED: %', v_state; end if;
  raise notice 'G6 ok: provider attachment is idempotent and single';

  -- G7: the Guest-facing functions are not callable by ordinary roles.
  if has_function_privilege('authenticated', 'public.guest_checkout_place(uuid,uuid,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.guest_checkout_place(uuid,uuid,text,jsonb)', 'execute') then
    raise exception 'G7 FAILED: placement callable by client roles';
  end if;
  raise notice 'G7 ok: placement is server-only';
end $$;

rollback;
