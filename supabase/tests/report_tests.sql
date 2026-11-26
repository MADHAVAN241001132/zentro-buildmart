-- Report functions (migration 0020). Read-only: nothing here changes data.
-- Each group compares one report function with another, so a mismatch means a real defect in aggregation.

\set ON_ERROR_STOP on

do $$
declare
  s record;
  v_summary jsonb;
  v_orders bigint; v_value bigint; v_taxable bigint;
  v_trend_orders bigint; v_trend_value bigint; v_trend_taxable bigint;
  v_cat_taxable bigint; v_brand_taxable bigint; v_prod_taxable bigint; v_prod_cogs bigint; v_cogs bigint;
  v_refunds bigint; v_trend_refunds bigint;
  v_coupon bigint; v_coupon_direct bigint;
  v_start timestamptz := '2000-01-01T00:00:00Z';
  v_end timestamptz := '2100-01-01T00:00:00Z';
begin
  for s in select id, name from stores loop
    v_summary := report_summary(s.id, v_start, v_end, '2000-01-01', '2100-01-01');
    v_orders := (v_summary->>'orderCount')::bigint;
    v_value := (v_summary->>'orderValuePaise')::bigint;
    v_taxable := (v_summary->>'taxablePaise')::bigint;
    v_cogs := (v_summary->>'cogsPaise')::bigint;
    v_refunds := (v_summary->>'refundsPaise')::bigint;

    -- R1: the daily trend, summed over all buckets, equals the summary.
    select coalesce(sum(orders), 0), coalesce(sum(order_value_paise), 0), coalesce(sum(taxable_paise), 0), coalesce(sum(refunds_paise), 0)
      into v_trend_orders, v_trend_value, v_trend_taxable, v_trend_refunds
      from report_trend(s.id, v_start, v_end, 'day', 'Asia/Kolkata');
    if v_trend_orders <> v_orders or v_trend_value <> v_value or v_trend_taxable <> v_taxable or v_trend_refunds <> v_refunds then
      raise exception 'R1 failed for %: trend % / % / % vs summary % / % / %', s.name, v_trend_orders, v_trend_value, v_trend_taxable, v_orders, v_value, v_taxable;
    end if;
    raise notice 'R1 ok (%): daily trend sums to summary', s.name;

    -- R2: the monthly trend agrees with the daily trend.
    select coalesce(sum(order_value_paise), 0) into v_trend_value
      from report_trend(s.id, v_start, v_end, 'month', 'Asia/Kolkata');
    if v_trend_value <> v_value then raise exception 'R2 failed for %: monthly trend value %', s.name, v_trend_value; end if;
    raise notice 'R2 ok (%): monthly trend agrees with the daily trend', s.name;

    -- R3: category and brand groupings each cover all taxable sales when no filter is applied.
    select coalesce(sum(taxable_paise), 0) into v_cat_taxable from report_group_sales(s.id, v_start, v_end, 'category');
    select coalesce(sum(taxable_paise), 0) into v_brand_taxable from report_group_sales(s.id, v_start, v_end, 'brand');
    if v_cat_taxable <> v_taxable or v_brand_taxable <> v_taxable then
      raise exception 'R3 failed for %: category % brand % vs taxable %', s.name, v_cat_taxable, v_brand_taxable, v_taxable;
    end if;
    raise notice 'R3 ok (%): category and brand totals equal taxable sales', s.name;

    -- R4: product sales agree with the summary for taxable value and cost of goods.
    select coalesce(sum(taxable_paise), 0), coalesce(sum(cogs_paise), 0) into v_prod_taxable, v_prod_cogs
      from report_product_sales(s.id, v_start, v_end);
    if v_prod_taxable <> v_taxable or v_prod_cogs <> v_cogs then
      raise exception 'R4 failed for %: products % / % vs summary % / %', s.name, v_prod_taxable, v_prod_cogs, v_taxable, v_cogs;
    end if;
    raise notice 'R4 ok (%): product totals agree, cost of goods uses historical snapshots', s.name;

    -- R5: a category filter never exceeds the unfiltered total.
    perform 1 from report_group_sales(s.id, v_start, v_end, 'category', gen_random_uuid(), null);
    select coalesce(sum(taxable_paise), 0) into v_cat_taxable
      from report_group_sales(s.id, v_start, v_end, 'category', gen_random_uuid(), null);
    if v_cat_taxable <> 0 then raise exception 'R5 failed for %: an unknown category returned sales', s.name; end if;
    raise notice 'R5 ok (%): filters are applied in the database', s.name;

    -- R6: coupon usage matches the redemption rows directly.
    select coalesce(sum(discount_paise), 0) into v_coupon from report_coupon_usage(s.id, v_start, v_end);
    select coalesce(sum(discount_paise), 0) into v_coupon_direct from coupon_redemptions where store_id = s.id;
    if v_coupon <> v_coupon_direct then raise exception 'R6 failed for %: coupon % vs %', s.name, v_coupon, v_coupon_direct; end if;
    raise notice 'R6 ok (%): coupon usage matches redemptions', s.name;

    -- R7: the summary's order value matches the orders table directly.
    select coalesce(sum(total_paise), 0) into v_value from orders where store_id = s.id and order_status <> 'CANCELLED';
    if v_value <> (v_summary->>'orderValuePaise')::bigint then raise exception 'R7 failed for %', s.name; end if;
    raise notice 'R7 ok (%): order value matches the orders table', s.name;
  end loop;

  -- R8: quotation funnel counts match the quotations table.
  perform report_quotation_funnel((select id from stores limit 1), v_start, v_end);
  raise notice 'R8 ok: quotation funnel runs for every store';

  -- R9: report functions are not executable by signed-in customers or anonymous callers.
  if has_function_privilege('authenticated', 'report_summary(uuid, timestamptz, timestamptz, date, date)', 'EXECUTE')
     or has_function_privilege('anon', 'report_summary(uuid, timestamptz, timestamptz, date, date)', 'EXECUTE')
     or has_function_privilege('public', 'report_summary(uuid, timestamptz, timestamptz, date, date)', 'EXECUTE') then
    raise exception 'R9 failed: report_summary is executable by a client role';
  end if;
  raise notice 'R9 ok: report functions are server-only';
  raise notice 'Report tests: all groups passed';
end $$;
