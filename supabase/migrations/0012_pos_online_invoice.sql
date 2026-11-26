-- 0012: an online POS bill is completed, and invoiced, once its payment is PAID.
-- Settlement (settle_online_payment and the webhook) does not issue invoices for any order, so the POS
-- completion step does it. The invoice number is taken from the store's counter; the function is idempotent.
-- Guest online orders still get no invoice from settlement; that is listed as remaining work.

create or replace function pos_sync_bill(p_bill uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_order orders%rowtype;
  v_invoice_prefix text;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_bill.store_id, array['owner','manager','staff']);
  if v_bill.status <> 'AWAITING_PAYMENT' then return v_bill.status; end if;

  select * into v_order from orders where id = v_bill.order_id for update;
  if v_order.payment_status <> 'PAID' then return 'AWAITING_PAYMENT'; end if;

  if not exists (select 1 from invoices where order_id = v_order.id) then
    select invoice_prefix into v_invoice_prefix from store_settings where store_id = v_bill.store_id;
    insert into invoices (store_id, order_id, invoice_number, invoice_date, taxable_paise, tax_paise, total_paise)
    values (v_bill.store_id, v_order.id, app.next_number(v_bill.store_id, 'invoice', coalesce(v_invoice_prefix, 'INV')),
            current_date, v_order.taxable_paise, v_order.tax_paise, v_order.total_paise);
  end if;

  update pos_bills set status = 'COMPLETED', completed_at = now(), updated_at = now() where id = p_bill;
  perform app.audit(v_bill.store_id, 'pos.completed', 'orders', v_order.id, null,
    jsonb_build_object('bill', v_bill.bill_reference));
  return 'COMPLETED';
end $$;
