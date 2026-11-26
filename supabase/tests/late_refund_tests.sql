-- ZENTRO BuildMart: tests for migration 0051 (late-payment refunds). Simulated provider only; rolled back. L1-L7.
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
    'method', p_method, 'customer_name', p_name, 'customer_mobile', '9999900003', 'supply_state_code', '33', 'customer_email', null,
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
  v_var uuid; v_sess uuid; v_cart uuid; v_res jsonb; v_order uuid; v_total bigint;
  v_init uuid; v_late uuid; v_refund uuid; v_refund2 jsonb; v_r text; v_state text;
  v_owner uuid := gen_random_uuid(); v_stranger uuid := gen_random_uuid(); v_admin uuid := gen_random_uuid();
  v_count integer; v_stock_before integer; v_stock_after integer; v_pay_status text; v_ord_pay text; v_ord_status text;
  v_rf refunds%rowtype; v_exp jsonb;
begin
  insert into auth.users (id, email) values
    (v_owner, 'lr-o-' || v_owner::text || '@example.test'), (v_stranger, 'lr-s-' || v_stranger::text || '@example.test'),
    (v_admin, 'lr-a-' || v_admin::text || '@example.test');
  insert into profiles (id, full_name) values (v_owner, 'LR Owner'), (v_stranger, 'LR Stranger'), (v_admin, 'LR Admin')
    on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (v_admin) on conflict do nothing;
  insert into store_owners (store_id, profile_id, role, is_active) values (store_a, v_owner, 'owner', true);

  select pv.id into v_var from product_variants pv where pv.sku = 'AMB-V001';
  update inventory set on_hand = 500, reserved = 0 where variant_id = v_var;
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 1);

  v_res := guest_checkout_place(store_a, v_sess, 'lr-key-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'online', 'Guest LR'));
  v_order := (v_res ->> 'order_id')::uuid;
  select total_paise into v_total from orders where id = v_order;
  v_init := (guest_payment_init_claim(v_order, 'razorpay') ->> 'init_id')::uuid;
  perform guest_payment_init_finish(v_init, 'created', 'rzp_lr_' || v_order::text, v_total, 'INR', null);
  perform guest_payment_init_attach(v_init);

  -- The reservation expires unpaid; the expiry run cancels the order and expires the attempt.
  update orders set reservation_expires_at = now() - interval '1 minute' where id = v_order;
  v_exp := expire_stale_payments();
  if (select order_status from orders where id = v_order) <> 'CANCELLED' then raise exception 'setup: order not cancelled'; end if;

  -- The verified payment arrives after expiry: recorded for review, and the attempt carries the provider payment id.
  v_r := settle_online_payment('razorpay', 'rzp_lr_' || v_order::text, 'pay_lr_1', v_total, true, null);
  select id into v_late from late_payments where provider_payment_id = 'pay_lr_1';
  if v_r <> 'late_payment_requires_review' or v_late is null
     or (select provider_payment_id from payments where order_id = v_order) <> 'pay_lr_1' then
    raise exception 'setup FAILED: % %', v_r, v_late;
  end if;

  -- L1: a refund needs an owner's decision first; a stranger cannot make it.
  v_state := pg_temp.sqlstate_of(format($f$select late_payment_refund_request(%L,%L,'lr-refund-key-1')$f$, v_late, v_owner));
  if v_state not like 'P0001:%record a refund decision first%' then raise exception 'L1 FAILED: %', v_state; end if;
  v_state := pg_temp.sqlstate_of(format($f$select late_payment_decide(%L,%L,'refund','not my store')$f$, v_late, v_stranger));
  if v_state not like '42501:%' then raise exception 'L1 FAILED: stranger decided: %', v_state; end if;
  if late_payment_decide(v_late, v_owner, 'refund', 'Not fulfilled: stock was sold to another customer') <> 'decided' then
    raise exception 'L1 FAILED: owner decision';
  end if;
  raise notice 'L1 ok: decision needed; only the owner decides';

  -- L2: the refund request creates one late-payment refund; the payment and order keep their states.
  v_refund2 := late_payment_refund_request(v_late, v_owner, 'lr-refund-key-1');
  select * into v_rf from refunds where id = (v_refund2 ->> 'refund_id')::uuid;
  if v_rf.refund_type <> 'late_payment' or v_rf.status <> 'requested' or v_rf.amount_paise <> v_total
     or v_rf.payment_id <> (select id from payments where order_id = v_order) then
    raise exception 'L2 FAILED: %', v_refund2;
  end if;
  select status into v_pay_status from payments where order_id = v_order;
  select payment_status, order_status into v_ord_pay, v_ord_status from orders where id = v_order;
  if v_pay_status <> 'EXPIRED' or v_ord_pay <> 'EXPIRED' or v_ord_status <> 'CANCELLED' then
    raise exception 'L2 FAILED: states changed before the provider confirmed';
  end if;
  raise notice 'L2 ok: refund requested, no state changed before provider confirmation';

  -- L3: the same late payment asks again: the first refund is returned, nothing is added.
  v_refund2 := late_payment_refund_request(v_late, v_owner, 'lr-refund-key-2');
  select count(*) into v_count from refunds where order_id = v_order;
  if (v_refund2 ->> 'replayed')::boolean is not true or v_count <> 1 then
    raise exception 'L3 FAILED: % rows %', v_refund2, v_count;
  end if;
  raise notice 'L3 ok: duplicate request creates no second refund';

  -- L4: a provider success finalises the refund without changing the payment, order or stock.
  select inventory.on_hand - inventory.reserved into v_stock_before from inventory where variant_id = v_var;
  update refunds set provider_refund_id = 'rfnd_lr_1' where id = v_rf.id;
  v_r := settle_refund('rfnd_lr_1', true, null, v_total);
  select status into v_pay_status from payments where order_id = v_order;
  select payment_status, order_status into v_ord_pay, v_ord_status from orders where id = v_order;
  select inventory.on_hand - inventory.reserved into v_stock_after from inventory where variant_id = v_var;
  if v_r <> 'succeeded' or (select status from refunds where id = v_rf.id) <> 'succeeded'
     or v_pay_status <> 'EXPIRED' or v_ord_pay <> 'EXPIRED' or v_ord_status <> 'CANCELLED'
     or v_stock_after <> v_stock_before then
    raise exception 'L4 FAILED: % pay % ord % stock % -> %', v_r, v_pay_status, v_ord_pay, v_stock_before, v_stock_after;
  end if;
  raise notice 'L4 ok: provider success finalises without touching sale states or stock';

  -- L5: a duplicate provider success is harmless, and a repeated late notification adds no second case.
  v_r := settle_refund('rfnd_lr_1', true, null, v_total);
  if v_r <> 'duplicate' then raise exception 'L5 FAILED refund: %', v_r; end if;
  v_r := settle_online_payment('razorpay', 'rzp_lr_' || v_order::text, 'pay_lr_1', v_total, true, null);
  select count(*) into v_count from late_payments where provider_payment_id = 'pay_lr_1';
  if v_count <> 1 then raise exception 'L5 FAILED: % late rows', v_count; end if;
  raise notice 'L5 ok: duplicate notifications are harmless';

  -- L6: an unattributed verified payment (unknown provider order) cannot be refunded automatically.
  v_r := settle_online_payment('razorpay', 'rzp_unknown_l6', 'pay_lr_6', 777, true, null);
  if v_r <> 'unmatched_payment_recorded' then raise exception 'L6 FAILED: %', v_r; end if;
  select id into v_late from late_payments where provider_payment_id = 'pay_lr_6';
  if late_payment_decide(v_late, v_admin, 'refund', 'Investigating provider order') <> 'decided' then
    raise exception 'L6 FAILED: admin decision';
  end if;
  v_state := pg_temp.sqlstate_of(format($f$select late_payment_refund_request(%L,%L,'lr-refund-key-6')$f$, v_late, v_admin));
  if v_state not like 'P0001:%not attributed to a store%' then raise exception 'L6 FAILED: %', v_state; end if;
  raise notice 'L6 ok: unattributed payments are not refunded automatically';

  -- L7: a verified payment with an amount that differs from the recorded attempt is kept, not refunded.
  update carts set status = 'active' where id = v_cart;
  v_res := guest_checkout_place(store_a, v_sess, 'lr-key7-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'online', 'Guest LR7'));
  v_order := (v_res ->> 'order_id')::uuid;
  select total_paise into v_total from orders where id = v_order;
  v_init := (guest_payment_init_claim(v_order, 'razorpay') ->> 'init_id')::uuid;
  perform guest_payment_init_finish(v_init, 'created', 'rzp_lr7_' || v_order::text, v_total, 'INR', null);
  perform guest_payment_init_attach(v_init);
  update orders set reservation_expires_at = now() - interval '1 minute' where id = v_order;
  perform expire_stale_payments();
  v_r := settle_online_payment('razorpay', 'rzp_lr7_' || v_order::text, 'pay_lr_7', v_total + 5, true, null);
  select id into v_late from late_payments where provider_payment_id = 'pay_lr_7';
  if v_late is null then raise exception 'L7 FAILED: mismatch not kept for review (%)', v_r; end if;
  perform late_payment_decide(v_late, v_owner, 'refund', 'Amount differs; checking');
  v_state := pg_temp.sqlstate_of(format($f$select late_payment_refund_request(%L,%L,'lr-refund-key-7')$f$, v_late, v_owner));
  if v_state not like 'P0001:%does not match%' and v_state not like 'P0001:%not in a late state%' then
    raise exception 'L7 FAILED: %', v_state;
  end if;
  raise notice 'L7 ok: mismatched late payment is retained, not refunded';
end $$;

rollback;
