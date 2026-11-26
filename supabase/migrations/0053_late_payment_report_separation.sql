-- 0053: Separate late-payment refunds from ordinary sales refunds in reports.
-- Late-payment refunds (refund_type = 'late_payment') return money received after a
-- reservation expired or a cancellation. They do not change orders, stock or coupons,
-- so they must not reduce ordinary refund totals, sales revenue or refund tax estimates.
-- They are reported separately by report_late_payment_reconciliation.
-- Previously released migrations (0020, 0021, 0035) are not modified.

create or replace function report_summary(
  p_store uuid, p_start timestamptz, p_end timestamptz, p_from_date date, p_to_date date
) returns jsonb
language sql stable
set search_path = public
as $$
  with sales as (
    select o.* from orders o
    where o.store_id = p_store and o.order_status <> 'CANCELLED'
      and o.created_at >= p_start and o.created_at < p_end
  )
  select jsonb_build_object(
    'orderCount', (select count(*) from sales),
    'orderValuePaise', (select coalesce(sum(total_paise), 0) from sales),
    'taxablePaise', (select coalesce(sum(taxable_paise), 0) from sales),
    'gstPaise', (select coalesce(sum(tax_paise), 0) from sales),
    'discountPaise', (select coalesce(sum(discount_paise), 0) from sales),
    'collectedPaise', (select coalesce(sum(total_paise), 0) from sales where payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
    'creditSalesPaise', (select coalesce(sum(total_paise), 0) from sales where payment_method = 'credit'),
    'onlineCount', (select count(*) from sales where channel = 'online'),
    'onlineValuePaise', (select coalesce(sum(total_paise), 0) from sales where channel = 'online'),
    'posCount', (select count(*) from sales where channel = 'pos'),
    'posValuePaise', (select coalesce(sum(total_paise), 0) from sales where channel = 'pos'),
    'paymentOnlineCount', (select count(*) from sales where payment_method = 'online'),
    'paymentOnlineValuePaise', (select coalesce(sum(total_paise), 0) from sales where payment_method = 'online'),
    'paymentCashCount', (select count(*) from sales where payment_method = 'cash'),
    'paymentCashValuePaise', (select coalesce(sum(total_paise), 0) from sales where payment_method = 'cash'),
    'paymentCreditCount', (select count(*) from sales where payment_method = 'credit'),
    'paymentCreditValuePaise', (select coalesce(sum(total_paise), 0) from sales where payment_method = 'credit'),
    'cogsPaise', (select coalesce(sum(oi.stock_units * oi.cost_price_paise_snapshot), 0)
                  from order_items oi join sales s on s.id = oi.order_id),
    'refundsPaise', (select coalesce(sum(amount_paise), 0) from refunds
                     where store_id = p_store and status = 'succeeded' and refund_type is distinct from 'late_payment' and created_at >= p_start and created_at < p_end),
    'refundCount', (select count(*) from refunds
                    where store_id = p_store and status = 'succeeded' and refund_type is distinct from 'late_payment' and created_at >= p_start and created_at < p_end),
    'refundPendingCount', (select count(*) from refunds
                           where store_id = p_store and status in ('requested', 'processing') and refund_type is distinct from 'late_payment'),
    'refundPendingPaise', (select coalesce(sum(amount_paise), 0) from refunds
                           where store_id = p_store and status in ('requested', 'processing') and refund_type is distinct from 'late_payment'),
    'expensesPaise', (select coalesce(sum(amount_paise), 0) from expenses
                      where store_id = p_store and expense_on between p_from_date and p_to_date),
    'outstandingCreditPaise', (select coalesce(sum(total_paise), 0) from orders
                               where store_id = p_store and payment_method = 'credit'
                                 and payment_status <> 'PAID' and order_status <> 'CANCELLED'),
    'inventoryValuationPaise', (select coalesce(sum(i.on_hand * v.cost_price_paise), 0)
                                from inventory i join product_variants v on v.id = i.variant_id
                                where i.store_id = p_store),
    'damagedUnits', (select coalesce(sum(damaged), 0) from inventory where store_id = p_store)
  );
$$;

create or replace function report_trend(
  p_store uuid, p_start timestamptz, p_end timestamptz, p_bucket text, p_tz text default 'Asia/Kolkata'
) returns table (
  bucket_start date, orders bigint, order_value_paise bigint, taxable_paise bigint,
  collected_paise bigint, credit_paise bigint, online_value_paise bigint, pos_value_paise bigint,
  refunds_paise bigint
)
language sql stable
set search_path = public
as $$
  with sales as (
    select o.* from orders o
    where o.store_id = p_store and o.order_status <> 'CANCELLED'
      and o.created_at >= p_start and o.created_at < p_end
  ),
  refund_rows as (
    select r.* from refunds r
    where r.store_id = p_store and r.status = 'succeeded' and r.refund_type is distinct from 'late_payment'
      and r.created_at >= p_start and r.created_at < p_end
  )
  select b.bucket_start,
         coalesce(s.orders, 0), coalesce(s.order_value_paise, 0), coalesce(s.taxable_paise, 0),
         coalesce(s.collected_paise, 0), coalesce(s.credit_paise, 0),
         coalesce(s.online_value_paise, 0), coalesce(s.pos_value_paise, 0),
         coalesce(rf.refunds_paise, 0)
  from (
    select distinct date_trunc(p_bucket, x.created_at at time zone p_tz)::date as bucket_start
    from (select created_at from sales union all select created_at from refund_rows) x
  ) b
  left join (
    select date_trunc(p_bucket, created_at at time zone p_tz)::date as bucket_start,
           count(*) as orders, sum(total_paise) as order_value_paise, sum(taxable_paise) as taxable_paise,
           sum(case when payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') then total_paise else 0 end) as collected_paise,
           sum(case when payment_method = 'credit' then total_paise else 0 end) as credit_paise,
           sum(case when channel = 'online' then total_paise else 0 end) as online_value_paise,
           sum(case when channel = 'pos' then total_paise else 0 end) as pos_value_paise
    from sales group by 1
  ) s on s.bucket_start = b.bucket_start
  left join (
    select date_trunc(p_bucket, created_at at time zone p_tz)::date as bucket_start, sum(amount_paise) as refunds_paise
    from refund_rows group by 1
  ) rf on rf.bucket_start = b.bucket_start
  where p_bucket in ('day', 'week', 'month', 'year')
  order by 1;
$$;

create or replace function report_refund_tax(p_store uuid, p_start timestamptz, p_end timestamptz)
returns table (refunds_paise bigint, estimated_tax_paise bigint)
language sql stable
set search_path = public
as $$
  select coalesce(sum(r.amount_paise), 0),
         coalesce(round(sum(r.amount_paise::numeric * o.tax_paise / nullif(o.total_paise, 0)))::bigint, 0)
  from refunds r join orders o on o.id = r.order_id
  where r.store_id = p_store and r.status = 'succeeded' and r.refund_type is distinct from 'late_payment' and r.created_at >= p_start and r.created_at < p_end;
$$;

create or replace function public.zb_qr_summary(p_store uuid, p_from date, p_to date)
returns table (
  entries bigint, unique_sessions bigint, repeat_entries bigint,
  entries_today bigint, entries_last_7_days bigint, entries_month_to_date bigint,
  attributed_orders bigint, paid_orders bigint, paid_value_paise bigint, refunded_paise bigint,
  converted_sessions bigint, conversion_bps integer
)
language plpgsql stable security definer set search_path = public, app as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not app.qr_analytics_allowed(p_store) then
    raise exception 'not authorised for QR analytics' using errcode = '42501';
  end if;
  if p_store is null and not app.is_platform_admin() then
    raise exception 'not authorised for platform QR analytics' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  return query
  with ev as (
    select e.guest_session_id, (e.entered_at at time zone 'Asia/Kolkata')::date as d
      from qr_entry_events e
     where (p_store is null or e.store_id = p_store)
  ),
  ev_range as (select * from ev where d between p_from and p_to),
  att as (
    select a.guest_session_id, o.id as order_id, o.order_status, o.payment_status, o.total_paise
      from qr_order_attributions a
      join orders o on o.id = a.order_id
     where (p_store is null or a.store_id = p_store)
       and (a.entered_at at time zone 'Asia/Kolkata')::date between p_from and p_to
       and o.order_status <> 'CANCELLED'
  ),
  att_paid as (select * from att where payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  counts as (
    select (select count(*) from ev_range)::bigint as entries,
           (select count(distinct guest_session_id) from ev_range)::bigint as unique_sessions
  )
  select c.entries,
         c.unique_sessions,
         (c.entries - c.unique_sessions)::bigint,
         (select count(*) from ev where d = today)::bigint,
         (select count(*) from ev where d between today - 6 and today)::bigint,
         (select count(*) from ev where d >= date_trunc('month', today)::date and d <= today)::bigint,
         (select count(*) from att)::bigint,
         (select count(*) from att_paid)::bigint,
         (select coalesce(sum(total_paise), 0) from att_paid)::bigint,
         (select coalesce(sum(r.amount_paise), 0) from refunds r
             where r.status = 'succeeded' and r.refund_type is distinct from 'late_payment' and r.order_id in (select order_id from att_paid))::bigint,
         (select count(distinct guest_session_id) from att_paid)::bigint,
         case when c.unique_sessions = 0 then null
              else round(((select count(distinct guest_session_id) from att_paid)::numeric * 10000) / c.unique_sessions)::integer
         end
    from counts c;
end $$;


create or replace function report_late_payment_reconciliation(
  p_store uuid, p_start timestamptz, p_end timestamptz
) returns jsonb
language sql stable
set search_path = public
as $$
  with lp as (
    select l.* from late_payments l
    where l.store_id = p_store and l.created_at >= p_start and l.created_at < p_end
  ),
  lr as (
    select r.* from refunds r
    where r.store_id = p_store and r.refund_type = 'late_payment'
      and r.created_at >= p_start and r.created_at < p_end
  )
  select jsonb_build_object(
    'lateReceivedCount', (select count(*) from lp),
    'lateReceivedPaise', (select coalesce(sum(amount_paise), 0) from lp),
    'lateOpenCount', (select count(*) from lp where status = 'open'),
    'lateOpenPaise', (select coalesce(sum(amount_paise), 0) from lp where status = 'open'),
    'lateRefundRequestedCount', (select count(*) from lp where status = 'refund_requested'),
    'lateFulfilmentApprovedCount', (select count(*) from lp where status = 'fulfilment_approved'),
    'lateDismissedCount', (select count(*) from lp where status = 'dismissed'),
    'lateRefundSucceededCount', (select count(*) from lr where status = 'succeeded'),
    'lateRefundSucceededPaise', (select coalesce(sum(amount_paise), 0) from lr where status = 'succeeded'),
    'lateRefundPendingCount', (select count(*) from lr where status in ('requested', 'processing')),
    'lateRefundPendingPaise', (select coalesce(sum(amount_paise), 0) from lr where status in ('requested', 'processing'))
  );
$$;
