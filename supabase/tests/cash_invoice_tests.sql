-- ZENTRO BuildMart: cash confirmation and invoice exactly-once tests (migrations 0003, 0054). CI1-CI8.
-- Simulated fixtures only; rolled back. Authorisation is exercised with authenticated JWT claims, because server
-- sessions bypass store permission checks by design.
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

create or replace function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_uid::text)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create or replace function pg_temp.plan(p_variant uuid, p_qty numeric, p_method text, p_name text)
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
    'method', p_method, 'customer_name', p_name, 'customer_mobile', '9999900005', 'supply_state_code', '33', 'customer_email', null,
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
  store_b uuid;
  v_var uuid; v_sess uuid; v_cart uuid; v_res jsonb; v_o1 uuid; v_o2 uuid; v_total bigint;
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  v_on_hand_before integer; v_on_hand integer; v_counter_before bigint; v_counter bigint; v_inv_before integer; v_inv_id uuid;
  v_r text; v_count integer; v_inv_again uuid;
begin
  insert into auth.users (id, email) values
    (owner_a, 'ci-a-' || owner_a::text || '@example.test'), (owner_b, 'ci-b-' || owner_b::text || '@example.test'),
    (stranger, 'ci-s-' || stranger::text || '@example.test');
  insert into profiles (id, full_name) values (owner_a, 'CI Owner A'), (owner_b, 'CI Owner B'), (stranger, 'CI Stranger')
    on conflict (id) do nothing;
  insert into store_owners (store_id, profile_id, role, is_active) values (store_a, owner_a, 'owner', true);
  store_b := '22222222-2222-4222-8222-222222222222';  -- seeded second store (cross-store refusal only)
  insert into store_owners (store_id, profile_id, role, is_active) values (store_b, owner_b, 'owner', true);

  select pv.id into v_var from product_variants pv where pv.sku = 'AMB-V001';
  update inventory set on_hand = 500, reserved = 0 where variant_id = v_var;

  -- Two cash orders at store A, each from its own guest session and cart.
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 1);
  v_res := guest_checkout_place(store_a, v_sess, 'ci-key-1-' || substr(gen_random_uuid()::text, 1, 10), pg_temp.plan(v_var, 1, 'cash', 'Cash One'));
  v_o1 := (v_res ->> 'order_id')::uuid; v_total := (v_res ->> 'total_paise')::bigint;

  update carts set status = 'active' where id = v_cart;
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 1);
  v_res := guest_checkout_place(store_a, v_sess, 'ci-key-2-' || substr(gen_random_uuid()::text, 1, 10), pg_temp.plan(v_var, 1, 'cash', 'Cash Two'));
  v_o2 := (v_res ->> 'order_id')::uuid;

  select on_hand into v_on_hand_before from inventory where variant_id = v_var;

  -- CI2: a signed-in user without the cash_confirmation permission is refused.
  perform pg_temp.as_user(stranger);
  v_r := pg_temp.sqlstate_of(format($f$select confirm_cash_payment(%L, %s, 'x', %L)$f$, v_o2, v_total, stranger));
  if v_r not like '42501%' then raise exception 'CI2 FAILED: stranger was not refused: %', v_r; end if;
  if (select payment_status from orders where id = v_o2) <> 'PENDING' and (select payment_status from orders where id = v_o2) <> 'CASH_PENDING' then
    raise exception 'CI2 FAILED: order changed after refusal';
  end if;
  raise notice 'CI2 ok: unauthorised confirmation refused (%)', v_r;

  -- CI3: an owner of store B cannot confirm store A's cash order.
  perform pg_temp.as_user(owner_b);
  v_r := pg_temp.sqlstate_of(format($f$select confirm_cash_payment(%L, %s, 'x', %L)$f$, v_o2, v_total, owner_b));
  if v_r not like '42501%' then raise exception 'CI3 FAILED: cross-store confirmation was not refused: %', v_r; end if;
  raise notice 'CI3 ok: cross-store confirmation refused';

  -- CI4: a guest (anonymous role, no user) cannot confirm.
  perform pg_temp.as_anon();
  v_r := pg_temp.sqlstate_of(format($f$select confirm_cash_payment(%L, %s, 'x', null)$f$, v_o2, v_total));
  if v_r not like '42501%' then raise exception 'CI4 FAILED: guest confirmation was not refused: %', v_r; end if;
  raise notice 'CI4 ok: guest confirmation refused';

  -- CI1: the authorised owner confirms; exactly one payment, one confirmation row, one stock consumption, one invoice.
  perform pg_temp.as_user(owner_a);
  v_r := confirm_cash_payment(v_o1, v_total, 'counter', owner_a);
  if v_r <> 'paid' then raise exception 'CI1 FAILED: result %', v_r; end if;
  select count(*) into v_count from payments where order_id = v_o1 and status = 'PAID';
  if v_count <> 1 then raise exception 'CI1 FAILED: paid payments = %', v_count; end if;
  if (select count(*) from cash_confirmations where order_id = v_o1) <> 1 then raise exception 'CI1 FAILED: confirmations not exactly one'; end if;
  select on_hand into v_on_hand from inventory where variant_id = v_var;
  if v_on_hand <> v_on_hand_before - 1 then raise exception 'CI1 FAILED: stock moved by % not 1', v_on_hand_before - v_on_hand; end if;
  select count(*) into v_count from invoices where order_id = v_o1;
  if v_count <> 1 then raise exception 'CI1 FAILED: invoices = %', v_count; end if;
  raise notice 'CI1 ok: authorised confirmation: paid once, stock -1 once, one invoice';

  -- CI5: a duplicate confirmation is refused and changes nothing.
  v_r := pg_temp.sqlstate_of(format($f$select confirm_cash_payment(%L, %s, 'again', %L)$f$, v_o1, v_total, owner_a));
  if v_r not like 'P0001%' then raise exception 'CI5 FAILED: duplicate not refused: %', v_r; end if;
  select on_hand into v_on_hand from inventory where variant_id = v_var;
  if v_on_hand <> v_on_hand_before - 1 or (select count(*) from cash_confirmations where order_id = v_o1) <> 1 then
    raise exception 'CI5 FAILED: duplicate changed stock or confirmations';
  end if;
  raise notice 'CI5 ok: duplicate confirmation refused, no second stock movement';

  -- CI6: a wrong amount is refused and the order stays pending.
  v_r := pg_temp.sqlstate_of(format($f$select confirm_cash_payment(%L, %s, 'short', %L)$f$, v_o2, v_total - 1, owner_a));
  if v_r not like 'P0001%' then raise exception 'CI6 FAILED: wrong amount accepted: %', v_r; end if;
  if (select status from payments where order_id = v_o2 and method = 'cash') <> 'CASH_PENDING' then raise exception 'CI6 FAILED: payment changed'; end if;
  raise notice 'CI6 ok: wrong amount refused, payment still pending';

  -- CI7: invoice exactly once. Calling the issuer again returns the same invoice and consumes no number.
  select id into v_inv_id from invoices where order_id = v_o1;
  select next_value into v_counter_before from store_counters where store_id = store_a and kind = 'invoice';
  v_inv_again := app.ensure_invoice(v_o1);
  select next_value into v_counter from store_counters where store_id = store_a and kind = 'invoice';
  if v_inv_again is distinct from v_inv_id or v_counter <> v_counter_before then
    raise exception 'CI7 FAILED: repeat issuance changed the invoice or consumed a number';
  end if;
  raise notice 'CI7 ok: repeat issuance returns the same invoice and consumes no number';

  -- CI8: the guest order is PAID after confirmation, and the cancelled path cannot confirm.
  if (select payment_status from orders where id = v_o1) <> 'PAID' then raise exception 'CI8 FAILED: guest order not PAID'; end if;
  update orders set order_status = 'CANCELLED' where id = v_o2;
  v_r := pg_temp.sqlstate_of(format($f$select confirm_cash_payment(%L, %s, 'late', %L)$f$, v_o2, v_total, owner_a));
  if v_r = 'ok' then raise exception 'CI8 FAILED: cancelled order confirmed'; end if;
  raise notice 'CI8 ok: paid state verified; cancelled order refused (%)', v_r;
end $$;

rollback;
