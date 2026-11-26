-- 0013: one shared, idempotent invoice mechanism for every paid order.
-- An invoice is issued when an order's payment_status becomes PAID. That covers guest cash (confirmed by the owner),
-- guest online (settled by the verify route or webhook), and POS online (settled the same way).
-- POS cash and POS credit invoices are issued by pos_place_bill itself, so the trigger leaves those alone.
-- Duplicate webhooks cannot duplicate invoices: orders.payment_status only changes to PAID once, and
-- invoices has a unique order_id with ON CONFLICT DO NOTHING.

create or replace function app.ensure_invoice(p_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  v_id uuid;
  v_prefix text;
begin
  select * into o from orders where id = p_order;
  if not found then return null; end if;
  if o.payment_status <> 'PAID' or o.order_status = 'CANCELLED' then return null; end if;

  select id into v_id from invoices where order_id = p_order;
  if v_id is not null then return v_id; end if;

  select invoice_prefix into v_prefix from store_settings where store_id = o.store_id;
  insert into invoices (store_id, order_id, invoice_number, invoice_date, taxable_paise, tax_paise, total_paise)
  values (o.store_id, o.id, app.next_number(o.store_id, 'invoice', coalesce(v_prefix, 'INV')),
          current_date, o.taxable_paise, o.tax_paise, o.total_paise)
  on conflict (order_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from invoices where order_id = p_order;
  else
    perform app.audit(o.store_id, 'invoice.issued', 'orders', o.id, null,
      jsonb_build_object('total_paise', o.total_paise, 'channel', o.channel));
  end if;
  return v_id;
end $$;

create or replace function app.orders_invoice_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'PAID'
     and (tg_op = 'INSERT' or old.payment_status is distinct from 'PAID')
     and not (new.channel = 'pos' and new.payment_method in ('cash','credit')) then
    perform app.ensure_invoice(new.id);
  end if;
  return null;
end $$;

drop trigger if exists orders_invoice_on_paid on orders;
create trigger orders_invoice_on_paid
  after insert or update of payment_status on orders
  for each row execute function app.orders_invoice_trigger();

revoke execute on function app.ensure_invoice(uuid), app.orders_invoice_trigger() from public, anon, authenticated;
