-- ZENTRO BuildMart: database integrity and security tests.
-- Run against a database that has migrations 0001-0004 and the dev seed applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/database_tests.sql
-- The whole suite runs in one transaction that is rolled back, so the seed data is left untouched.
-- Any failed assertion raises an exception and stops the run (non-zero exit).

begin;

-- Fixed identifiers from the dev seed.
-- Store A = ZENTRO Ambattur Central, store B = ZENTRO Coimbatore.
-- Owner A = a2, manager A = a4, owner B = a3, super admin = a1.

-- Helper: runs a statement and reports 'ok' or 'SQLSTATE: message'.
create or replace function pg_temp.try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

-- Helper: creates a one-line order at full price (setup runs as superuser, bypassing RLS).
create or replace function pg_temp.make_order(p_store uuid, p_sku text, p_qty numeric, p_method text)
returns uuid language plpgsql as $$
declare
  o uuid;
  v_price bigint; v_gst integer; v_vid uuid; v_cost bigint;
  v_pname text; v_label text; v_hsn text;
  v_gross bigint; v_tax bigint;
begin
  select pv.sale_price_paise, pr.gst_rate_bps, pv.id, pv.cost_price_paise, pr.name, pv.label, pr.hsn_code
    into v_price, v_gst, v_vid, v_cost, v_pname, v_label, v_hsn
  from product_variants pv join products pr on pr.id = pv.product_id
  where pv.store_id = p_store and pv.sku = p_sku;

  v_gross := round(p_qty * v_price);
  v_tax := round(v_gross * v_gst / 10000);

  insert into orders (store_id, order_number, customer_name, fulfilment, payment_method,
                      subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (p_store, 'T-' || replace(gen_random_uuid()::text, '-', ''), 'Test Customer', 'pickup', p_method,
          v_gross, 0, v_gross, v_tax, 0, v_gross + v_tax)
  returning id into o;

  insert into order_items (order_id, store_id, variant_id, product_name_snapshot, variant_label_snapshot,
                           sku_snapshot, hsn_code_snapshot, quantity, stock_units, cost_price_paise_snapshot,
                           unit_price_paise, discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise)
  values (o, p_store, v_vid, v_pname, v_label, p_sku, v_hsn, p_qty, ceil(p_qty)::bigint, v_cost,
          v_price, 0, v_gst, v_gross, v_tax, v_gross + v_tax);
  return o;
end $$;

-- Helper: switches the session to a signed-in user (or anon when p_user is null).
create or replace function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  if p_user is null then
    set local role anon;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  else
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user::text)::text, true);
  end if;
end $$;

-- Helper: returns the session to superuser (server context) and clears the JWT claims.
create or replace function pg_temp.reset_session() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.stock(p_sku text, out on_hand bigint, out reserved bigint)
language sql as $$
  select i.on_hand, i.reserved from inventory i join product_variants pv on pv.id = i.variant_id where pv.sku = p_sku
$$;

-- ---------------------------------------------------------------------------
-- T1  Owners see only their own store's orders.
-- ---------------------------------------------------------------------------
do $$
declare n_own bigint; n_foreign bigint;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  select count(*) filter (where store_id = '11111111-1111-4111-8111-111111111111'),
         count(*) filter (where store_id = '22222222-2222-4222-8222-222222222222')
    into n_own, n_foreign from orders;
  if n_foreign <> 0 or n_own = 0 then
    raise exception 'T1 FAILED: owner A sees % own and % foreign orders', n_own, n_foreign;
  end if;
  raise notice 'PASS T1 tenant isolation on orders (% own, % foreign)', n_own, n_foreign;
  perform pg_temp.reset_session();
end $$;

-- T2  Owners cannot write to another store, even when they guess its ids.
do $$
declare n bigint; msg text;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  update inventory set on_hand = 999999 where store_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T2 FAILED: owner A updated % rows in store B inventory', n; end if;

  msg := pg_temp.try($q$insert into categories (store_id, slug, name)
                       values ('22222222-2222-4222-8222-222222222222', 'hijack', 'Hijack')$q$);
  if msg not like '42501%' then raise exception 'T2 FAILED: foreign insert returned %', msg; end if;
  raise notice 'PASS T2 owner cannot write to another store (%)', msg;
  perform pg_temp.reset_session();
