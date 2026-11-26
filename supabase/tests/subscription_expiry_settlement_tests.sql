-- ZENTRO BuildMart: subscription expiry does not discard money received for an existing order (SX1-SX6). Rolled back.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.plan(p_variant uuid, p_method text) returns jsonb
language plpgsql as $$
declare
  v_price bigint; v_cost bigint; v_bps integer; v_sku text; v_label text; v_pname text; v_tax bigint;
begin
  select pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name
    into v_price, v_cost, v_bps, v_sku, v_label, v_pname
  from product_variants pv join products pr on pr.id = pv.product_id where pv.id = p_variant;
  v_tax := round(v_price * v_bps / 10000.0)::bigint;
  return jsonb_build_object(
    'method', p_method, 'customer_name', 'Expiry Customer', 'customer_mobile', '9999900012', 'supply_state_code', '33', 'customer_email', null,
    'coupon_code', null, 'subtotal_paise', v_price, 'discount_paise', 0, 'tax_paise', v_tax,
    'total_paise', v_price + v_tax, 'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object(
      'variant_id', p_variant, 'quantity', 1, 'unit_price_paise', v_price, 'cost_price_paise', v_cost,
      'gst_rate_bps', v_bps, 'product_name', v_pname, 'variant_label', v_label, 'sku', v_sku, 'hsn_code', null,
      'discount_paise', 0, 'taxable_paise', v_price, 'tax_paise', v_tax, 'line_total_paise', v_price + v_tax)));
end $$;

create or replace function pg_temp.fill_cart(p_store uuid, p_sess uuid, p_variant uuid) returns void
language plpgsql as $$
declare c uuid;
begin
  insert into carts (store_id, guest_session_id, status) values (p_store, p_sess, 'active') returning id into c;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (c, p_store, p_variant, 1);
end $$;

create or replace function pg_temp.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

do $$
declare
  s uuid; v uuid; sess uuid; res jsonb; o_online uuid; o_cash uuid; t_online bigint; t_cash bigint;
  owner uuid := gen_random_uuid(); r text; st text; pay text; n integer; inv_before integer; on_hand_before bigint;
begin
  -- A store whose subscription is active today.
  select sb.store_id into s from subscriptions sb
   where sb.status in ('active','trialing') and current_date between sb.period_start and sb.period_end limit 1;
  if s is null then raise exception 'SX0 needs a seeded store with an active subscription'; end if;
  select pv.id into v from product_variants pv where pv.store_id = s and pv.is_active order by pv.id limit 1;
  if v is null then raise exception 'SX0 needs an active variant in that store'; end if;
  update inventory set on_hand = 20, reserved = 0 where variant_id = v;
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('8', 64), now() + interval '1 day') returning id into sess;

  -- While active: a Guest places an online order and a cash order.
  perform pg_temp.fill_cart(s, sess, v);
  res := guest_checkout_place(s, sess, 'sx-key-online-0001', pg_temp.plan(v, 'online'));
  o_online := (res ->> 'order_id')::uuid; select total_paise into t_online from orders where id = o_online;
  insert into payments (store_id, order_id, method, provider, amount_paise, status, provider_order_id)
    values (s, o_online, 'online', 'simulator', t_online, 'PENDING', 'sx-order-online');
  perform pg_temp.fill_cart(s, sess, v);
  res := guest_checkout_place(s, sess, 'sx-key-cash-0002', pg_temp.plan(v, 'cash'));
  o_cash := (res ->> 'order_id')::uuid; select total_paise into t_cash from orders where id = o_cash;

  -- Staff are added while the subscription is active (adding a user is refused after expiry).
  insert into auth.users (id, email) values (owner, 'sx-owner-' || owner::text || '@example.test');
  insert into profiles (id, full_name) values (owner, 'SX Owner') on conflict (id) do nothing;
  insert into store_owners (store_id, profile_id, role, is_active) values (s, owner, 'owner', true);

  -- The subscription expires.
  update subscriptions set period_start = current_date - 31, period_end = current_date - 1
   where store_id = s;
  st := app.store_subscription_state(s, current_date);
  if st = 'active' then raise exception 'SX1 setup failed: subscription still active'; end if;
  raise notice 'SX1 ok: subscription expired (state %)', st;

  -- SX2: new commerce is refused after expiry.
  perform pg_temp.fill_cart(s, sess, v);
  r := pg_temp.sqlstate_of(format('select guest_checkout_place(%L,%L,%L,%L::jsonb)', s, sess, 'sx-key-new-0003',
        pg_temp.plan(v, 'online')::text));
  if r not like 'P0001%' then raise exception 'SX2 FAILED: new order accepted after expiry: %', r; end if;
  raise notice 'SX2 ok: new commerce refused after expiry';

  -- SX3: a verified online payment for the existing order is settled, not discarded.
  on_hand_before := (select on_hand from inventory where variant_id = v);
  pay := settle_online_payment('simulator', 'sx-order-online', 'sx-pay-online', t_online, true, null);
  if pay <> 'paid' then raise exception 'SX3 FAILED: settlement after expiry returned %', pay; end if;
  if (select status from payments where order_id = o_online) <> 'PAID'
     or (select payment_status from orders where id = o_online) <> 'PAID'
     or (select order_status from orders where id = o_online) = 'CANCELLED' then
    raise exception 'SX3 FAILED: payment or order state wrong after settlement';
  end if;
  -- The online order consumed one unit; the cash order still holds its own reservation (one unit).
  if (select on_hand from inventory where variant_id = v) <> on_hand_before - 1
     or (select reserved from inventory where variant_id = v) <> 1 then
    raise exception 'SX3 FAILED: stock movement wrong';
  end if;
  select count(*) into n from invoices where order_id = o_online;
  if n <> 1 then raise exception 'SX3 FAILED: invoice count % (expected 1)', n; end if;
  raise notice 'SX3 ok: paid after expiry; one stock movement; one invoice';

  -- SX4: the same verified payment arriving again changes nothing.
  pay := settle_online_payment('simulator', 'sx-order-online', 'sx-pay-online', t_online, true, null);
  select count(*) into n from payments where order_id = o_online and status = 'PAID';
  if pay <> 'already_paid' or n <> 1 or (select on_hand from inventory where variant_id = v) <> on_hand_before - 1 then
    raise exception 'SX4 FAILED: duplicate settlement changed state (%)', pay;
  end if;
  raise notice 'SX4 ok: duplicate settlement is a no-op';

  -- SX5: cash for an order taken before expiry is confirmed after expiry by an authorised owner.
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',owner)::text, false);
  perform set_config('request.jwt.claim.sub', owner::text, false);
  inv_before := (select count(*) from invoices);
  pay := confirm_cash_payment(o_cash, t_cash, 'received after expiry', owner);
  perform set_config('request.jwt.claims', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
  if (select status from payments where order_id = o_cash) <> 'PAID' or (select count(*) from invoices where order_id = o_cash) <> 1 then
    raise exception 'SX5 FAILED: cash not settled after expiry (%)', pay;
  end if;
  raise notice 'SX5 ok: cash confirmed after expiry; one invoice';

  -- SX6: no lost payment: the cash confirmation is not repeated and no second invoice appears.
  r := pg_temp.sqlstate_of(format('select confirm_cash_payment(%L,%s,%L,%L)', o_cash, t_cash, 'again', owner));
  if (select count(*) from invoices where order_id = o_cash) <> 1 then raise exception 'SX6 FAILED: duplicate invoice'; end if;
  raise notice 'SX6 ok: repeat confirmation refused (%); still one invoice', left(r, 40);
end $$;

rollback;
