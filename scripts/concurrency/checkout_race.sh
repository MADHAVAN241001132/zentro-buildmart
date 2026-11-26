#!/usr/bin/env bash
# Two-session checkout races against a clone of the migrated database. Each scenario holds a transaction open in
# one session, starts the second session while the first is still open, and then asserts the final state.
#   A  duplicate submission with the same request key       -> one order, the second replays
#   B  two customers for the final unit of stock             -> one order, stock never negative
#   C  settlement racing reservation expiry                  -> one consistent outcome, no lost payment
#   D  two concurrent provider-initialisation claims         -> one provider call recorded
#   E  two concurrent provider-order attachments             -> one payment attempt
#   F  settlement wins against reservation expiry            -> paid once, order kept, stock consumed once
#   G  expiry wins against settlement                        -> no ordinary payment, one late payment
#   H  settlement racing cancellation                        -> one consistent outcome, no duplicate refund
#   I  coupon redemption at its usage limit                  -> one order carries the last use
#   J  concurrent cash confirmation                          -> one payment, one invoice, stock once
#   K  concurrent invoice generation                         -> one invoice, counter advances once
#   L  overlapping adds from two requests to one cart line   -> quantity exact, no lost update
#   M  the same request step submitted twice at once         -> added once
# Run as a PostgreSQL superuser: sudo -u postgres bash scripts/concurrency/checkout_race.sh
set -u
DB="${CONC_DB:-zentro_conc_checkout}"
TEMPLATE="${CONC_TEMPLATE:-zentro_v6}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STORE='11111111-1111-4111-8111-111111111111'
S1='00000000-0000-0000-0000-0000000000a1'
S2='00000000-0000-0000-0000-0000000000a2'
C1='00000000-0000-0000-0000-0000000000b1'
C2='00000000-0000-0000-0000-0000000000b2'

fail=0
pass() { echo "PASS: $1"; }
miss() { echo "FAIL: $1"; fail=1; }
q() { psql -tA -d "$DB" -c "$1"; }

fresh() {
  psql -q -d postgres -c "drop database if exists $DB" >/dev/null
  createdb -T "$TEMPLATE" "$DB" || { echo "could not create $DB from $TEMPLATE"; exit 2; }
  psql -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null <<SQL
insert into stores (id, slug, name, status) values ('$STORE', 'checkout-race', 'Checkout race', 'active')
  on conflict (id) do nothing;
insert into store_settings (store_id) values ('$STORE') on conflict (store_id) do nothing;
insert into guest_sessions (id, store_id, token_hash, expires_at) values
  ('$S1', '$STORE', repeat('1', 64), now() + interval '1 day'),
  ('$S2', '$STORE', repeat('2', 64), now() + interval '1 day');
insert into carts (id, store_id, guest_session_id, status) values
  ('$C1', '$STORE', '$S1', 'active'), ('$C2', '$STORE', '$S2', 'active');
create or replace function public.conc_plan(p_variant uuid, p_qty numeric, p_method text, p_name text) returns jsonb
language plpgsql as \$f\$
declare v_price bigint; v_cost bigint; v_bps integer; v_sku text; v_label text; v_pname text; v_base bigint; v_tax bigint;
begin
  select pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name
    into v_price, v_cost, v_bps, v_sku, v_label, v_pname
  from product_variants pv join products pr on pr.id = pv.product_id where pv.id = p_variant;
  v_base := round(v_price::numeric * p_qty)::bigint;
  v_tax := round(v_base * v_bps / 10000.0)::bigint;
  return jsonb_build_object('method', p_method, 'customer_name', p_name, 'customer_mobile', '9999900004',
    'supply_state_code', '33', 'customer_email', null, 'coupon_code', null, 'subtotal_paise', v_base, 'discount_paise', 0, 'tax_paise', v_tax,
    'total_paise', v_base + v_tax, 'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', p_variant, 'quantity', p_qty,
      'unit_price_paise', v_price, 'cost_price_paise', v_cost, 'gst_rate_bps', v_bps, 'product_name', v_pname,
      'variant_label', v_label, 'sku', v_sku, 'hsn_code', null, 'discount_paise', 0, 'taxable_paise', v_base,
      'tax_paise', v_tax, 'line_total_paise', v_base + v_tax)));
