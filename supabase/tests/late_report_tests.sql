-- ZENTRO BuildMart: exact-value tests for migration 0053 (late-payment refunds excluded from ordinary
-- refund reporting; reported separately). Simulated fixtures only; rolled back. LR1-LR4.
-- Assertions compare deltas against a baseline captured in this transaction, so seeded rows cannot change them.
\set ON_ERROR_STOP on
begin;

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
    'method', p_method, 'customer_name', p_name, 'customer_mobile', '9999900004', 'supply_state_code', '33', 'customer_email', null,
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
  t0 timestamptz := now();
  t1 timestamptz := now() + interval '1 day';
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_var uuid; v_sess uuid; v_cart uuid; v_res jsonb; v_order uuid; v_total bigint; v_tax bigint;
  v_owner uuid := gen_random_uuid();
  v_ref_ord uuid; v_ref_late uuid; v_ref_pend uuid; v_ref_late_pend uuid; v_late1 uuid;
  b_sum jsonb; a_sum jsonb; b_trend bigint; a_trend bigint; b_tax bigint; a_tax bigint; b_taxest bigint; a_taxest bigint;
  b_qr bigint; a_qr bigint; v_qr_ev uuid; v_qr_code uuid; v_rec jsonb; v_expected_taxest bigint;
begin
  insert into auth.users (id, email) values (v_owner, 'lr-rpt-' || v_owner::text || '@example.test');
  insert into profiles (id, full_name) values (v_owner, 'LR Report Owner') on conflict (id) do nothing;
  insert into store_owners (store_id, profile_id, role, is_active) values (store_a, v_owner, 'owner', true);

  select pv.id into v_var from product_variants pv where pv.sku = 'AMB-V001';
  update inventory set on_hand = 500, reserved = 0 where variant_id = v_var;
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 1);
  v_res := guest_checkout_place(store_a, v_sess, 'lr-rpt-key-' || substr(gen_random_uuid()::text, 1, 10),
                                pg_temp.plan(v_var, 1, 'cash', 'Guest LR Report'));
  v_order := (v_res ->> 'order_id')::uuid;
  select total_paise, tax_paise into v_total, v_tax from orders where id = v_order;
  update orders set payment_status = 'PAID' where id = v_order;

  -- Baseline (before any report fixture rows exist in this transaction).
  b_sum := report_summary(store_a, t0, t1, today, today);
  select coalesce(sum(refunds_paise), 0) into b_trend from report_trend(store_a, t0, t1, 'day');
  select refunds_paise, estimated_tax_paise into b_tax, b_taxest from report_refund_tax(store_a, t0, t1);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_owner::text)::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  select coalesce(sum(refunded_paise), 0) into b_qr from zb_qr_summary(store_a, today, today);

  -- Fixtures (all created_at = t0, inside the window).
  insert into refunds (store_id, order_id, amount_paise, status, reason, refund_method, refund_type)
  values (store_a, v_order, 1000, 'succeeded', 'ordinary', 'credit', 'full') returning id into v_ref_ord;
  insert into refunds (store_id, order_id, amount_paise, status, reason, refund_method, refund_type)
  values (store_a, v_order, 5000, 'succeeded', 'late', 'credit', 'late_payment') returning id into v_ref_late;
  insert into refunds (store_id, order_id, amount_paise, status, reason, refund_method, refund_type)
  values (store_a, v_order, 300, 'requested', 'ordinary pending', 'credit', 'full') returning id into v_ref_pend;
  insert into refunds (store_id, order_id, amount_paise, status, reason, refund_method, refund_type)
  values (store_a, v_order, 700, 'processing', 'late pending', 'credit', 'late_payment') returning id into v_ref_late_pend;

  insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason, status, refund_id)
  values (store_a, v_order, 'razorpay', 'rzp_lr_rpt', 'pay_lr_rpt_1', 5000, 'after_reservation_expiry', 'refund_requested', v_ref_late)
  returning id into v_late1;
  insert into late_payments (store_id, order_id, provider, provider_payment_id, amount_paise, reason, status)
  values (store_a, null, 'razorpay', 'pay_lr_rpt_2', 900, 'amount_mismatch', 'open');

  -- LR1: report_summary excludes late-payment refunds from refunds and pending refunds exactly.
  a_sum := report_summary(store_a, t0, t1, today, today);
  if (a_sum->>'refundsPaise')::bigint - (b_sum->>'refundsPaise')::bigint <> 1000
     or (a_sum->>'refundCount')::bigint - (b_sum->>'refundCount')::bigint <> 1
     or (a_sum->>'refundPendingPaise')::bigint - (b_sum->>'refundPendingPaise')::bigint <> 300
     or (a_sum->>'refundPendingCount')::bigint - (b_sum->>'refundPendingCount')::bigint <> 1 then
    raise exception 'LR1 FAILED: summary refund deltas wrong: %', a_sum;
  end if;
  raise notice 'LR1 ok: summary refunds +1000 (1 row), pending +300 (1 row); late 5000 and 700 excluded';

  -- LR2: report_trend refunds sum excludes late-payment refunds exactly.
  select coalesce(sum(refunds_paise), 0) into a_trend from report_trend(store_a, t0, t1, 'day');
  if a_trend - b_trend <> 1000 then raise exception 'LR2 FAILED: trend delta % expected 1000', a_trend - b_trend; end if;
  raise notice 'LR2 ok: trend refund delta 1000';

  -- LR3: report_refund_tax excludes late refunds; tax estimate matches the ordinary refund only.
  select refunds_paise, estimated_tax_paise into a_tax, a_taxest from report_refund_tax(store_a, t0, t1);
  v_expected_taxest := round(1000::numeric * v_tax / nullif(v_total, 0))::bigint;
  if a_tax - b_tax <> 1000 or a_taxest - b_taxest <> v_expected_taxest then
    raise exception 'LR3 FAILED: refund tax delta % / % expected 1000 / %', a_tax - b_tax, a_taxest - b_taxest, v_expected_taxest;
  end if;
  raise notice 'LR3 ok: refund tax base 1000, estimated tax %', v_expected_taxest;

  -- LR4: late-payment reconciliation report is exact, and QR refunded total excludes late refunds.
  v_rec := report_late_payment_reconciliation(store_a, t0, t1);
  if (v_rec->>'lateReceivedCount')::bigint <> 2 or (v_rec->>'lateReceivedPaise')::bigint <> 5900
     or (v_rec->>'lateOpenCount')::bigint <> 1 or (v_rec->>'lateOpenPaise')::bigint <> 900
     or (v_rec->>'lateRefundRequestedCount')::bigint <> 1
     or (v_rec->>'lateRefundSucceededCount')::bigint <> 1 or (v_rec->>'lateRefundSucceededPaise')::bigint <> 5000
     or (v_rec->>'lateRefundPendingCount')::bigint <> 1 or (v_rec->>'lateRefundPendingPaise')::bigint <> 700 then
    raise exception 'LR4 FAILED: reconciliation %', v_rec;
  end if;

  -- QR: the order is attributed and paid, so it is in the QR refunded total only through ordinary refunds.
  select id into v_qr_code from qr_codes where store_id = store_a and target_type = 'showroom';
  if v_qr_code is null then
    insert into qr_codes (store_id, target_type, target_id, public_url) values (store_a, 'showroom', null, 'https://x.test/lr-rpt')
      returning id into v_qr_code;
  end if;
  insert into qr_entry_events (store_id, qr_code_id, guest_session_id, entered_at) values (store_a, v_qr_code, v_sess, t0)
    returning id into v_qr_ev;
  insert into qr_order_attributions (order_id, store_id, qr_code_id, entry_event_id, guest_session_id, entered_at)
    values (v_order, store_a, v_qr_code, v_qr_ev, v_sess, t0);
  select coalesce(sum(refunded_paise), 0) into a_qr from zb_qr_summary(store_a, today, today);
  if a_qr - b_qr <> 1000 then raise exception 'LR4 FAILED: QR refunded delta % expected 1000', a_qr - b_qr; end if;
  raise notice 'LR4 ok: reconciliation exact (received 5900, open 900, late refunds 5000 succeeded / 700 pending); QR refunded delta 1000';
end $$;

rollback;
