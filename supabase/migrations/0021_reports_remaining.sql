-- 0021: remaining owner report aggregations (purchasing, customers and credit, cash, stock, GST).
-- Same conventions as 0020: store-scoped, service-role only, money in integer paise, calendar dates in IST.
-- Date-based sources (receipts, invoices, payments, cash days) take dates; instant-based sources take timestamptz.

create or replace function report_ist_date(p_ts timestamptz) returns date
language sql immutable as $$ select (p_ts at time zone 'Asia/Kolkata')::date $$;

-- Supplier-wise purchasing in a period, plus each supplier's all-time open balance (invoices less payments).
create or replace function report_supplier_summary(p_store uuid, p_from date, p_to date)
returns table (
  supplier_id uuid, supplier_name text, po_count bigint, po_value_paise bigint,
  receipt_count bigint, received_value_paise bigint, invoiced_paise bigint, paid_paise bigint,
  outstanding_paise bigint
)
language sql stable
set search_path = public
as $$
  select s.id, s.name,
    coalesce(po.cnt, 0), coalesce(po.val, 0),
    coalesce(gr.cnt, 0), coalesce(gr.val, 0),
    coalesce(inv.amt, 0), coalesce(pay.amt, 0),
    coalesce(bal.inv_all, 0) - coalesce(bal.paid_all, 0)
  from suppliers s
  left join (
    select supplier_id, count(*) cnt, sum(total_paise) val from purchase_orders
    where store_id = p_store and status <> 'cancelled' and report_ist_date(created_at) between p_from and p_to
    group by supplier_id) po on po.supplier_id = s.id
  left join (
    select g.supplier_id, count(distinct g.id) cnt, sum(i.quantity_received * i.unit_cost_paise) val
    from goods_receipts g join goods_receipt_items i on i.goods_receipt_id = g.id
    where g.store_id = p_store and g.received_on between p_from and p_to
    group by g.supplier_id) gr on gr.supplier_id = s.id
  left join (
    select supplier_id, sum(amount_paise) amt from supplier_invoices
    where store_id = p_store and invoice_date between p_from and p_to group by supplier_id) inv on inv.supplier_id = s.id
  left join (
    select supplier_id, sum(amount_paise) amt from supplier_payments
    where store_id = p_store and paid_on between p_from and p_to group by supplier_id) pay on pay.supplier_id = s.id
  left join (
    select si.supplier_id,
           sum(si.amount_paise) as inv_all,
           coalesce(sum(p.paid), 0) as paid_all
    from supplier_invoices si
    left join (select supplier_invoice_id, sum(amount_paise) paid from supplier_payments group by 1) p
      on p.supplier_invoice_id = si.id
    where si.store_id = p_store
    group by si.supplier_id) bal on bal.supplier_id = s.id
  where s.store_id = p_store
  order by s.name;
$$;

create or replace function report_purchase_orders(p_store uuid, p_from date, p_to date, p_open_only boolean default false)
returns table (
  po_id uuid, po_number text, supplier_name text, status text, expected_on date, created_on date,
  total_paise bigint, ordered_units bigint, received_units bigint
)
language sql stable
set search_path = public
as $$
  select po.id, po.po_number, s.name, po.status, po.expected_on, report_ist_date(po.created_at), po.total_paise,
         coalesce(sum(i.quantity_ordered), 0), coalesce(sum(i.quantity_received), 0)
  from purchase_orders po
  join suppliers s on s.id = po.supplier_id
  left join purchase_order_items i on i.purchase_order_id = po.id
  where po.store_id = p_store
    and report_ist_date(po.created_at) between p_from and p_to
    and (not p_open_only or po.status in ('draft', 'sent', 'partially_received'))
  group by po.id, po.po_number, s.name, po.status, po.expected_on, po.created_at, po.total_paise
  order by po.created_at desc;
$$;

create or replace function report_goods_receipts(p_store uuid, p_from date, p_to date)
returns table (grn_number text, received_on date, supplier_name text, po_number text, lines bigint,
               units_received bigint, units_damaged bigint, value_paise bigint)
language sql stable
set search_path = public
as $$
  select g.grn_number, g.received_on, s.name, po.po_number, count(i.id),
         coalesce(sum(i.quantity_received), 0), coalesce(sum(i.quantity_damaged), 0),
         coalesce(sum(i.quantity_received * i.unit_cost_paise), 0)
  from goods_receipts g
  join suppliers s on s.id = g.supplier_id
  left join purchase_orders po on po.id = g.purchase_order_id
  left join goods_receipt_items i on i.goods_receipt_id = g.id
  where g.store_id = p_store and g.received_on between p_from and p_to
  group by g.id, g.grn_number, g.received_on, s.name, po.po_number
  order by g.received_on desc, g.grn_number desc;
