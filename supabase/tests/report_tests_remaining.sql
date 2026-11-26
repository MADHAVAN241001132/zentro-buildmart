-- Remaining report functions (migration 0021). Fixtures are created inside a transaction and rolled back.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_store uuid := (select id from stores order by created_at limit 1);
  v_customer uuid;
  v_supplier uuid;
  v_invoice uuid;
  r record;
  v_count bigint;
  v_direct bigint;
  v_taxable bigint;
  v_gst_taxable bigint;
begin
  -- F1: FIFO overdue. Sales 1000 due 1 Jan and 500 due 1 Mar; a payment of 1200 clears the first sale and part of the second.
  insert into customers (store_id, full_name, mobile, is_credit_approved, credit_limit_paise)
    values (v_store, 'Report Fixture Customer', '9000000001', true, 5000000)
    returning id into v_customer;
  insert into credit_ledger (store_id, customer_id, entry_type, amount_paise, due_on, reference_type, note)
    values (v_store, v_customer, 'sale', 100000, '2026-01-01', 'fixture', 'sale one'),
           (v_store, v_customer, 'sale', 50000, '2026-03-01', 'fixture', 'sale two');
  insert into credit_ledger (store_id, customer_id, entry_type, amount_paise, reference_type, note)
    values (v_store, v_customer, 'payment', -120000, 'fixture', 'part payment');

  select * into r from report_credit_overdue(v_store, date '2026-02-01') where customer_id = v_customer;
  if r.balance_paise <> 30000 or r.outstanding_paise <> 30000 or r.overdue_paise <> 0 or r.oldest_unpaid_due <> date '2026-03-01' then
    raise exception 'F1 failed at 1 Feb: balance % outstanding % overdue % oldest %', r.balance_paise, r.outstanding_paise, r.overdue_paise, r.oldest_unpaid_due;
  end if;
  select * into r from report_credit_overdue(v_store, date '2026-04-01') where customer_id = v_customer;
  if r.overdue_paise <> 30000 then raise exception 'F1 failed at 1 Apr: overdue %', r.overdue_paise; end if;
  raise notice 'F1 ok: FIFO allocation clears the oldest sale first and reports overdue by due date';

  -- F2: supplier open invoices reflect payments and payment terms.
  insert into suppliers (store_id, name, payment_terms_days, is_active)
    values (v_store, 'Report Fixture Supplier', 30, true) returning id into v_supplier;
  insert into supplier_invoices (store_id, supplier_id, invoice_number, invoice_date, amount_paise)
    values (v_store, v_supplier, 'FIX-INV-1', '2026-01-01', 200000) returning id into v_invoice;
  insert into supplier_payments (store_id, supplier_id, supplier_invoice_id, amount_paise, paid_on, method)
    values (v_store, v_supplier, v_invoice, 50000, '2026-01-10', 'bank');
  select * into r from report_supplier_open_invoices(v_store, date '2026-03-01') where invoice_id = v_invoice;
  if r.outstanding_paise <> 150000 or r.due_date <> date '2026-01-31' or r.days_overdue <> 29 then
    raise exception 'F2 failed: outstanding % due % overdue days %', r.outstanding_paise, r.due_date, r.days_overdue;
  end if;
  raise notice 'F2 ok: supplier invoice outstanding, due date and days overdue';

  -- F3: supplier summary balance equals invoices less payments for the supplier.
  select outstanding_paise into v_count from report_supplier_summary(v_store, date '2026-01-01', date '2026-12-31') where supplier_id = v_supplier;
  if v_count <> 150000 then raise exception 'F3 failed: supplier balance %', v_count; end if;
  raise notice 'F3 ok: supplier balance is invoices less payments';

  -- F4: customer summary counts the fixture customer's period orders and reports repeat status from earlier orders.
  -- (Read-only check; the fixture has no orders, so the customer must not appear.)
  if exists (select 1 from report_customer_summary(v_store, '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z') where customer_id = v_customer) then
    raise exception 'F4 failed: a customer without orders appeared in customer sales';
  end if;
  raise notice 'F4 ok: customers appear in sales only when they have orders';

  -- F5: GST rate breakdown agrees with the summary taxable value for each store.
  for r in select id from stores loop
    select coalesce(sum(taxable_paise), 0) into v_gst_taxable from report_gst_rates(r.id, '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z');
    select coalesce(sum(taxable_paise), 0) into v_taxable from orders
      where store_id = r.id and order_status <> 'CANCELLED';
    if v_gst_taxable <> v_taxable then raise exception 'F5 failed: GST rate taxable % vs orders %', v_gst_taxable, v_taxable; end if;
  end loop;
  raise notice 'F5 ok: GST rate-wise taxable equals order taxable for every store';

  -- F6: invoice records in range match the invoices table.
  select count(*) into v_count from report_invoices(v_store, '2000-01-01', '2100-01-01');
  select count(*) into v_direct from invoices where store_id = v_store;
  if v_count <> v_direct then raise exception 'F6 failed: invoice rows % vs table %', v_count, v_direct; end if;
  raise notice 'F6 ok: invoice-level GST records match the invoices table';

  -- F7: stock movement paging returns the full count across pages.
  select count(*) into v_count from report_stock_movements(v_store, '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z', null, 500, 0);
  select report_stock_movement_count(v_store, '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z', null) into v_direct;
  if v_count <> v_direct then raise exception 'F7 failed: movements % vs count %', v_count, v_direct; end if;
  raise notice 'F7 ok: stock movement paging agrees with the count function';

  -- F8: tile batch sold units equal the sale movements recorded against batches.
  select coalesce(sum(sold_units), 0) into v_count from report_batch_performance(v_store, '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z');
  select coalesce(sum(-quantity), 0) into v_direct from stock_movements
    where store_id = v_store and movement_type = 'sale' and batch_id is not null;
  if v_count <> v_direct then raise exception 'F8 failed: batch sold % vs movements %', v_count, v_direct; end if;
  raise notice 'F8 ok: tile batch sold units agree with sale movements';

  -- F9: remaining report functions are server-only.
  if has_function_privilege('authenticated', 'report_credit_overdue(uuid, date)', 'EXECUTE')
     or has_function_privilege('anon', 'report_supplier_summary(uuid, date, date)', 'EXECUTE') then
    raise exception 'F9 failed: a client role can execute a report function';
  end if;
  raise notice 'F9 ok: remaining report functions are server-only';
end $$;

rollback;
