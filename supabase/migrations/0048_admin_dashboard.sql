-- 0048: Platform dashboard aggregates. One platform-administrator-only function returns every section, so the
-- application loads summaries, not tables. Money is integer paise. Dates are Indian Standard Time.
--
-- Definitions (these are the dashboard's rules and are tested in supabase/tests/admin_dashboard_tests.sql):
-- * Merchant sales: orders created in the range. Gross order value excludes cancelled orders. It is a sales value,
--   not cash.
-- * Collected: payments whose paid_at falls in the range and whose status shows they were paid (PAID, or later
--   PARTIALLY_REFUNDED / REFUNDED). Collected is recorded when paid, so a later refund does not remove it here.
-- * Refunds: refunds with status 'succeeded' processed in the range. Refund-adjusted revenue = collected - refunds.
--   Unpaid orders, cash still pending and store credit are not counted as collected.
-- * Subscription revenue is separate: recorded subscription payments (subscription_payments, status 'paid') are
--   actual receipts. Expected plan value is the list price of current subscriptions. It is never called collected.
-- * Quota utilisation: products with status 'active' and active store memberships, against the plan limit.

create or replace function public.zb_admin_dashboard(p_from date, p_to date, p_store uuid default null)
returns jsonb
-- Volatile: the function materialises one temp table per call.
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_today date := app.ist_today();
  v_start timestamptz;
  v_end timestamptz;
  v_stores jsonb;
  v_onboarding jsonb;
  v_owners jsonb;
  v_recent_stores jsonb;
  v_subs jsonb;
  v_plans jsonb;
  v_near_limit jsonb;
  v_renewals jsonb;
  v_merchant jsonb;
  v_collected jsonb;
  v_refunds jsonb;
  v_by_store jsonb;
  v_trend jsonb;
  v_activity jsonb;
  v_provisioning jsonb;
  v_support jsonb;
  v_onboarding_activity jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform administrators only' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'choose a date range of up to 366 days' using errcode = '22023';
  end if;
  if p_store is not null and not exists (select 1 from stores where id = p_store) then
    raise exception 'store not found' using errcode = 'P0002';
  end if;
  v_start := (p_from::timestamp) at time zone 'Asia/Kolkata';
  v_end := ((p_to + 1)::timestamp) at time zone 'Asia/Kolkata';

  -- A. Stores (platform-wide; the store filter does not apply here).
  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where status = 'active'),
    'inactive', count(*) filter (where status in ('suspended', 'archived')),
    'draft', count(*) filter (where status = 'draft'),
    'created_in_range', count(*) filter (where created_at >= v_start and created_at < v_end))
    into v_stores from stores;
  select jsonb_build_object(
    'incomplete', count(*) filter (where status = 'in_progress'),
    'completed', count(*) filter (where status = 'completed'))
    into v_onboarding from store_onboardings;
  select jsonb_build_object(
    'owner_accounts', count(*) filter (where role = 'owner'),
    'active_owner_accounts', count(*) filter (where role = 'owner' and is_active),
    'active_memberships', count(*) filter (where is_active))
    into v_owners from store_owners;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status, 'created_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
    into v_recent_stores
    from (select id, name, status, created_at from stores order by created_at desc limit 5) s;

  -- B. Subscriptions. Current subscriptions are active, trialing or grace with a period end on or after today.
  -- Current subscriptions are materialised once for this call; later sections read the same rows.
  drop table if exists pg_temp.dash_current_subs;
  create temp table dash_current_subs on commit drop as
    select s.id, s.store_id, s.status, s.period_end, p.name as plan_name, p.price_paise, p.max_products, p.max_users,
           (select count(*) from products pr where pr.store_id = s.store_id and pr.status = 'active') as products_used,
           (select count(*) from store_owners so where so.store_id = s.store_id and so.is_active) as users_used
      from subscriptions s
      join subscription_plans p on p.id = s.plan_id
     where s.status in ('active', 'trialing', 'grace') and s.period_end >= v_today
       and (p_store is null or s.store_id = p_store);
  select jsonb_build_object(
      'active', (select count(*) from dash_current_subs),
      'expired', (select count(*) from subscriptions s where (p_store is null or s.store_id = p_store)
                    and (s.status = 'expired' or (s.status in ('active', 'trialing', 'grace') and s.period_end < v_today))),
      'expiring_within_14_days', (select count(*) from dash_current_subs where period_end <= v_today + 14),
      'migration_allowances_active', (select count(*) from subscription_migration_allowances a
                                        where a.expires_on >= v_today and (p_store is null or a.store_id = p_store)),
      'expected_plan_value_paise', coalesce((select sum(price_paise) from dash_current_subs), 0),
      'recorded_payments_paise', coalesce((select sum(sp.amount_paise) from subscription_payments sp
                                            where sp.status = 'paid' and sp.paid_on between p_from and p_to
                                              and (p_store is null or sp.store_id = p_store)), 0))
    into v_subs;
  select coalesce(jsonb_agg(jsonb_build_object('plan', plan_name, 'count', n) order by n desc, plan_name), '[]'::jsonb)
    into v_plans
    from (select plan_name, count(*) as n from dash_current_subs group by plan_name) x;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.percent desc, t.store_name), '[]'::jsonb) into v_near_limit
    from (
      select cs.store_id, st.name as store_name, cs.plan_name,
             cs.products_used, cs.max_products, cs.users_used, cs.max_users,
             greatest(
               case when cs.max_products is null or cs.max_products = 0 then 0 else (cs.products_used * 100 / cs.max_products) end,
               case when cs.max_users is null or cs.max_users = 0 then 0 else (cs.users_used * 100 / cs.max_users) end) as percent
        from dash_current_subs cs join stores st on st.id = cs.store_id
    ) t
   where t.percent >= 80
   limit 10;
  select coalesce(jsonb_agg(jsonb_build_object('store', st.name, 'paid_on', sp.paid_on, 'amount_paise', sp.amount_paise) order by sp.paid_on desc), '[]'::jsonb)
    into v_renewals
    from (select * from subscription_payments
           where status = 'paid' and paid_on between p_from and p_to and (p_store is null or store_id = p_store)
           order by paid_on desc limit 10) sp
    join stores st on st.id = sp.store_id;

  -- C. Merchant performance.
  select jsonb_build_object(
      'total', count(*),
      'paid', count(*) filter (where order_status <> 'CANCELLED' and payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
      'pending', count(*) filter (where order_status <> 'CANCELLED' and payment_status in ('PENDING', 'CASH_PENDING', 'PROCESSING')),
      'cancelled', count(*) filter (where order_status = 'CANCELLED'),
      'refunded', count(*) filter (where payment_status = 'REFUNDED'),
      'partially_refunded', count(*) filter (where payment_status = 'PARTIALLY_REFUNDED'),
      'gross_order_value_paise', coalesce(sum(total_paise) filter (where order_status <> 'CANCELLED'), 0))
    into v_merchant
    from orders o
   where o.created_at >= v_start and o.created_at < v_end and (p_store is null or o.store_id = p_store);

  select jsonb_build_object(
      'collected_paise', coalesce(sum(amount_paise), 0),
      'payments', count(*))
    into v_collected
    from payments p
   where p.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') and p.paid_at >= v_start and p.paid_at < v_end
     and (p_store is null or p.store_id = p_store);

  select jsonb_build_object(
      'refunds_paise', coalesce(sum(amount_paise), 0),
      'refunds', count(*))
    into v_refunds
    from refunds r
   where r.status = 'succeeded' and r.processed_at >= v_start and r.processed_at < v_end
     and (p_store is null or r.store_id = p_store);

  with o as (
    select store_id, count(*) as orders, count(*) filter (where order_status <> 'CANCELLED' and payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')) as paid,
           coalesce(sum(total_paise) filter (where order_status <> 'CANCELLED'), 0) as gross
      from orders where created_at >= v_start and created_at < v_end and (p_store is null or store_id = p_store) group by store_id),
  c as (
    select store_id, coalesce(sum(amount_paise), 0) as collected from payments
     where status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') and paid_at >= v_start and paid_at < v_end
       and (p_store is null or store_id = p_store) group by store_id),
  rf as (
    select store_id, coalesce(sum(amount_paise), 0) as refunds from refunds
     where status = 'succeeded' and processed_at >= v_start and processed_at < v_end
       and (p_store is null or store_id = p_store) group by store_id),
  store_rows as (
    select st.id as store_id, st.name as store_name, coalesce(o.orders, 0) as orders, coalesce(o.paid, 0) as paid_orders,
           coalesce(o.gross, 0) as gross_paise, coalesce(c.collected, 0) as collected_paise, coalesce(rf.refunds, 0) as refunds_paise
      from stores st
      left join o on o.store_id = st.id
      left join c on c.store_id = st.id
      left join rf on rf.store_id = st.id
     where (p_store is null or st.id = p_store)
       and (o.store_id is not null or c.store_id is not null or rf.store_id is not null)
     order by coalesce(c.collected, 0) desc, st.name
     limit 25)
  select coalesce(jsonb_agg(jsonb_build_object(
           'store_id', store_id, 'store_name', store_name, 'orders', orders, 'paid_orders', paid_orders,
           'gross_paise', gross_paise, 'collected_paise', collected_paise, 'refunds_paise', refunds_paise,
           'net_paise', collected_paise - refunds_paise)), '[]'::jsonb)
    into v_by_store
    from store_rows;

  -- Daily trend for the range. Every day appears, so an empty day is a zero and not a gap.
  with days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  od as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as orders,
                coalesce(sum(total_paise) filter (where order_status <> 'CANCELLED'), 0) as gross
           from orders where created_at >= v_start and created_at < v_end and (p_store is null or store_id = p_store) group by 1),
  pd as (select (paid_at at time zone 'Asia/Kolkata')::date as day, coalesce(sum(amount_paise), 0) as collected
           from payments where status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') and paid_at >= v_start and paid_at < v_end
            and (p_store is null or store_id = p_store) group by 1),
  rd as (select (processed_at at time zone 'Asia/Kolkata')::date as day, coalesce(sum(amount_paise), 0) as refunds
           from refunds where status = 'succeeded' and processed_at >= v_start and processed_at < v_end
            and (p_store is null or store_id = p_store) group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'orders', coalesce(od.orders, 0), 'gross_paise', coalesce(od.gross, 0),
                                               'collected_paise', coalesce(pd.collected, 0), 'refunds_paise', coalesce(rd.refunds, 0))
                            order by d.day), '[]'::jsonb)
    into v_trend
    from days d
    left join od on od.day = d.day
    left join pd on pd.day = d.day
    left join rd on rd.day = d.day;

  -- E. Administrative activity.
  select jsonb_build_object(
      'actions_in_range', count(*) filter (where created_at >= v_start and created_at < v_end),
      'permission_changes_in_range', count(*) filter (where created_at >= v_start and created_at < v_end
          and action in ('staff.access_changed', 'staff.activated', 'staff.deactivated', 'staff.manage')),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'entity_type', a.entity_type, 'actor_type', a.actor_type, 'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
                   from (select action, entity_type, actor_type, created_at from audit_logs order by created_at desc limit 8) a))
    into v_activity
    from audit_logs;
  select jsonb_build_object(
      'updated_in_range', (select count(*) from store_onboardings where updated_at >= v_start and updated_at < v_end),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('store', x.name, 'status', x.status, 'updated_at', x.updated_at) order by x.updated_at desc), '[]'::jsonb)
                   from (select st.name, o.status, o.updated_at from store_onboardings o join stores st on st.id = o.store_id order by o.updated_at desc limit 5) x))
    into v_onboarding_activity;
  select jsonb_build_object(
      'requests', count(*),
      'requests_in_range', count(*) filter (where created_at >= v_start and created_at < v_end),
      'unresolved', count(*) filter (where status in ('RECONCILIATION_REQUIRED', 'FAILED')),
      'reconciliation_required', count(*) filter (where status = 'RECONCILIATION_REQUIRED'),
      'failed', count(*) filter (where status = 'FAILED'),
      'completed_in_range', count(*) filter (where status = 'COMPLETED' and completed_at >= v_start and completed_at < v_end))
    into v_provisioning
    from account_provisioning_requests
   where (p_store is null or store_id = p_store);
  select jsonb_build_object(
      'in_range', count(*) filter (where created_at >= v_start and created_at < v_end),
      'pending', count(*) filter (where status in ('open', 'in_progress', 'waiting')),
      'recent_pending', (select coalesce(jsonb_agg(jsonb_build_object('subject', t.subject, 'status', t.status, 'priority', t.priority, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
                           from (select subject, status, priority, created_at from support_tickets
                                  where status in ('open', 'in_progress', 'waiting') and (p_store is null or store_id = p_store)
                                  order by created_at desc limit 5) t))
    into v_support
    from support_tickets
   where (p_store is null or store_id = p_store);

  return jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'store_id', p_store),
    'stores', v_stores || jsonb_build_object('onboarding', v_onboarding, 'recent', v_recent_stores),
    'owners', v_owners,
    'subscriptions', v_subs || jsonb_build_object('plan_distribution', v_plans, 'near_limit', v_near_limit, 'renewals', v_renewals),
    'merchant', v_merchant || jsonb_build_object(
        'collected_paise', (v_collected->>'collected_paise')::bigint,
        'payments', (v_collected->>'payments')::bigint,
        'refunds_paise', (v_refunds->>'refunds_paise')::bigint,
        'refunds', (v_refunds->>'refunds')::bigint,
        'refund_adjusted_revenue_paise', (v_collected->>'collected_paise')::bigint - (v_refunds->>'refunds_paise')::bigint,
        'by_store', v_by_store,
        'trend', v_trend),
    'activity', v_activity || jsonb_build_object('onboarding', v_onboarding_activity, 'provisioning', v_provisioning, 'support', v_support)
  );
end $$;

revoke all on function public.zb_admin_dashboard(date, date, uuid) from public, anon;
grant execute on function public.zb_admin_dashboard(date, date, uuid) to authenticated, service_role;
