-- 0020: database aggregation for owner reports.
-- Totals are computed in the database over the full period, so application row limits cannot truncate them.
-- Every function takes the store as a parameter and is executable only by the service role, which the
-- owner reports service calls after checking the signed-in owner's store membership.
-- Money is integer paise. Periods are timestamptz instants; calendar grouping uses the store time zone.

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
                     where store_id = p_store and status = 'succeeded' and created_at >= p_start and created_at < p_end),
    'refundCount', (select count(*) from refunds
                    where store_id = p_store and status = 'succeeded' and created_at >= p_start and created_at < p_end),
    'refundPendingCount', (select count(*) from refunds
                           where store_id = p_store and status in ('requested', 'processing')),
    'refundPendingPaise', (select coalesce(sum(amount_paise), 0) from refunds
                           where store_id = p_store and status in ('requested', 'processing')),
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
    where r.store_id = p_store and r.status = 'succeeded'
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

-- Category and brand grouping. Lines are counted once per order line; nothing is double-counted across groups.
create or replace function report_group_sales(
  p_store uuid, p_start timestamptz, p_end timestamptz, p_group text,
  p_category uuid default null, p_brand uuid default null
) returns table (group_id uuid, group_name text, units numeric, taxable_paise bigint, cogs_paise bigint, line_count bigint)
language sql stable
set search_path = public
as $$
  select
    case when p_group = 'brand' then p.brand_id else p.category_id end,
    coalesce(case when p_group = 'brand' then b.name else c.name end, 'Unassigned'),
    sum(oi.quantity), sum(oi.taxable_paise), sum(oi.stock_units * oi.cost_price_paise_snapshot), count(*)
  from order_items oi
  join orders o on o.id = oi.order_id
  join product_variants v on v.id = oi.variant_id
  join products p on p.id = v.product_id
  left join categories c on c.id = p.category_id
  left join brands b on b.id = p.brand_id
  where o.store_id = p_store and o.order_status <> 'CANCELLED'
    and o.created_at >= p_start and o.created_at < p_end
    and (p_category is null or p.category_id = p_category)
    and (p_brand is null or p.brand_id = p_brand)
  group by 1, 2
  order by 4 desc;
$$;

-- Product sales with historical cost. Used for best sellers (order by taxable) and the Products export.
create or replace function report_product_sales(
  p_store uuid, p_start timestamptz, p_end timestamptz, p_category uuid default null, p_brand uuid default null
) returns table (sku text, product_name text, units numeric, taxable_paise bigint, cogs_paise bigint, last_sold_at timestamptz)
language sql stable
set search_path = public
as $$
  select oi.sku_snapshot, max(oi.product_name_snapshot), sum(oi.quantity), sum(oi.taxable_paise),
         sum(oi.stock_units * oi.cost_price_paise_snapshot), max(o.created_at)
  from order_items oi
  join orders o on o.id = oi.order_id
  join product_variants v on v.id = oi.variant_id
  join products p on p.id = v.product_id
  where o.store_id = p_store and o.order_status <> 'CANCELLED'
    and o.created_at >= p_start and o.created_at < p_end
    and (p_category is null or p.category_id = p_category)
    and (p_brand is null or p.brand_id = p_brand)
  group by oi.sku_snapshot
  order by sum(oi.taxable_paise) desc;
$$;

-- In stock with no sale in the period. Ordered by stock value at cost, so the largest idle value comes first.
create or replace function report_slow_movers(
  p_store uuid, p_start timestamptz, p_end timestamptz, p_category uuid default null, p_brand uuid default null
) returns table (sku text, product_name text, label text, on_hand bigint, value_at_cost_paise bigint, last_sold_at timestamptz)
language sql stable
set search_path = public
as $$
  select v.sku, p.name, v.label, i.on_hand, i.on_hand * v.cost_price_paise,
         (select max(o.created_at) from order_items oi join orders o on o.id = oi.order_id
          where oi.variant_id = v.id and o.order_status <> 'CANCELLED')
  from inventory i
  join product_variants v on v.id = i.variant_id
  join products p on p.id = v.product_id
  where i.store_id = p_store and i.on_hand > 0
    and (p_category is null or p.category_id = p_category)
    and (p_brand is null or p.brand_id = p_brand)
    and not exists (
      select 1 from order_items oi join orders o on o.id = oi.order_id
      where oi.variant_id = v.id and o.order_status <> 'CANCELLED'
        and o.created_at >= p_start and o.created_at < p_end)
  order by i.on_hand * v.cost_price_paise desc;
$$;

create or replace function report_stock_status(
  p_store uuid, p_category uuid default null, p_brand uuid default null
) returns table (sku text, product_name text, label text, on_hand bigint, reserved bigint, available bigint,
                 damaged bigint, reorder_level bigint, status text)
language sql stable
set search_path = public
as $$
  select v.sku, p.name, v.label, i.on_hand, i.reserved, i.on_hand - i.reserved, i.damaged, i.reorder_level,
         case when i.on_hand - i.reserved <= 0 then 'OUT_OF_STOCK'
              when i.on_hand - i.reserved <= i.reorder_level then 'LOW_STOCK'
              else 'IN_STOCK' end
  from inventory i
  join product_variants v on v.id = i.variant_id
  join products p on p.id = v.product_id
  where i.store_id = p_store
    and (p_category is null or p.category_id = p_category)
    and (p_brand is null or p.brand_id = p_brand)
  order by 9, 1;
$$;

create or replace function report_coupon_usage(p_store uuid, p_start timestamptz, p_end timestamptz)
returns table (code text, redemptions bigint, discount_paise bigint, orders bigint)
language sql stable
set search_path = public
as $$
  select c.code, count(r.id), coalesce(sum(r.discount_paise), 0), count(distinct r.order_id)
  from coupon_redemptions r
  join coupons c on c.id = r.coupon_id
  where r.store_id = p_store and r.created_at >= p_start and r.created_at < p_end
  group by c.code
  order by sum(r.discount_paise) desc;
$$;

create or replace function report_quotation_funnel(p_store uuid, p_start timestamptz, p_end timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'requests', count(*),
    'sent', count(*) filter (where sent_at is not null or status in ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED')),
    'accepted', count(*) filter (where status in ('ACCEPTED', 'CONVERTED')),
    'rejected', count(*) filter (where status = 'REJECTED'),
    'expired', count(*) filter (where status = 'EXPIRED'),
    'converted', count(*) filter (where status = 'CONVERTED'),
    'quotedValuePaise', coalesce(sum(total_paise) filter (where status <> 'CANCELLED'), 0),
    'convertedRevenuePaise', coalesce(sum(total_paise) filter (where status = 'CONVERTED'), 0)
  )
  from quotations
  where store_id = p_store and created_at >= p_start and created_at < p_end;
$$;

-- Only the service role may run reports; signed-in customers and owners reach them through the app after checks.
revoke execute on function report_summary(uuid, timestamptz, timestamptz, date, date) from public, anon, authenticated;
revoke execute on function report_trend(uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function report_group_sales(uuid, timestamptz, timestamptz, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function report_product_sales(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function report_slow_movers(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function report_stock_status(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function report_coupon_usage(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function report_quotation_funnel(uuid, timestamptz, timestamptz) from public, anon, authenticated;
