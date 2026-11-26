-- ZENTRO BuildMart: unmatched-payment attribution and closed confirm-no-order (migration 0057). UA1-UA7. Rolled back.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.plan(p_variant uuid, p_qty numeric) returns jsonb
language plpgsql as $$
declare
  v_price bigint; v_cost bigint; v_bps integer; v_sku text; v_label text; v_pname text;
  v_base bigint; v_tax bigint;
begin
  select pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name
    into v_price, v_cost, v_bps, v_sku, v_label, v_pname
  from product_variants pv join products pr on pr.id = pv.product_id where pv.id = p_variant;
  v_base := round(v_price::numeric * p_qty)::bigint;
  v_tax := round(v_base * v_bps / 10000.0)::bigint;
  return jsonb_build_object(
    'method', 'online', 'customer_name', 'Attribution Customer', 'customer_mobile', '9999900011', 'supply_state_code', '33', 'customer_email', null,
    'coupon_code', null, 'subtotal_paise', v_base, 'discount_paise', 0, 'tax_paise', v_tax,
    'total_paise', v_base + v_tax, 'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object(
      'variant_id', p_variant, 'quantity', p_qty, 'unit_price_paise', v_price, 'cost_price_paise', v_cost,
      'gst_rate_bps', v_bps, 'product_name', v_pname, 'variant_label', v_label, 'sku', v_sku, 'hsn_code', null,
      'discount_paise', 0, 'taxable_paise', v_base, 'tax_paise', v_tax, 'line_total_paise', v_base + v_tax)));
end $$;

create or replace function pg_temp.fill_cart(p_store uuid, p_sess uuid, p_variant uuid) returns void
language plpgsql as $$
declare c uuid;
begin
  insert into carts (store_id, guest_session_id, status) values (p_store, p_sess, 'active') returning id into c;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (c, p_store, p_variant, 1);
end $$;

create or replace function pg_temp.pending_payment(p_store uuid, p_order uuid, p_amount bigint) returns void
language plpgsql as $$
begin
  insert into payments (store_id, order_id, method, provider, amount_paise, status)
    values (p_store, p_order, 'online', 'simulator', p_amount, 'PENDING');
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
  s uuid; v uuid; sess uuid; res jsonb; o1 uuid; o2 uuid; o3 uuid; t1 bigint; t2 bigint; t3 bigint;
  admin uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); r text; l late_payments%rowtype; pay_status text; ini uuid;