$$;

create or replace function report_supplier_payments(p_store uuid, p_from date, p_to date)
returns table (paid_on date, supplier_name text, invoice_number text, amount_paise bigint, method text, reference text)
language sql stable
set search_path = public
as $$
  select p.paid_on, s.name, si.invoice_number, p.amount_paise, p.method, p.reference
  from supplier_payments p
  join suppliers s on s.id = p.supplier_id
  left join supplier_invoices si on si.id = p.supplier_invoice_id
  where p.store_id = p_store and p.paid_on between p_from and p_to
  order by p.paid_on desc, p.created_at desc;
$$;

-- Open supplier invoices as at a date, with due date from the supplier's payment terms.
create or replace function report_supplier_open_invoices(p_store uuid, p_asof date)
returns table (invoice_id uuid, invoice_number text, supplier_name text, invoice_date date, due_date date,
               amount_paise bigint, paid_paise bigint, outstanding_paise bigint, days_overdue integer)
language sql stable
set search_path = public
as $$
  select si.id, si.invoice_number, s.name, si.invoice_date,
         si.invoice_date + coalesce(s.payment_terms_days, 0),
         si.amount_paise, coalesce(p.paid, 0), si.amount_paise - coalesce(p.paid, 0),
         greatest(0, (p_asof - (si.invoice_date + coalesce(s.payment_terms_days, 0)))::int)
  from supplier_invoices si
  join suppliers s on s.id = si.supplier_id
  left join (select supplier_invoice_id, sum(amount_paise) paid from supplier_payments group by 1) p
    on p.supplier_invoice_id = si.id
  where si.store_id = p_store and si.amount_paise - coalesce(p.paid, 0) > 0
  order by si.invoice_date + coalesce(s.payment_terms_days, 0), si.invoice_number;
$$;

-- Customer-wise sales in a period. Walk-in or guest orders without a customer record are grouped together.
create or replace function report_customer_summary(p_store uuid, p_start timestamptz, p_end timestamptz)
returns table (customer_id uuid, customer_name text, mobile text, orders_in_period bigint, value_paise bigint,
               collected_paise bigint, last_order_at timestamptz, orders_before_period bigint, is_repeat boolean)
