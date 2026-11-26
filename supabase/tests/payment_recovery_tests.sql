-- ZENTRO BuildMart: tests for migration 0050 (payment initialisation, late payments, expiry). Simulated provider
-- outcomes only; no Razorpay call. Rolled back at the end. R1-R10.
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
    'method', p_method, 'customer_name', p_name, 'customer_mobile', '9999900002', 'supply_state_code', '33', 'customer_email', null,
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
  v_var uuid; v_sess uuid; v_cart uuid;
  v_res jsonb; v_order uuid; v_order2 uuid; v_order3 uuid; v_order4 uuid;
  v_claim jsonb; v_init uuid; v_init2 uuid; v_fin jsonb; v_pay uuid; v_state text;
  v_admin uuid := gen_random_uuid(); v_owner uuid := gen_random_uuid(); v_stranger uuid := gen_random_uuid();
  v_count integer; v_used_before integer; v_used_after integer; v_coupon uuid; v_late uuid; v_r text; v_exp jsonb;
  v_total bigint; v_status text;
  v_amt bigint;
begin
  insert into auth.users (id, email) values
    (v_admin, 'pr-admin-' || v_admin::text || '@example.test'),
    (v_owner, 'pr-owner-' || v_owner::text || '@example.test');
  insert into profiles (id, full_name) values (v_admin, 'PR Admin'), (v_owner, 'PR Owner') on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (v_admin) on conflict do nothing;
  insert into store_owners (store_id, profile_id, role, is_active) values (store_a, v_owner, 'owner', true);

  select pv.id into v_var from product_variants pv where pv.sku = 'AMB-V001';
  update inventory set on_hand = 500, reserved = 0 where variant_id = v_var;
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 1);

  v_res := guest_checkout_place(store_a, v_sess, 'pr-key-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'online', 'Guest PR'));
  v_order := (v_res ->> 'order_id')::uuid;
  select total_paise into v_total from orders where id = v_order;

  -- R1: the first claim records intent and returns the expected amount before any provider call.
  v_claim := guest_payment_init_claim(v_order, 'simulator');
  v_init := (v_claim ->> 'init_id')::uuid;
  if v_claim ->> 'action' <> 'call' or (v_claim ->> 'amount_paise')::bigint <> v_total then
    raise exception 'R1 FAILED: %', v_claim;
  end if;
  raise notice 'R1 ok: claim before provider call';

  -- R2: a second claim while the lease is live is busy and cannot call the provider.
  v_claim := guest_payment_init_claim(v_order, 'simulator');
  if v_claim ->> 'action' <> 'busy' then raise exception 'R2 FAILED: %', v_claim; end if;
  raise notice 'R2 ok: concurrent claim is busy';

  -- R3: a lapsed lease becomes uncertain and is never retried automatically, even for a user retry.
  update payment_initialisations set lease_until = now() - interval '1 second' where id = v_init;
  v_claim := guest_payment_init_claim(v_order, 'simulator');
  if v_claim ->> 'action' <> 'uncertain' then raise exception 'R3 FAILED: %', v_claim; end if;
  v_claim := guest_payment_init_claim(v_order, 'simulator', true);
  if v_claim ->> 'action' <> 'uncertain' then raise exception 'R3 FAILED (retry): %', v_claim; end if;
  if (select reconciliation_status from payment_initialisations where id = v_init) <> 'required' then
    raise exception 'R3 FAILED: uncertain outcome not flagged for reconciliation';
  end if;
  raise notice 'R3 ok: lapsed lease is uncertain, not repeated';

  -- R4: a created provider order with the right amount is stored, then attached, and the claim reports attached.
  -- (A separate order, so the uncertain order above stays as it is.)
  update carts set status = 'active' where id = v_cart;
  v_res := guest_checkout_place(store_a, v_sess, 'pr-key2-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'online', 'Guest PR2'));
  v_order2 := (v_res ->> 'order_id')::uuid;
  v_claim := guest_payment_init_claim(v_order2, 'simulator');
  v_init2 := (v_claim ->> 'init_id')::uuid;
  v_fin := guest_payment_init_finish(v_init2, 'created', 'sim_pr4_' || v_order2::text, v_total, 'INR', null);
  if v_fin ->> 'action' <> 'created' then raise exception 'R4 FAILED finish: %', v_fin; end if;
  v_fin := guest_payment_init_attach(v_init2);
  if v_fin ->> 'action' <> 'attached' or not exists (select 1 from payments where order_id = v_order2 and provider_order_id = 'sim_pr4_' || v_order2::text) then
    raise exception 'R4 FAILED attach: %', v_fin;
  end if;
  if guest_payment_init_claim(v_order2, 'simulator') ->> 'action' <> 'attached' then raise exception 'R4 FAILED: claim after attach'; end if;
  raise notice 'R4 ok: created, attached, idempotent';

  -- R5: an amount mismatch is held for review and never attached; only a platform administrator can adopt it.
  update carts set status = 'active' where id = v_cart;
  v_res := guest_checkout_place(store_a, v_sess, 'pr-key3-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'online', 'Guest PR3'));
  v_order3 := (v_res ->> 'order_id')::uuid;
  v_init := (guest_payment_init_claim(v_order3, 'simulator') ->> 'init_id')::uuid;
  v_fin := guest_payment_init_finish(v_init, 'created', 'sim_pr5_' || v_order3::text, v_total + 1, 'INR', null);
  if v_fin ->> 'action' <> 'amount_mismatch' or exists (select 1 from payments where order_id = v_order3) then
    raise exception 'R5 FAILED: %', v_fin;
  end if;
  if guest_payment_init_claim(v_order3, 'simulator') ->> 'action' <> 'review' then raise exception 'R5 FAILED: claim'; end if;
  v_state := pg_temp.sqlstate_of(format($f$select guest_payment_init_reconcile(%L,%L,'adopt','sim_pr5_%s','checked with provider')$f$,
                                        v_init, v_stranger, v_order3::text));
  if v_state not like '42501:%' then raise exception 'R5 FAILED: non-admin reconciled: %', v_state; end if;
  v_state := pg_temp.sqlstate_of(format($f$select guest_payment_init_reconcile(%L,%L,'adopt','sim_pr5_%s','')$f$,
                                        v_init, v_admin, v_order3::text));
  if v_state not like '22023:%' then raise exception 'R5 FAILED: note not required: %', v_state; end if;
  v_fin := guest_payment_init_reconcile(v_init, v_admin, 'adopt', 'sim_pr5_' || v_order3::text, 'Checked in provider dashboard');
  if v_fin ->> 'status' <> 'created' then raise exception 'R5 FAILED adopt: %', v_fin; end if;
  if guest_payment_init_attach(v_init) ->> 'action' <> 'attached' then raise exception 'R5 FAILED attach after adopt'; end if;
  raise notice 'R5 ok: mismatch held, reconciliation needs administrator and note';

  -- R6: a provider refusal is recorded; a retry needs a user action, and the automatic path never repeats it.
  update carts set status = 'active' where id = v_cart;
  v_res := guest_checkout_place(store_a, v_sess, 'pr-key4-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'online', 'Guest PR4'));
  v_order4 := (v_res ->> 'order_id')::uuid;
  v_init := (guest_payment_init_claim(v_order4, 'simulator') ->> 'init_id')::uuid;
  v_fin := guest_payment_init_finish(v_init, 'refused', null, null, null, 'BAD_REQUEST_ERROR: invalid amount');
  if v_fin ->> 'action' <> 'refused' then raise exception 'R6 FAILED: %', v_fin; end if;
  if guest_payment_init_claim(v_order4, 'simulator') ->> 'action' <> 'refused' then raise exception 'R6 FAILED: automatic retry'; end if;
  if guest_payment_init_claim(v_order4, 'simulator', true) ->> 'action' <> 'call' then raise exception 'R6 FAILED: user retry'; end if;
  raise notice 'R6 ok: refusal recorded, retry only on user action';

  -- R7: a verified payment for an order we never recorded is kept for review; a repeat adds nothing.
  v_r := settle_online_payment('simulator', 'unknown_order_r7', 'pay_r7', 4321, true, null);
  if v_r <> 'unmatched_payment_recorded' then raise exception 'R7 FAILED: %', v_r; end if;
  v_r := settle_online_payment('simulator', 'unknown_order_r7', 'pay_r7', 4321, true, null);
  select count(*) into v_count from late_payments where provider_payment_id = 'pay_r7';
  if v_count <> 1 then raise exception 'R7 FAILED: % rows', v_count; end if;
  raise notice 'R7 ok: unmatched verified payment kept once';

  -- R8: a payment for a created but unattached provider order is routed to review with its order.
  update carts set status = 'active' where id = v_cart;
  v_res := guest_checkout_place(store_a, v_sess, 'pr-key5-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'online', 'Guest PR5'));
  v_order := (v_res ->> 'order_id')::uuid;
  v_init := (guest_payment_init_claim(v_order, 'simulator') ->> 'init_id')::uuid;
  perform guest_payment_init_finish(v_init, 'created', 'sim_pr8_' || v_order::text, v_total, 'INR', null);
  v_r := settle_online_payment('simulator', 'sim_pr8_' || v_order::text, 'pay_r8', v_total, true, null);
  if v_r <> 'late_payment_requires_review' or not exists (
       select 1 from late_payments where provider_payment_id = 'pay_r8' and order_id = v_order and reason = 'provider_order_not_attached')
  then raise exception 'R8 FAILED: %', v_r; end if;
  raise notice 'R8 ok: unattached provider order payment routed to review';

  -- R9: expiry releases the coupon counted on an unpaid order; a repeat run releases nothing more.
  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, is_active, used_count)
  values (store_a, 'PR9' || upper(substr(md5(random()::text), 1, 6)), 'percent', 1000, 0, true, 1) returning id into v_coupon;
  insert into coupon_redemptions (store_id, coupon_id, order_id, discount_paise) values (store_a, v_coupon, v_order4, 0);
  update orders set reservation_expires_at = now() - interval '1 minute' where id = v_order4;
  select used_count into v_used_before from coupons where id = v_coupon;
  v_exp := expire_stale_payments();
  select used_count into v_used_after from coupons where id = v_coupon;
  if v_used_after <> v_used_before - 1 or exists (select 1 from coupon_redemptions where order_id = v_order4) then
    raise exception 'R9 FAILED: coupon not released (% -> %)', v_used_before, v_used_after;
  end if;
  if (select status from payment_initialisations where order_id = v_order4) <> 'expired' then
    raise exception 'R9 FAILED: refused initialisation not expired';
  end if;
  v_exp := expire_stale_payments();
  select used_count into v_used_after from coupons where id = v_coupon;
  if v_used_after <> v_used_before - 1 then raise exception 'R9 FAILED: second run changed usage'; end if;
  raise notice 'R9 ok: expiry releases coupon once and marks initialisation';

  -- R10: late-payment decisions need an owner of the store (or a platform administrator for unmatched rows),
  -- move once, and a repeat is refused.
  select id into v_late from late_payments where provider_payment_id = 'pay_r8';
  v_state := pg_temp.sqlstate_of(format($f$select late_payment_decide(%L,%L,'dismiss','not my store')$f$, v_late, v_stranger));
  if v_state not like '42501:%' then raise exception 'R10 FAILED: stranger decided: %', v_state; end if;
  v_r := late_payment_decide(v_late, v_owner, 'fulfil', 'Stock is still available; approved');
  if v_r <> 'decided' or (select status from late_payments where id = v_late) <> 'fulfilment_approved' then
    raise exception 'R10 FAILED decide';
  end if;
  v_state := pg_temp.sqlstate_of(format($f$select late_payment_decide(%L,%L,'dismiss','again')$f$, v_late, v_owner));
  if v_state not like 'P0001:%' then raise exception 'R10 FAILED: second decision allowed: %', v_state; end if;
  v_state := pg_temp.sqlstate_of(format($f$select late_payment_decide(%L,%L,'dismiss','x')$f$,
                 (select id from late_payments where provider_payment_id = 'pay_r7'), v_owner));
  if v_state not like '42501:%' then raise exception 'R10 FAILED: store owner decided unmatched row: %', v_state; end if;
  if late_payment_decide((select id from late_payments where provider_payment_id = 'pay_r7'), v_admin, 'dismiss', 'duplicate test row') <> 'decided' then
    raise exception 'R10 FAILED: admin could not decide unmatched row';
  end if;
  raise notice 'R10 ok: late payments decided by authorised actors once';
end $$;

rollback;