end \$f\$;
SQL
}

variant() { q "select id from product_variants where sku = 'AMB-V001'"; }

# Runs two sessions: $1 starts first and holds its transaction; $2 starts 0.3 s later, while the first is open.
race() {
  psql -q -d "$DB" -f "$1" >"$TMP/a.out" 2>&1 & pa=$!
  sleep 0.3
  psql -q -d "$DB" -f "$2" >"$TMP/b.out" 2>&1 & pb=$!
  wait "$pa"; wait "$pb"
}

# ---------------- A: duplicate submission with the same key ----------------
fresh
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
cat > "$TMP/a1.sql" <<SQL
begin;
select guest_checkout_place('$STORE', '$S1', 'race-key-A-0001', conc_plan('$V', 1, 'cash', 'Dup A'));
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/a2.sql" <<SQL
begin;
select guest_checkout_place('$STORE', '$S1', 'race-key-A-0001', conc_plan('$V', 1, 'cash', 'Dup A'));
commit;
SQL
race "$TMP/a1.sql" "$TMP/a2.sql"
orders=$(q "select count(*) from orders where store_id = '$STORE' and customer_name = 'Dup A'")
reserved=$(q "select reserved from inventory where variant_id = '$V'")
replays=$(grep -c '"replayed": true\|"replayed":true' "$TMP/b.out" || true)
if [ "$orders" = "1" ] && [ "$reserved" = "1" ] && [ "$replays" -ge 1 ]; then
  pass "A same-key duplicate: 1 order, 1 reservation, second call replayed"
else
  miss "A same-key duplicate: orders=$orders reserved=$reserved replays=$replays ($(head -c 300 "$TMP/b.out"))"
fi

# ---------------- B: two customers for the final unit ----------------
fresh
V=$(variant)
q "update inventory set on_hand = 1, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1), ('$C2', '$STORE', '$V', 1)" >/dev/null
cat > "$TMP/b1.sql" <<SQL
begin;
select guest_checkout_place('$STORE', '$S1', 'race-key-B-0001', conc_plan('$V', 1, 'cash', 'Buyer One'));
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/b2.sql" <<SQL
begin;
select guest_checkout_place('$STORE', '$S2', 'race-key-B-0002', conc_plan('$V', 1, 'cash', 'Buyer Two'));
commit;
SQL
race "$TMP/b1.sql" "$TMP/b2.sql"
orders=$(q "select count(*) from orders where store_id = '$STORE' and customer_name in ('Buyer One','Buyer Two')")
on_hand=$(q "select on_hand from inventory where variant_id = '$V'")
reserved=$(q "select reserved from inventory where variant_id = '$V'")
refused=$(grep -c 'insufficient_stock' "$TMP/b.out" || true)
if [ "$orders" = "1" ] && [ "$reserved" -ge 0 ] && [ "$reserved" -le "$on_hand" ] && [ "$refused" -ge 1 ]; then
  pass "B final unit: 1 order, reserved $reserved of $on_hand, second buyer refused"
else
  miss "B final unit: orders=$orders on_hand=$on_hand reserved=$reserved refused=$refused"
fi