language sql stable
set search_path = public
as $$
  with period as (
    select o.* from orders o
    where o.store_id = p_store and o.order_status <> 'CANCELLED' and o.created_at >= p_start and o.created_at < p_end
  ),
  prior as (
    select o.customer_id, count(*) cnt from orders o
    where o.store_id = p_store and o.order_status <> 'CANCELLED' and o.created_at < p_start and o.customer_id is not null
    group by 1
  )
  select c.id,
         coalesce(c.full_name, max(p.customer_name), 'Walk-in customer'),
         coalesce(c.mobile, max(p.customer_mobile)),
         count(p.id), coalesce(sum(p.total_paise), 0),
         coalesce(sum(case when p.payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') then p.total_paise else 0 end), 0),
         max(p.created_at),
         coalesce(max(pr.cnt), 0),
         (count(p.id) >= 2 or coalesce(max(pr.cnt), 0) > 0)
  from period p
  left join customers c on c.id = p.customer_id
  left join prior pr on pr.customer_id = p.customer_id
  group by c.id, c.full_name, c.mobile
  order by coalesce(sum(p.total_paise), 0) desc;
$$;

create or replace function report_customer_orders(p_store uuid, p_customer uuid, p_limit int, p_offset int)
returns table (order_number text, created_at timestamptz, channel text, payment_method text, payment_status text,
               total_paise bigint, order_status text)
language sql stable
set search_path = public
as $$
  select o.order_number, o.created_at, o.channel, o.payment_method, o.payment_status, o.total_paise, o.order_status
  from orders o
  where o.store_id = p_store and o.customer_id = p_customer
  order by o.created_at desc
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

-- Outstanding customer credit and overdue amounts. Overdue uses FIFO allocation of payments to the oldest sales.
-- Adjustments count in the balance but are not allocated by FIFO.
create or replace function report_credit_overdue(p_store uuid, p_asof date)
returns table (customer_id uuid, customer_name text, mobile text, balance_paise bigint, outstanding_paise bigint,
               overdue_paise bigint, oldest_unpaid_due date)
language sql stable
set search_path = public
as $$
  with ledger as (
    select l.customer_id, l.entry_type, l.amount_paise, l.due_on, l.created_at, l.id from credit_ledger l
    where l.store_id = p_store
  ),
  paid as (
    select customer_id, -sum(amount_paise) as paid from ledger where entry_type = 'payment' group by 1
  ),
  sales as (
    select customer_id, id, amount_paise, due_on,
           sum(amount_paise) over (partition by customer_id order by due_on, created_at, id
                                   rows between unbounded preceding and current row) as cum
    from ledger where entry_type = 'sale'
  ),
  allocated as (
    select s.customer_id, s.due_on,
           greatest(0, least(s.amount_paise, s.cum - coalesce(p.paid, 0))) as unpaid
    from sales s left join paid p on p.customer_id = s.customer_id
  )
  select c.id, c.full_name, c.mobile,
         bal.balance,
         coalesce(a.outstanding, 0),
         coalesce(a.overdue, 0),
         a.oldest
  from customers c
  join (select customer_id, sum(amount_paise) balance from ledger group by 1) bal on bal.customer_id = c.id
  left join (
    select customer_id, sum(unpaid) outstanding,
           sum(case when due_on < p_asof then unpaid else 0 end) overdue,
           min(due_on) filter (where unpaid > 0) oldest
    from allocated group by 1
  ) a on a.customer_id = c.id
  where c.store_id = p_store and bal.balance <> 0
  order by coalesce(a.overdue, 0) desc, c.full_name;
$$;

create or replace function report_credit_collections(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (collected_on date, customer_name text, amount_paise bigint, note text)
language sql stable
set search_path = public
as $$
  select report_ist_date(l.created_at), c.full_name, -l.amount_paise, l.note
  from credit_ledger l
  join customers c on c.id = l.customer_id
  where l.store_id = p_store and l.entry_type = 'payment'
    and l.created_at >= p_from and l.created_at < p_to
  order by l.created_at desc;
$$;

-- Cash days from the reconciliation history. Only closed days appear; open days are not estimated.
create or replace function report_cash_days(p_store uuid, p_from date, p_to date)
returns table (business_date date, opening_paise bigint, cash_sales_paise bigint, cash_refunds_paise bigint,
               cash_expenses_paise bigint, cash_deposits_paise bigint, cash_withdrawals_paise bigint,
               manual_in_paise bigint, manual_out_paise bigint, expected_closing_paise bigint,
               actual_closing_paise bigint, difference_paise bigint, shortage_paise bigint, excess_paise bigint)
language sql stable
set search_path = public
as $$
  select business_date, opening_paise, cash_sales_paise, cash_refunds_paise, cash_expenses_paise,
         cash_deposits_paise, cash_withdrawals_paise, cash_manual_in_paise, cash_manual_out_paise,
         expected_closing_paise, actual_closing_paise, difference_paise,
         greatest(0, -difference_paise), greatest(0, difference_paise)
  from cash_reconciliations
  where store_id = p_store and business_date between p_from and p_to
  order by business_date desc;
$$;

create or replace function report_cash_movements(p_store uuid, p_from date, p_to date)
returns table (movement_type text, movements bigint, amount_paise bigint)
language sql stable
set search_path = public
as $$
  select movement_type, count(*), sum(amount_paise)
  from cash_movements
  where store_id = p_store and business_date between p_from and p_to
  group by movement_type
  order by movement_type;
$$;

create or replace function report_stock_movements(
  p_store uuid, p_start timestamptz, p_end timestamptz, p_type text default null, p_limit int default 50, p_offset int default 0
) returns table (created_at timestamptz, sku text, product_name text, movement_type text, quantity bigint,
                 reference_type text, note text, actor_id uuid)
language sql stable
set search_path = public
as $$
  select m.created_at, v.sku, p.name, m.movement_type, m.quantity, m.reference_type, m.note, m.actor_id
  from stock_movements m
  join product_variants v on v.id = m.variant_id
  join products p on p.id = v.product_id
  where m.store_id = p_store and m.created_at >= p_start and m.created_at < p_end
    and (p_type is null or m.movement_type = p_type)
  order by m.created_at desc, m.id
  limit greatest(1, least(p_limit, 500)) offset greatest(0, p_offset);
$$;

create or replace function report_stock_movement_count(p_store uuid, p_start timestamptz, p_end timestamptz, p_type text default null)
returns bigint
language sql stable
set search_path = public
as $$
  select count(*) from stock_movements m
  where m.store_id = p_store and m.created_at >= p_start and m.created_at < p_end
    and (p_type is null or m.movement_type = p_type);
$$;

-- Tile batch performance: stock on hand, reserved and damaged now, and units sold from this batch in the period.
create or replace function report_batch_performance(p_store uuid, p_start timestamptz, p_end timestamptz)
returns table (batch_number text, sku text, product_name text, on_hand bigint, reserved bigint, damaged bigint,
               sold_units bigint, value_at_cost_paise bigint)
language sql stable
set search_path = public
as $$
  select b.batch_number, v.sku, p.name, b.on_hand, b.reserved, b.damaged,
         coalesce(sold.units, 0),
         b.on_hand * v.cost_price_paise
  from inventory_batches b
  join product_variants v on v.id = b.variant_id
  join products p on p.id = v.product_id
  left join (
    select m.batch_id, sum(-m.quantity) units
    from stock_movements m
    where m.store_id = p_store and m.movement_type = 'sale' and m.created_at >= p_start and m.created_at < p_end
      and m.batch_id is not null
    group by 1) sold on sold.batch_id = b.id
  where b.store_id = p_store
  order by coalesce(sold.units, 0) desc, b.batch_number;
$$;

-- GST by rate: taxable value and GST on every order line in the period (cancelled orders excluded).
create or replace function report_gst_rates(p_store uuid, p_start timestamptz, p_end timestamptz)
returns table (gst_rate_bps integer, lines bigint, taxable_paise bigint, gst_paise bigint, line_total_paise bigint)
language sql stable
set search_path = public
as $$
  select oi.gst_rate_bps, count(*), sum(oi.taxable_paise), sum(oi.tax_paise), sum(oi.line_total_paise)
  from order_items oi join orders o on o.id = oi.order_id
  where o.store_id = p_store and o.order_status <> 'CANCELLED' and o.created_at >= p_start and o.created_at < p_end
  group by oi.gst_rate_bps
  order by oi.gst_rate_bps;
$$;

-- Tax on refunds, pro rata to each order's tax share. This is an estimate: refunds do not carry a tax split.
create or replace function report_refund_tax(p_store uuid, p_start timestamptz, p_end timestamptz)
returns table (refunds_paise bigint, estimated_tax_paise bigint)
language sql stable
set search_path = public
as $$
  select coalesce(sum(r.amount_paise), 0),
         coalesce(round(sum(r.amount_paise::numeric * o.tax_paise / nullif(o.total_paise, 0)))::bigint, 0)
  from refunds r join orders o on o.id = r.order_id
  where r.store_id = p_store and r.status = 'succeeded' and r.created_at >= p_start and r.created_at < p_end;
$$;

-- Invoice-level GST records. Tax is stored as one figure per invoice; no CGST/SGST/IGST split exists yet.
create or replace function report_invoices(p_store uuid, p_from date, p_to date)
returns table (invoice_number text, invoice_date date, order_number text, taxable_paise bigint, tax_paise bigint, total_paise bigint)
language sql stable
set search_path = public
as $$
  select i.invoice_number, i.invoice_date, o.order_number, i.taxable_paise, i.tax_paise, i.total_paise
  from invoices i join orders o on o.id = i.order_id
  where i.store_id = p_store and i.invoice_date between p_from and p_to
  order by i.invoice_date desc, i.invoice_number desc;
$$;

revoke execute on function report_ist_date(timestamptz) from public, anon, authenticated;
revoke execute on function report_supplier_summary(uuid, date, date) from public, anon, authenticated;
revoke execute on function report_purchase_orders(uuid, date, date, boolean) from public, anon, authenticated;
revoke execute on function report_goods_receipts(uuid, date, date) from public, anon, authenticated;
revoke execute on function report_supplier_payments(uuid, date, date) from public, anon, authenticated;
revoke execute on function report_supplier_open_invoices(uuid, date) from public, anon, authenticated;
revoke execute on function report_customer_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function report_customer_orders(uuid, uuid, int, int) from public, anon, authenticated;
revoke execute on function report_credit_overdue(uuid, date) from public, anon, authenticated;
revoke execute on function report_credit_collections(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function report_cash_days(uuid, date, date) from public, anon, authenticated;
revoke execute on function report_cash_movements(uuid, date, date) from public, anon, authenticated;
revoke execute on function report_stock_movements(uuid, timestamptz, timestamptz, text, int, int) from public, anon, authenticated;
revoke execute on function report_stock_movement_count(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function report_batch_performance(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function report_gst_rates(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function report_refund_tax(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function report_invoices(uuid, date, date) from public, anon, authenticated;