begin
  select pv.store_id, pv.id into s, v from product_variants pv where pv.is_active order by pv.id limit 1;
  if s is null then raise exception 'UA0 needs a seeded active variant'; end if;
  insert into auth.users (id, email) values (admin, 'ua-admin-' || admin::text || '@example.test');
  insert into profiles (id, full_name) values (admin, 'UA Admin') on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (admin) on conflict do nothing;
  update inventory set on_hand = 50, reserved = 0 where variant_id = v;
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('9', 64), now() + interval '1 day') returning id into sess;

  -- Three online orders; each gets a pending payment row and no provider order yet.
  perform pg_temp.fill_cart(s, sess, v);
  res := guest_checkout_place(s, sess, 'ua-key-0001-aaaa', pg_temp.plan(v, 1));
  o1 := (res ->> 'order_id')::uuid; select total_paise into t1 from orders where id = o1; perform pg_temp.pending_payment(s, o1, t1);
  perform pg_temp.fill_cart(s, sess, v);
  res := guest_checkout_place(s, sess, 'ua-key-0002-bbbb', pg_temp.plan(v, 1));
  o2 := (res ->> 'order_id')::uuid; select total_paise into t2 from orders where id = o2; perform pg_temp.pending_payment(s, o2, t2);
  perform pg_temp.fill_cart(s, sess, v);
  res := guest_checkout_place(s, sess, 'ua-key-0003-cccc', pg_temp.plan(v, 1));
  o3 := (res ->> 'order_id')::uuid; select total_paise into t3 from orders where id = o3; perform pg_temp.pending_payment(s, o3, t3);

  -- An unattached verified payment is recorded as unmatched (no store, no order): the state the attribution starts from.
  perform settle_online_payment('simulator', 'ua-order-1', 'ua-pay-1', t1, true, null);
  if (select count(*) from late_payments where provider_payment_id = 'ua-pay-1' and store_id is null) <> 1 then
    raise exception 'UA1 setup failed: payment was not recorded as unmatched';
  end if;

  -- UA1: a platform administrator attributes it to its order: paid once, stock consumed once, and the record is closed.
  r := unmatched_payment_attribute(admin, 'simulator', 'ua-pay-1', 'ua-order-1', t1, o1, 'verified against provider order and receipt');
  select status into pay_status from payments where order_id = o1;
  select * into l from late_payments where provider_payment_id = 'ua-pay-1';
  if r <> 'attributed_and_paid' or pay_status <> 'PAID' or l.store_id <> s or l.order_id <> o1 or l.status <> 'attributed' then
    raise exception 'UA1 FAILED: result %, payment %, late %/%/%', r, pay_status, l.store_id, l.order_id, l.status;
  end if;
  -- Order 1 consumed one unit; orders 2 and 3 still hold their reservations (one each).
  if (select on_hand from inventory where variant_id = v) <> 49 or (select reserved from inventory where variant_id = v) <> 2 then
    raise exception 'UA1 FAILED: stock not consumed exactly once';
  end if;
  raise notice 'UA1 ok: attributed by the administrator, settled once, record closed as attributed';

  -- UA2: the same record cannot be attributed twice.
  r := pg_temp.sqlstate_of(format('select unmatched_payment_attribute(%L,%L,%L,%L,%s,%L,%L)',
        admin, 'simulator', 'ua-pay-1', 'ua-order-1', t1, o1, 'second attempt'));
  if r not like 'P0001%' then raise exception 'UA2 FAILED: %', r; end if;
  raise notice 'UA2 ok: a decided record cannot be attributed again';

  -- UA3: provider evidence that differs from the recorded amount is refused, and nothing changes.
  perform settle_online_payment('simulator', 'ua-order-3', 'ua-pay-3', t3 + 100, true, null);
  r := pg_temp.sqlstate_of(format('select unmatched_payment_attribute(%L,%L,%L,%L,%s,%L,%L)',
        admin, 'simulator', 'ua-pay-3', 'ua-order-3', t3, o3, 'wrong amount'));
  if r not like '22023%' then raise exception 'UA3 FAILED: %', r; end if;
  if (select status from late_payments where provider_payment_id = 'ua-pay-3') <> 'open' then raise exception 'UA3 FAILED: record changed'; end if;
  raise notice 'UA3 ok: mismatched amount refused, record still open';

  -- UA4: a caller who is not a platform administrator cannot attribute, whatever store or order they name.
  r := pg_temp.sqlstate_of(format('select unmatched_payment_attribute(%L,%L,%L,%L,%s,%L,%L)',
        stranger, 'simulator', 'ua-pay-3', 'ua-order-3', t3 + 100, o3, 'not an admin'));
  if r not like '42501%' then raise exception 'UA4 FAILED: %', r; end if;
  raise notice 'UA4 ok: non-administrator refused';

  -- UA5: a cancelled order cannot take the payment; it goes to the owner's late-payment queue, not to the order.
  update orders set order_status = 'CANCELLED' where id = o2;
  perform settle_online_payment('simulator', 'ua-order-2', 'ua-pay-2', t2, true, null);
  r := unmatched_payment_attribute(admin, 'simulator', 'ua-pay-2', 'ua-order-2', t2, o2, 'order was cancelled; owner decides');
  select * into l from late_payments where provider_payment_id = 'ua-pay-2';
  select status into pay_status from payments where order_id = o2;
  if r <> 'attributed_for_owner_review' or l.store_id <> s or l.reason <> 'after_cancellation' or l.status <> 'open' or pay_status = 'PAID' then
    raise exception 'UA5 FAILED: result %, reason %, status %, payment %', r, l.reason, l.status, pay_status;
  end if;
  raise notice 'UA5 ok: cancelled order routed to the owner review queue, not paid';

  -- UA6: an order that is already paid by another payment is refused for manual investigation.
  perform settle_online_payment('simulator', 'ua-order-6', 'ua-pay-6', t1, true, null);
  r := pg_temp.sqlstate_of(format('select unmatched_payment_attribute(%L,%L,%L,%L,%s,%L,%L)',
        admin, 'simulator', 'ua-pay-6', 'ua-order-6', t1, o1, 'second payment for a paid order'));
  if r not like 'P0001%' then raise exception 'UA6 FAILED: %', r; end if;
  raise notice 'UA6 ok: second payment for a paid order refused for manual investigation';

  -- UA7: "confirm no order" can no longer refuse an attempt (which would reopen checkout for a second payment).
  insert into payment_initialisations (store_id, order_id, provider, expected_amount_paise, currency, status, attempts)
    values (s, o3, 'simulator', t3, 'INR', 'uncertain', 1) returning id into ini;
  r := pg_temp.sqlstate_of(format('select guest_payment_init_reconcile(%L,%L,%L,%L,%L)',
        ini, admin, 'confirm_no_order', null, 'checked the dashboard, nothing found'));
  if r not like '0A000%' then raise exception 'UA7 FAILED: %', r; end if;
  if (select status from payment_initialisations where id = ini) <> 'uncertain' then raise exception 'UA7 FAILED: attempt changed'; end if;
  raise notice 'UA7 ok: confirm-no-order refused; the attempt stays uncertain and checkout stays closed';
end $$;

rollback;