# ---------------- C: settlement racing reservation expiry ----------------
fresh
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
OID=$(q "select guest_checkout_place('$STORE', '$S1', 'race-key-C-0001', conc_plan('$V', 1, 'online', 'Payer C')) ->> 'order_id'")
TOTAL=$(q "select total_paise from orders where id = '$OID'")
INIT=$(q "select guest_payment_init_claim('$OID', 'simulator') ->> 'init_id'")
q "select guest_payment_init_finish('$INIT', 'created', 'sim_c_$OID', $TOTAL, 'INR', null)" >/dev/null
q "select guest_payment_init_attach('$INIT')" >/dev/null
q "update orders set reservation_expires_at = now() - interval '1 minute' where id = '$OID'" >/dev/null
cat > "$TMP/c1.sql" <<SQL
begin;
select settle_online_payment('simulator', 'sim_c_$OID', 'pay_c_1', $TOTAL, true, null);
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/c2.sql" <<SQL
begin;
select expire_stale_payments();
commit;
SQL
race "$TMP/c1.sql" "$TMP/c2.sql"
paid=$(q "select count(*) from payments where order_id = '$OID' and status = 'PAID'")
late=$(q "select count(*) from late_payments where order_id = '$OID' and provider_payment_id = 'pay_c_1'")
ostat=$(q "select order_status from orders where id = '$OID'")
reserved=$(q "select reserved from inventory where variant_id = '$V'")
attempts=$(q "select count(*) from payments where order_id = '$OID'")
consistent=0
if [ "$paid" = "1" ] && [ "$ostat" != "CANCELLED" ]; then consistent=1; fi
if [ "$paid" = "0" ] && [ "$late" = "1" ] && [ "$ostat" = "CANCELLED" ]; then consistent=1; fi
if [ "$attempts" = "1" ] && [ "$reserved" = "0" ] && [ "$consistent" = "1" ]; then
  pass "C settlement vs expiry: one consistent outcome (paid=$paid late=$late order=$ostat), stock released"
else
  miss "C settlement vs expiry: paid=$paid late=$late order=$ostat reserved=$reserved attempts=$attempts"
fi

# ---------------- D: two concurrent provider-initialisation claims ----------------
fresh
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
OID=$(q "select guest_checkout_place('$STORE', '$S1', 'race-key-D-0001', conc_plan('$V', 1, 'online', 'Payer D')) ->> 'order_id'")
cat > "$TMP/d1.sql" <<SQL
begin;
select guest_payment_init_claim('$OID', 'razorpay', false);
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/d2.sql" <<SQL
begin;
select guest_payment_init_claim('$OID', 'razorpay', false);
commit;
SQL
race "$TMP/d1.sql" "$TMP/d2.sql"
records=$(q "select count(*) from payment_initialisations where order_id = '$OID'")
claimed=$(q "select count(*) from payment_initialisation_attempts a join payment_initialisations i on i.id = a.init_id where i.order_id = '$OID' and a.outcome = 'claimed'")
busy=$(grep -c '"busy"' "$TMP/b.out" || true)
if [ "$records" = "1" ] && [ "$claimed" = "1" ] && [ "$busy" -ge 1 ]; then
  pass "D concurrent claims: one provider call recorded, the second was busy"
else
  miss "D concurrent claims: records=$records claimed=$claimed busy=$busy"
fi

# ---------------- E: two concurrent provider-order attachments ----------------
fresh
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
OID=$(q "select guest_checkout_place('$STORE', '$S1', 'race-key-E-0001', conc_plan('$V', 1, 'online', 'Payer E')) ->> 'order_id'")
TOTAL=$(q "select total_paise from orders where id = '$OID'")
INIT=$(q "select guest_payment_init_claim('$OID', 'simulator') ->> 'init_id'")
q "select guest_payment_init_finish('$INIT', 'created', 'sim_e_$OID', $TOTAL, 'INR', null)" >/dev/null
cat > "$TMP/e1.sql" <<SQL
begin;
select guest_payment_init_attach('$INIT');
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/e2.sql" <<SQL
begin;
select guest_payment_init_attach('$INIT');
commit;
SQL
race "$TMP/e1.sql" "$TMP/e2.sql"
pays=$(q "select count(*) from payments where order_id = '$OID'")
if [ "$pays" = "1" ]; then pass "E concurrent attachment: one payment attempt"; else miss "E concurrent attachment: payment attempts=$pays"; fi