end $$;

-- T3  Stock is never edited directly from the browser, even for the owner's own store.
do $$
declare n bigint;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  update inventory set on_hand = 999999 where store_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T3 FAILED: owner updated own inventory directly (% rows)', n; end if;
  raise notice 'PASS T3 stock cannot be edited directly; only through adjust_stock()';
  perform pg_temp.reset_session();
end $$;

-- T4  Anonymous visitors see the public catalogue of active stores only.
do $$
declare n bigint;
begin
  perform pg_temp.act_as(null);
  select count(*) into n from products;
  if n <> 160 then raise exception 'T4 FAILED: anon sees % products, expected 160 public products', n; end if;
  raise notice 'PASS T4 anon sees the public catalogue (% products)', n;
  perform pg_temp.reset_session();
end $$;

-- T5  Anonymous visitors cannot read orders or payments.
do $$
declare msg text;
begin
  perform pg_temp.act_as(null);
  msg := pg_temp.try('select 1 from orders limit 1');
  if msg not like '42501%' then raise exception 'T5 FAILED: anon could read orders (%)', msg; end if;
  msg := pg_temp.try('select 1 from payment_events limit 1');
  if msg not like '42501%' then raise exception 'T5 FAILED: anon could read payment events (%)', msg; end if;
  raise notice 'PASS T5 anon cannot read orders or payment events';
  perform pg_temp.reset_session();
end $$;

-- T6  A customer (anon) cannot confirm cash or cancel orders.
do $$
declare o uuid; msg text; total bigint;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V017', 1, 'cash');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'cash', 'cash', null, total, now() + interval '1 hour');
  perform pg_temp.act_as(null);
  msg := pg_temp.try(format('select confirm_cash_payment(%L, %s)', o, total));
  if msg not like '42501%' then raise exception 'T6 FAILED: anon confirmed cash (%)', msg; end if;
  msg := pg_temp.try(format('select cancel_order(%L, ''x'')', o));
  if msg not like '42501%' then raise exception 'T6 FAILED: anon cancelled order (%)', msg; end if;
  raise notice 'PASS T6 customers cannot confirm cash or cancel orders';
  perform pg_temp.reset_session();
end $$;

-- T7  Owner of store B cannot confirm cash for store A.
do $$
declare o uuid; msg text; total bigint;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V017', 1, 'cash');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'cash', 'cash', null, total, now() + interval '1 hour');
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
  msg := pg_temp.try(format('select confirm_cash_payment(%L, %s)', o, total));
  if msg not like '42501%' then raise exception 'T7 FAILED: cross-store cash confirmation allowed (%)', msg; end if;
  raise notice 'PASS T7 cross-store cash confirmation refused (%)', msg;
  perform pg_temp.reset_session();
end $$;

-- T8  Manager confirms cash exactly once; stock is deducted once; a second confirmation is refused.
do $$
declare o uuid; before_hand bigint; before_res bigint; after_hand bigint; after_res bigint; total bigint; msg text;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V017', 2, 'cash');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'cash', 'cash', null, total, now() + interval '1 hour');
  select on_hand, reserved into before_hand, before_res from pg_temp.stock('AMB-V017');

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
  perform confirm_cash_payment(o, total, 'counter');
  perform pg_temp.reset_session();

  select on_hand, reserved into after_hand, after_res from pg_temp.stock('AMB-V017');
  if after_hand <> before_hand - 2 or after_res <> before_res - 2 then
    raise exception 'T8 FAILED: stock on_hand % -> %, reserved % -> % (expected -2 each)',
      before_hand, after_hand, before_res, after_res;
  end if;

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
  msg := pg_temp.try(format('select confirm_cash_payment(%L, %s)', o, total));
  perform pg_temp.reset_session();
  if msg not like 'P0001%' then raise exception 'T8 FAILED: second cash confirmation not refused (%)', msg; end if;

  if (select coalesce(sum(quantity), 0) from stock_movements where reference_id = o and movement_type = 'sale') <> -2 then
    raise exception 'T8 FAILED: sale movements do not sum to the 2 units sold';
  end if;
  raise notice 'PASS T8 cash confirmed once; stock deducted once (% -> %)', before_hand, after_hand;
