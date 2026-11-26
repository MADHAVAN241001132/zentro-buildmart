-- ZENTRO BuildMart: tests for migration 0013 (one invoice per paid order, idempotent).
-- Run after migrations 0001-0013 and the dev seed. Rolled back at the end.

begin;

do $$
declare
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  o1 uuid;
  o2 uuid;
  o3 uuid;
  n integer;
  t bigint;
begin
  -- I1: a guest online order gets exactly one invoice, with the order total, when it becomes PAID.
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_a, 'TEST-INV-1', 'online', 'Invoice Test One', 'pickup', 'online', 'PENDING', 'PLACED',
          10000, 0, 10000, 1800, 0, 11800)
  returning id into o1;
  update orders set payment_status = 'PAID', paid_at = now() where id = o1;
  select count(*), max(total_paise) into n, t from invoices where order_id = o1;
  if n <> 1 or t <> 11800 then raise exception 'I1 FAILED: % invoices, total %', n, t; end if;
  raise notice 'I1 ok: paid guest online order issued one invoice for the order total';

  -- I2: a repeated PAID update (as a duplicate webhook would cause) issues nothing new.
  update orders set payment_status = 'PAID' where id = o1;
  select count(*) into n from invoices where order_id = o1;
  if n <> 1 then raise exception 'I2 FAILED: duplicate invoice after repeated payment update (% rows)', n; end if;
  raise notice 'I2 ok: repeated payment confirmation does not duplicate the invoice';

  -- I3: an order inserted already PAID is invoiced too.
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_a, 'TEST-INV-2', 'online', 'Invoice Test Two', 'pickup', 'online', 'PAID', 'PLACED',
          5000, 0, 5000, 900, 0, 5900)
  returning id into o2;
  select count(*) into n from invoices where order_id = o2;
  if n <> 1 then raise exception 'I3 FAILED: order inserted as PAID has % invoices', n; end if;
  raise notice 'I3 ok: an order inserted as PAID is invoiced once';

  -- I4: an unpaid order gets no invoice.
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_a, 'TEST-INV-3', 'online', 'Invoice Test Three', 'pickup', 'online', 'PENDING', 'PLACED',
          7000, 0, 7000, 1260, 0, 8260)
  returning id into o3;
  select count(*) into n from invoices where order_id = o3;
  if n <> 0 then raise exception 'I4 FAILED: unpaid order invoiced'; end if;
  raise notice 'I4 ok: unpaid orders are not invoiced';

  raise notice 'Invoice tests: all groups passed';
end $$;

rollback;