# ---------------- Shared fixtures for the scenarios below ----------------
# A signed-in owner of store 1111 (the seeded store that holds a subscription). Used for cancellation and cash.
OWNER='00000000-0000-0000-0000-0000000000c1'
owner_fixture() {
  q "insert into auth.users (id, email) values ('$OWNER', 'race-owner@example.test') on conflict (id) do nothing" >/dev/null
  q "insert into profiles (id, full_name) values ('$OWNER', 'Race owner') on conflict (id) do nothing" >/dev/null
  q "insert into store_owners (store_id, profile_id, role, is_active) values ('$STORE', '$OWNER', 'owner', true)
     on conflict do nothing" >/dev/null
}
as_owner() {
  printf "select set_config('request.jwt.claims', '{\"role\":\"authenticated\",\"sub\":\"%s\"}', false);\n" "$OWNER"
  printf "select set_config('request.jwt.claim.sub', '%s', false);\n" "$OWNER"
}
# Online order with an attached simulator payment, ready to settle. Prints order id; sets global TOTAL.
online_order() {  # $1 = race key suffix, $2 = variant
  local oid total init
  oid=$(q "select guest_checkout_place('$STORE', '$S1', 'race-key-$1', conc_plan('$2', 1, 'online', 'Payer $1')) ->> 'order_id'")
  total=$(q "select total_paise from orders where id = '$oid'")
  init=$(q "select guest_payment_init_claim('$oid', 'simulator') ->> 'init_id'")
  q "select guest_payment_init_finish('$init', 'created', 'sim_$1_$oid', $total, 'INR', null)" >/dev/null
  q "select guest_payment_init_attach('$init')" >/dev/null
  echo "$oid $total"
}

# ---------------- F: settlement wins against reservation expiry ----------------
# Settlement locks the order first and commits while the reservation is still valid to it. Expiry then runs after the
# reservation has lapsed, blocks on the order lock, and must find the order paid and leave it alone.
fresh; owner_fixture
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
read -r OID TOTAL <<< "$(online_order F "$V")"
q "update orders set reservation_expires_at = now() + interval '0.8 seconds' where id = '$OID'" >/dev/null
cat > "$TMP/f1.sql" <<SQL
begin;
select settle_online_payment('simulator', 'sim_F_$OID', 'pay_f_1', $TOTAL, true, null);
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/f2.sql" <<SQL
begin;
select pg_sleep(1.0);
select expire_stale_payments();
commit;
SQL
race "$TMP/f1.sql" "$TMP/f2.sql"
paid=$(q "select count(*) from payments where order_id = '$OID' and status = 'PAID'")
late=$(q "select count(*) from late_payments where order_id = '$OID'")
ostat=$(q "select order_status from orders where id = '$OID'")
reserved=$(q "select reserved from inventory where variant_id = '$V'")
on_hand=$(q "select on_hand from inventory where variant_id = '$V'")
if [ "$paid" = "1" ] && [ "$late" = "0" ] && [ "$ostat" != "CANCELLED" ] && [ "$reserved" = "0" ] && [ "$on_hand" = "9" ]; then
  pass "F settlement wins: paid once, order kept, stock consumed once (on_hand 9, reserved 0)"
else
  miss "F settlement wins: paid=$paid late=$late order=$ostat reserved=$reserved on_hand=$on_hand"
fi

# ---------------- G: expiry wins against settlement ----------------
# The reservation has lapsed and expiry commits first. Settlement then arrives, must not be counted as an ordinary
# payment, and must be recorded once as a late payment for review.
fresh; owner_fixture
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
read -r OID TOTAL <<< "$(online_order G "$V")"
q "update orders set reservation_expires_at = now() - interval '1 minute' where id = '$OID'" >/dev/null
cat > "$TMP/g1.sql" <<SQL
begin;
select expire_stale_payments();
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/g2.sql" <<SQL
begin;
select settle_online_payment('simulator', 'sim_G_$OID', 'pay_g_1', $TOTAL, true, null);
commit;
SQL
race "$TMP/g1.sql" "$TMP/g2.sql"
paid=$(q "select count(*) from payments where order_id = '$OID' and status = 'PAID'")
late=$(q "select count(*) from late_payments where order_id = '$OID' and provider_payment_id = 'pay_g_1'")
ostat=$(q "select order_status from orders where id = '$OID'")
reserved=$(q "select reserved from inventory where variant_id = '$V'")
on_hand=$(q "select on_hand from inventory where variant_id = '$V'")
if [ "$paid" = "0" ] && [ "$late" = "1" ] && [ "$ostat" = "CANCELLED" ] && [ "$reserved" = "0" ] && [ "$on_hand" = "10" ]; then
  pass "G expiry wins: no ordinary payment, one late payment recorded, stock released"