end $$;

-- T9  Overselling is refused by the database.
do $$
declare hand bigint; res bigint; o uuid; msg text;
begin
  select on_hand, reserved into hand, res from pg_temp.stock('AMB-V001');
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V001', (hand - res) + 1, 'online');
  msg := pg_temp.try(format('select reserve_order_stock(%L)', o));
  if msg not like 'P0001%insufficient_stock%' then
    raise exception 'T9 FAILED: oversell was not refused (%)', msg;
  end if;
  if (select reserved from pg_temp.stock('AMB-V001')) <> res then
    raise exception 'T9 FAILED: a refused reservation changed reserved stock';
  end if;
  raise notice 'PASS T9 oversell refused: %', msg;
end $$;

-- T10  A repeated settlement does not deduct stock twice.
do $$
declare o uuid; total bigint; h1 bigint; h2 bigint; r text; r2 text;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V080', 1, 'online');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'T-prov-10-' || o, total, now() + interval '15 minutes');
  select on_hand into h1 from pg_temp.stock('AMB-V080');

  r := settle_online_payment('simulator', 'T-prov-10-' || o, 'pay-10-a', total, true);
  r2 := settle_online_payment('simulator', 'T-prov-10-' || o, 'pay-10-a', total, true);
  select on_hand into h2 from pg_temp.stock('AMB-V080');

  if r <> 'paid' or r2 <> 'already_paid' then raise exception 'T10 FAILED: settle returned % then %', r, r2; end if;
  if h2 <> h1 - 1 then raise exception 'T10 FAILED: stock moved by % on double settlement', h1 - h2; end if;
  raise notice 'PASS T10 duplicate settlement is idempotent (% then %, stock deducted once)', r, r2;
end $$;

-- T11  The same webhook event is recorded only once.
do $$
declare first_seen boolean; second_seen boolean;
begin
  first_seen := record_payment_event('razorpay', 'evt_test_dup_1', 'payment.captured', '{"x":1}'::jsonb, true);
  second_seen := record_payment_event('razorpay', 'evt_test_dup_1', 'payment.captured', '{"x":1}'::jsonb, true);
  if not first_seen or second_seen then
    raise exception 'T11 FAILED: duplicate webhook not detected (first %, second %)', first_seen, second_seen;
  end if;
  raise notice 'PASS T11 duplicate webhook event detected';
end $$;

-- T12  A payment for the wrong amount is never marked as paid.
do $$
declare o uuid; total bigint; r text; st text;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V080', 1, 'online');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'T-prov-12-' || o, total, now() + interval '15 minutes');
  r := settle_online_payment('simulator', 'T-prov-12-' || o, 'pay-12', total - 100, true);
  select status into st from payments where order_id = o;
  if r <> 'amount_mismatch' or st <> 'PENDING' then
    raise exception 'T12 FAILED: mismatch returned % and status %', r, st;
  end if;
  raise notice 'PASS T12 amount mismatch never marks the order paid';
end $$;

-- T13  A failed payment can be retried, and the retry can succeed.
do $$
declare o uuid; total bigint; r1 text; r2 text; st text;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V080', 1, 'online');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'T-prov-13a-' || o, total, now() + interval '15 minutes');
  r1 := settle_online_payment('simulator', 'T-prov-13a-' || o, null, total, false, 'bank declined');

  perform create_payment_attempt(o, 'online', 'simulator', 'T-prov-13b-' || o, total, now() + interval '15 minutes');
  r2 := settle_online_payment('simulator', 'T-prov-13b-' || o, 'pay-13b', total, true);
  select payment_status into st from orders where id = o;

  if r1 <> 'failed' or r2 <> 'paid' or st <> 'PAID' then
    raise exception 'T13 FAILED: failure % then retry % (order %)', r1, r2, st;
  end if;
  raise notice 'PASS T13 failed payment is retried successfully';
end $$;