else
  miss "G expiry wins: paid=$paid late=$late order=$ostat reserved=$reserved on_hand=$on_hand"
fi

# ---------------- H: settlement racing cancellation ----------------
# Either outcome is acceptable; the final state must be one of the two consistent ones, with no duplicate payment
# and no duplicate refund, and stock restored exactly as the outcome requires.
fresh; owner_fixture
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
read -r OID TOTAL <<< "$(online_order H "$V")"
{ echo "begin;"; as_owner; echo "select cancel_order('$OID', 'customer changed mind');"; echo "select pg_sleep(1.5);"; echo "commit;"; } > "$TMP/h1.sql"
cat > "$TMP/h2.sql" <<SQL
begin;
select settle_online_payment('simulator', 'sim_H_$OID', 'pay_h_1', $TOTAL, true, null);
commit;
SQL
race "$TMP/h1.sql" "$TMP/h2.sql"
paid=$(q "select count(*) from payments where order_id = '$OID' and status = 'PAID'")
late=$(q "select count(*) from late_payments where order_id = '$OID'")
refunds=$(q "select count(*) from refunds where order_id = '$OID'")
ostat=$(q "select order_status from orders where id = '$OID'")
reserved=$(q "select reserved from inventory where variant_id = '$V'")
on_hand=$(q "select on_hand from inventory where variant_id = '$V'")
ok=0
if [ "$paid" = "0" ] && [ "$late" = "1" ] && [ "$ostat" = "CANCELLED" ] && [ "$refunds" = "0" ] && [ "$on_hand" = "10" ]; then ok=1; fi
if [ "$paid" = "1" ] && [ "$ostat" = "CANCELLED" ] && [ "$refunds" = "1" ] && [ "$late" = "0" ] && [ "$on_hand" = "10" ]; then ok=1; fi
if [ "$paid" = "1" ] && [ "$ostat" != "CANCELLED" ] && [ "$refunds" = "0" ] && [ "$on_hand" = "9" ]; then ok=1; fi
if [ "$ok" = "1" ] && [ "$reserved" = "0" ]; then
  pass "H settlement vs cancellation: one consistent outcome (paid=$paid late=$late refunds=$refunds order=$ostat on_hand=$on_hand)"
else
  miss "H settlement vs cancellation: paid=$paid late=$late refunds=$refunds order=$ostat reserved=$reserved on_hand=$on_hand"
fi

# ---------------- I: coupon redemption near its usage limit ----------------
# A coupon with one use left, two buyers at once. Exactly one order may carry it; the used count ends at the limit.
fresh; owner_fixture
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, max_uses, is_active)
   values ('$STORE', 'RACE10', 'percent', 1000, 0, 1, true)" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1), ('$C2', '$STORE', '$V', 1)" >/dev/null
q "create or replace function public.conc_plan_coupon(p_variant uuid, p_code text) returns jsonb language plpgsql as \$f\$
declare v_price bigint; v_cost bigint; v_bps integer; v_sku text; v_label text; v_pname text; v_base bigint; v_disc bigint; v_taxable bigint; v_tax bigint;
begin
  select pv.sale_price_paise, pv.cost_price_paise, pr.gst_rate_bps, pv.sku, pv.label, pr.name into v_price, v_cost, v_bps, v_sku, v_label, v_pname
  from product_variants pv join products pr on pr.id = pv.product_id where pv.id = p_variant;
  v_base := v_price; v_disc := round(v_base * 1000 / 10000.0)::bigint; v_taxable := v_base - v_disc; v_tax := round(v_taxable * v_bps / 10000.0)::bigint;
  return jsonb_build_object('method','cash','customer_name','Coupon buyer','customer_mobile','9999900007','supply_state_code','33','customer_email',null,
    'coupon_code', p_code, 'subtotal_paise', v_base, 'discount_paise', v_disc, 'tax_paise', v_tax, 'total_paise', v_taxable + v_tax,
    'expires_at', (now() + interval '15 minutes')::text,
    'lines', jsonb_build_array(jsonb_build_object('variant_id', p_variant, 'quantity', 1, 'unit_price_paise', v_price, 'cost_price_paise', v_cost,
      'gst_rate_bps', v_bps, 'product_name', v_pname, 'variant_label', v_label, 'sku', v_sku, 'hsn_code', null,
      'discount_paise', v_disc, 'taxable_paise', v_taxable, 'tax_paise', v_tax, 'line_total_paise', v_taxable + v_tax)));
end \$f\$;" >/dev/null
cat > "$TMP/i1.sql" <<SQL
begin;
select guest_checkout_place('$STORE', '$S1', 'race-key-I-0001', conc_plan_coupon('$V', 'RACE10'));
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/i2.sql" <<SQL
begin;
select guest_checkout_place('$STORE', '$S2', 'race-key-I-0002', conc_plan_coupon('$V', 'RACE10'));
commit;
SQL
race "$TMP/i1.sql" "$TMP/i2.sql"
orders=$(q "select count(*) from orders where coupon_code = 'RACE10'")
used=$(q "select used_count from coupons where code = 'RACE10' and store_id = '$STORE'")
redemptions=$(q "select count(*) from coupon_redemptions r join coupons c on c.id = r.coupon_id where c.code = 'RACE10'")
refused=$(grep -c 'fully used' "$TMP/b.out" || true)
if [ "$orders" = "1" ] && [ "$used" = "1" ] && [ "$redemptions" = "1" ] && [ "$refused" -ge 1 ]; then
  pass "I coupon limit: one order carries the last use, used=1, second buyer refused"
else
  miss "I coupon limit: orders=$orders used=$used redemptions=$redemptions refused=$refused"
fi

# ---------------- J: concurrent cash confirmation ----------------
# Two confirmations of the same pending cash payment by the same authorised owner. One must succeed.
fresh; owner_fixture
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
OID=$(q "select guest_checkout_place('$STORE', '$S1', 'race-key-J-0001', conc_plan('$V', 1, 'cash', 'Cash J')) ->> 'order_id'")
TOTAL=$(q "select total_paise from orders where id = '$OID'")
{ echo "begin;"; as_owner; echo "select confirm_cash_payment('$OID', $TOTAL, 'first', '$OWNER');"; echo "select pg_sleep(1.5);"; echo "commit;"; } > "$TMP/j1.sql"
{ echo "begin;"; as_owner; echo "select confirm_cash_payment('$OID', $TOTAL, 'second', '$OWNER');"; echo "commit;"; } > "$TMP/j2.sql"
race "$TMP/j1.sql" "$TMP/j2.sql"
paid=$(q "select count(*) from payments where order_id = '$OID' and status = 'PAID'")
confs=$(q "select count(*) from cash_confirmations where order_id = '$OID'")
invoices=$(q "select count(*) from invoices where order_id = '$OID'")
reserved=$(q "select reserved from inventory where variant_id = '$V'")
on_hand=$(q "select on_hand from inventory where variant_id = '$V'")
refused=$(grep -c 'no pending cash payment' "$TMP/b.out" || true)
if [ "$paid" = "1" ] && [ "$confs" = "1" ] && [ "$invoices" = "1" ] && [ "$reserved" = "0" ] && [ "$on_hand" = "9" ] && [ "$refused" -ge 1 ]; then
  pass "J concurrent cash confirmation: one payment, one confirmation, one invoice, stock consumed once"
else
  miss "J concurrent cash confirmation: paid=$paid confirmations=$confs invoices=$invoices reserved=$reserved on_hand=$on_hand refused=$refused"
fi

# ---------------- K: concurrent invoice generation ----------------
# The order is marked paid without the trigger (replication role), so no invoice exists yet. Two issuers run at once.
# Exactly one invoice, and the store's invoice counter advances by exactly one.
fresh; owner_fixture
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
q "insert into cart_items (cart_id, store_id, variant_id, quantity) values ('$C1', '$STORE', '$V', 1)" >/dev/null
OID=$(q "select guest_checkout_place('$STORE', '$S1', 'race-key-K-0001', conc_plan('$V', 1, 'cash', 'Invoice K')) ->> 'order_id'")
q "set session_replication_role = replica; update orders set payment_status = 'PAID', paid_at = now() where id = '$OID'; reset session_replication_role;" >/dev/null
before=$(q "select coalesce((select next_value from store_counters where store_id = '$STORE' and kind = 'invoice'), 0)")
cat > "$TMP/k1.sql" <<SQL
begin;
select app.ensure_invoice('$OID');
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/k2.sql" <<SQL
begin;
select app.ensure_invoice('$OID');
commit;
SQL
race "$TMP/k1.sql" "$TMP/k2.sql"
invoices=$(q "select count(*) from invoices where order_id = '$OID'")
after=$(q "select coalesce((select next_value from store_counters where store_id = '$STORE' and kind = 'invoice'), 0)")
if [ "$invoices" = "1" ] && [ "$((after - before))" = "1" ]; then
  pass "K concurrent invoice generation: one invoice, counter advanced by exactly one (no gap)"