-- T14  Cancelling an unpaid order releases its reservation.
do $$
declare o uuid; res_before bigint; res_during bigint; res_after bigint; r text;
begin
  select reserved into res_before from pg_temp.stock('AMB-V017');
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V017', 3, 'online');
  perform reserve_order_stock(o);
  select reserved into res_during from pg_temp.stock('AMB-V017');
  if res_during <> res_before + 3 then raise exception 'T14 FAILED: reservation did not hold stock'; end if;

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  r := cancel_order(o, 'test cancellation');
  perform pg_temp.reset_session();
  select reserved into res_after from pg_temp.stock('AMB-V017');
  if res_after <> res_before then
    raise exception 'T14 FAILED: reserved % after cancel, expected %', res_after, res_before;
  end if;
  raise notice 'PASS T14 cancelling an unpaid order releases reserved stock (%)', r;
end $$;

-- T15  Cancelling a paid order restocks it and raises a refund request.
do $$
declare o uuid; total bigint; h_before bigint; h_after bigint; n_refunds bigint; r text;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V001', 2, 'online');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'T-prov-15-' || o, total, now() + interval '15 minutes');
  perform settle_online_payment('simulator', 'T-prov-15-' || o, 'pay-15', total, true);
  select on_hand into h_before from pg_temp.stock('AMB-V001');

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  r := cancel_order(o, 'customer request after payment');
  perform pg_temp.reset_session();
  select on_hand into h_after from pg_temp.stock('AMB-V001');
  select count(*) into n_refunds from refunds where order_id = o and status = 'requested';

  if h_after <> h_before + 2 or n_refunds <> 1 then
    raise exception 'T15 FAILED: on_hand % -> %, refund requests %', h_before, h_after, n_refunds;
  end if;
  raise notice 'PASS T15 paid cancellation restocks stock and requests a refund';
end $$;

-- T16  Expired reservations are released and the order is cancelled.
do $$
declare o uuid; res_before bigint; res_after bigint; result jsonb;
begin
  select reserved into res_before from pg_temp.stock('AMB-V033');
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V033', 1, 'cash');
  perform reserve_order_stock(o);
  perform create_payment_attempt(o, 'cash', 'cash', null, (select total_paise from orders where id = o), now() + interval '1 hour');
  update orders set reservation_expires_at = now() - interval '1 minute' where id = o;

  result := expire_stale_payments();
  select reserved into res_after from pg_temp.stock('AMB-V033');

  if (select order_status from orders where id = o) <> 'CANCELLED' or res_after <> res_before then
    raise exception 'T16 FAILED: expiry did not cancel the order or release stock (%)', result;
  end if;
  raise notice 'PASS T16 expired reservation released: %', result;
end $$;

-- T17  Owners cannot skip order states, and cannot move an unpaid order.
do $$
declare o uuid; total bigint; msg text;
begin
  o := pg_temp.make_order('11111111-1111-4111-8111-111111111111', 'AMB-V041', 1, 'online');
  perform reserve_order_stock(o);
  select total_paise into total from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'T-prov-17-' || o, total, now() + interval '15 minutes');
  perform settle_online_payment('simulator', 'T-prov-17-' || o, 'pay-17', total, true);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  msg := pg_temp.try(format('select transition_order_status(%L, ''COMPLETED'')', o));
  if msg not like 'P0001%invalid order transition%' then
    raise exception 'T17 FAILED: skipped transition allowed (%)', msg;
  end if;
  perform transition_order_status(o, 'PROCESSING');
  perform transition_order_status(o, 'PACKED');
  perform transition_order_status(o, 'READY_FOR_PICKUP');
  perform transition_order_status(o, 'COMPLETED');
  perform pg_temp.reset_session();
  if (select order_status from orders where id = o) <> 'COMPLETED' then
    raise exception 'T17 FAILED: valid path did not complete';
  end if;
  raise notice 'PASS T17 invalid transitions refused; valid path completes';
end $$;