else
  miss "K concurrent invoice generation: invoices=$invoices counter advanced by $((after - before))"
fi

# ---------------- L: overlapping adds from two requests to one variant ----------------
# Both requests add to the same cart line. The first holds the cart lock while the second waits; no quantity is lost.
fresh
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
R1=$(q "insert into guest_request_keys (store_id, guest_session_id, kind, request_key, attempt, lease_expires_at)
       values ('$STORE', '$S1', 'planner_cart', 'race-cart-L-0001', 1, now() + interval '5 minutes') returning id" | head -1)
R2=$(q "insert into guest_request_keys (store_id, guest_session_id, kind, request_key, attempt, lease_expires_at)
       values ('$STORE', '$S1', 'planner_cart', 'race-cart-L-0002', 1, now() + interval '5 minutes') returning id" | head -1)
cat > "$TMP/l1.sql" <<SQL
begin;
select guest_cart_add_step('$STORE', '$S1', '$R1', 1, 0, '$V', 3);
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/l2.sql" <<SQL
begin;
select guest_cart_add_step('$STORE', '$S1', '$R2', 1, 0, '$V', 4);
commit;
SQL
race "$TMP/l1.sql" "$TMP/l2.sql"
qty=$(q "select ci.quantity::int from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = '$S1' and ci.variant_id = '$V'")
lines=$(q "select count(*) from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = '$S1' and ci.variant_id = '$V'")
if [ "$qty" = "7" ] && [ "$lines" = "1" ]; then
  pass "L overlapping adds to one line: quantity 7 exactly (3 + 4), one line"
else
  miss "L overlapping adds: quantity=$qty lines=$lines (expected 7 and 1)"
fi

# ---------------- M: the same step submitted twice at once ----------------
# A double submit of one request step adds once; the second call reports 'done' after the first commits.
fresh
V=$(variant)
q "update inventory set on_hand = 10, reserved = 0 where variant_id = '$V'" >/dev/null
R1=$(q "insert into guest_request_keys (store_id, guest_session_id, kind, request_key, attempt, lease_expires_at)
       values ('$STORE', '$S1', 'planner_cart', 'race-cart-M-0001', 1, now() + interval '5 minutes') returning id" | head -1)
cat > "$TMP/m1.sql" <<SQL
begin;
select guest_cart_add_step('$STORE', '$S1', '$R1', 1, 0, '$V', 2);
select pg_sleep(1.5);
commit;
SQL
cat > "$TMP/m2.sql" <<SQL
begin;
select guest_cart_add_step('$STORE', '$S1', '$R1', 1, 0, '$V', 2);
commit;
SQL
race "$TMP/m1.sql" "$TMP/m2.sql"
qty=$(q "select ci.quantity::int from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = '$S1' and ci.variant_id = '$V'")
steps=$(q "select count(*) from guest_request_steps where request_id = '$R1' and status = 'done'")
if [ "$qty" = "2" ] && [ "$steps" = "1" ]; then
  pass "M duplicate submit of one step: quantity 2 (added once), one completed step"
else
  miss "M duplicate submit: quantity=$qty completed_steps=$steps (expected 2 and 1)"
fi

psql -q -d postgres -c "drop database if exists $DB" >/dev/null
if [ "$fail" -eq 0 ]; then echo "ALL CHECKOUT RACES PASS"; exit 0; fi
echo "CHECKOUT RACES: FAILURES PRESENT"; exit 1