-- T18  Money and stock invariants hold at the table level.
do $$
declare msg text;
begin
  msg := pg_temp.try($q$insert into orders (store_id, order_number, customer_name, payment_method,
          subtotal_paise, taxable_paise, tax_paise, total_paise)
          values ('11111111-1111-4111-8111-111111111111', 'BAD-TOTAL', 'x', 'cash', 100, 100, 18, 999)$q$);
  if msg not like '23514%' then raise exception 'T18 FAILED: inconsistent order total accepted (%)', msg; end if;

  msg := pg_temp.try($q$update inventory set on_hand = -1 where variant_id = (
          select id from product_variants where sku = 'AMB-V001')$q$);
  if msg not like '23514%' then raise exception 'T18 FAILED: negative stock accepted (%)', msg; end if;

  msg := pg_temp.try($q$insert into invoices (store_id, order_id, invoice_number, taxable_paise, tax_paise, total_paise)
          select store_id, id, 'DUP-1', 1, 1, 2 from orders where order_number = 'ZBM-000001' and store_id = '11111111-1111-4111-8111-111111111111'
          union all
          select store_id, id, 'DUP-2', 1, 1, 2 from orders where order_number = 'ZBM-000001' and store_id = '11111111-1111-4111-8111-111111111111'$q$);
  if msg not like '23505%' then raise exception 'T18 FAILED: duplicate invoice per order accepted (%)', msg; end if;

  raise notice 'PASS T18 money total, stock floor and one-invoice-per-order are enforced by the database';
end $$;

-- T19  Credit limits are enforced.
do $$
declare cust uuid; msg text; balance bigint;
begin
  select id into cust from customers where mobile = '9840011006';
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
  msg := pg_temp.try(format('select record_credit_entry(%L, ''sale'', 4500000)', cust));
  perform pg_temp.reset_session();
  if msg not like 'P0001%credit limit%' then raise exception 'T19 FAILED: over-limit sale accepted (%)', msg; end if;

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
  balance := record_credit_entry(cust, 'sale', 390000000 / 100);
  perform pg_temp.reset_session();
  if balance <> 1000000 + 3900000 then raise exception 'T19 FAILED: balance % after a valid sale', balance; end if;
  raise notice 'PASS T19 credit limit enforced; valid sale updates balance to %', balance;
end $$;

-- T20  Goods receipt cannot exceed the ordered quantity.
do $$
declare po uuid; line uuid; msg text;
begin
  select id into po from purchase_orders where po_number like 'PO-%' and store_id = '11111111-1111-4111-8111-111111111111';
  select id into line from purchase_order_items where purchase_order_id = po order by quantity_ordered desc limit 1;
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  msg := pg_temp.try(format($q$select receive_goods(%L, jsonb_build_array(jsonb_build_object('po_item_id', %L, 'quantity', 500)))$q$, po, line));
  perform pg_temp.reset_session();
  if msg not like 'P0001%over-receipt%' then raise exception 'T20 FAILED: over-receipt accepted (%)', msg; end if;
  raise notice 'PASS T20 over-receipt refused';
end $$;

-- T21  Dashboard totals match the underlying orders.
do $$
declare dash jsonb; direct bigint;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
  dash := store_dashboard_metrics('11111111-1111-4111-8111-111111111111', '2000-01-01', '2100-01-01');
  perform pg_temp.reset_session();
  select coalesce(sum(total_paise), 0) into direct from orders
  where store_id = '11111111-1111-4111-8111-111111111111' and payment_status = 'PAID';
  if (dash ->> 'gross_sales_paise')::bigint <> direct then
    raise exception 'T21 FAILED: dashboard % vs direct %', dash ->> 'gross_sales_paise', direct;
  end if;
  raise notice 'PASS T21 dashboard gross sales = % paise (matches orders)', direct;
end $$;

-- T22  Reserved stock always equals active reservations after every test above.
do $$
declare n bigint;
begin
  select count(*) into n from inventory i
  where i.reserved <> coalesce((select sum(r.quantity) from inventory_reservations r
                                where r.variant_id = i.variant_id and r.status = 'active'), 0);
  if n <> 0 then raise exception 'T22 FAILED: % inventory rows disagree with reservations', n; end if;
  raise notice 'PASS T22 reserved stock agrees with active reservations';
end $$;

-- T23  Every table in the public schema has Row-Level Security enabled (default deny).
do $$
declare n bigint;
begin
  select count(*) into n from pg_tables
  where schemaname = 'public' and not rowsecurity and tablename <> 'zentro_schema_migrations';
  if n <> 0 then raise exception 'T23 FAILED: % public tables have RLS disabled', n; end if;
  raise notice 'PASS T23 every public table has RLS enabled';
end $$;

rollback;
\echo 'Database tests finished. All assertions passed; changes were rolled back.'
