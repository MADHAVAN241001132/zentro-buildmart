-- ZENTRO BuildMart: late-payment refunds (Priority 1, checkout slice 3).
-- A verified payment that cannot be fulfilled is refunded through the existing refund table, gateway claim and
-- webhook path (create_refund's gateway send, settle_refund). Late-payment refunds have their own refund type so that:
--   * finalisation leaves the payment, order, stock and coupon states alone (the sale was never completed);
--   * the dashboard does not subtract them from revenue that was never counted.
-- Migrations 0001-0050 are not modified. The three functions below are replaced definitions copied from their
-- current versions, with only the late-payment branch added.

-- 1. Refund type for late-payment refunds.
alter table refunds drop constraint if exists refunds_refund_type_check;
alter table refunds add constraint refunds_refund_type_check
  check (refund_type in ('full','partial','late_payment'));

-- 2. Link each late payment to the refund that returns it.
alter table late_payments add column if not exists refund_id uuid unique references refunds(id);

-- 3. Replaced definitions (see header).
create or replace function app.finalize_refund(p_refund uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r refunds%rowtype;
  o orders%rowtype;
  it record;
  v_all boolean;
  v_redemption coupon_redemptions%rowtype;
  v_customer uuid;
  v_pay_amount bigint;
  v_pay_refunded bigint;
begin
  select * into r from refunds where id = p_refund for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status = 'succeeded' then return; end if;
  if r.status not in ('requested','processing') then
    raise exception 'refund is % and cannot be completed', r.status using errcode = 'P0001';
  end if;
  if r.refund_type = 'late_payment' then
    -- Money returned for a payment that was never fulfilled. The payment and order keep their states, no stock
    -- or coupon moves, and reports do not treat it as a reversed sale (see zb_admin_dashboard in migration 0051).
    update refunds set status = 'succeeded', processed_at = now(), finalized_at = now() where id = r.id;
    perform app.audit(r.store_id, 'refund.late_payment_succeeded', 'refunds', r.id, null,
      jsonb_build_object('amount_paise', r.amount_paise, 'payment_id', r.payment_id));
    return;
  end if;
  select * into o from orders where id = r.order_id for update;

  for it in select ri.variant_id, ri.quantity, ri.condition from refund_items ri where ri.refund_id = r.id loop
    if it.condition = 'restock' then
      update inventory set on_hand = on_hand + it.quantity, updated_at = now()
       where variant_id = it.variant_id and store_id = r.store_id;
      if not found then raise exception 'no inventory row for a returned variant' using errcode = 'P0002'; end if;
      insert into stock_movements (store_id, variant_id, movement_type, quantity, reference_type, reference_id, note)
      values (r.store_id, it.variant_id, 'return', it.quantity, 'refund', r.id, 'returned to stock');
    else
      update inventory set damaged = damaged + it.quantity, updated_at = now()
       where variant_id = it.variant_id and store_id = r.store_id;
      if not found then raise exception 'no inventory row for a returned variant' using errcode = 'P0002'; end if;
      insert into stock_movements (store_id, variant_id, movement_type, quantity, reference_type, reference_id, note)
      values (r.store_id, it.variant_id, 'damage', it.quantity, 'refund', r.id, 'returned damaged; not sellable');
    end if;
  end loop;

  -- The order is fully returned when every line has its full quantity refunded (this refund included).
  select not exists (
    select 1 from order_items oi
     where oi.order_id = o.id
       and oi.quantity > coalesce((
         select sum(ri.quantity) from refund_items ri join refunds rr on rr.id = ri.refund_id
          where ri.order_item_id = oi.id and (rr.status = 'succeeded' or rr.id = r.id)), 0)
  ) into v_all;

  if v_all then
    select * into v_redemption from coupon_redemptions where order_id = o.id for update;
    if found then
      delete from coupon_redemptions where id = v_redemption.id;
      update coupons set used_count = greatest(used_count - 1, 0) where id = v_redemption.coupon_id;
    end if;
  end if;

  if r.refund_method = 'credit' then
    select customer_id into v_customer from pos_bills where order_id = o.id;
    if v_customer is null then raise exception 'credit refund needs the customer on the sale' using errcode = 'P0001'; end if;
    perform record_credit_entry(v_customer, 'adjustment', -r.amount_paise, null,
      'Refund for order ' || o.order_number);
  end if;

  update refunds set status = 'succeeded', processed_at = now(), finalized_at = now() where id = r.id;

  if r.payment_id is not null then
    select amount_paise into v_pay_amount from payments where id = r.payment_id;
    select coalesce(sum(amount_paise), 0) into v_pay_refunded from refunds
     where payment_id = r.payment_id and status = 'succeeded';
    update payments set status = case when v_pay_refunded >= v_pay_amount then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
                        updated_at = now()
     where id = r.payment_id;
    update orders set payment_status = (select status from payments where id = r.payment_id), updated_at = now()
     where id = o.id;
  end if;

  perform app.audit(r.store_id, 'refund.succeeded', 'refunds', r.id, null,
    jsonb_build_object('order_id', o.id, 'amount_paise', r.amount_paise, 'method', r.refund_method, 'full', v_all));
end $$;

create or replace function public.settle_online_payment(
  p_provider text, p_provider_order_id text, p_provider_payment_id text,
  p_amount_paise bigint, p_success boolean, p_failure_reason text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_order orders%rowtype;
  v_init payment_initialisations%rowtype;
begin
  if not app.is_server() then
    raise exception 'settlement is server-only' using errcode = '42501';
  end if;

  select * into v_payment from payments
  where provider = p_provider and provider_order_id = p_provider_order_id
  for update;
  if not found then
    -- No payment row: the provider order may be one we created but could not attach. A verified payment
    -- for it is recorded for review rather than dropped.
    select * into v_init from payment_initialisations
    where provider = p_provider and provider_order_id = p_provider_order_id;
    if not found then
      if p_success then
        insert into late_payments (store_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
        values (null, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise, 'unmatched_provider_order')
        on conflict (provider, provider_payment_id) do nothing;
        return 'unmatched_payment_recorded';
      end if;
      return 'unknown_payment';
    end if;
    if not p_success then return 'failed_unattached'; end if;
    insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
    values (v_init.store_id, v_init.order_id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise,
            'provider_order_not_attached')
    on conflict (provider, provider_payment_id) do nothing;
    return 'late_payment_requires_review';
  end if;

  if v_payment.status = 'PAID' then return 'already_paid'; end if;
  if v_payment.status not in ('PENDING','PROCESSING') then
    if p_success and v_payment.status in ('FAILED','EXPIRED') then
      update payments set provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id), updated_at = now()
       where id = v_payment.id;
      insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
      values (v_payment.store_id, v_payment.order_id, p_provider, p_provider_order_id, p_provider_payment_id,
              p_amount_paise, 'after_reservation_expiry')
      on conflict (provider, provider_payment_id) do nothing;
      return 'late_payment_requires_review';
    end if;
    return 'ignored_terminal_state';
  end if;

  select * into v_order from orders where id = v_payment.order_id for update;

  if not p_success then
    update payments set status = 'FAILED', failure_reason = p_failure_reason, updated_at = now()
    where id = v_payment.id;
    update orders set payment_status = 'FAILED', updated_at = now() where id = v_order.id;
    return 'failed';
  end if;

  if p_amount_paise <> v_payment.amount_paise then
    insert into payment_events (store_id, provider, provider_event_id, event_type, payload, signature_valid)
    values (v_order.store_id, p_provider, 'mismatch:' || coalesce(p_provider_payment_id, gen_random_uuid()::text),
            'amount_mismatch', jsonb_build_object('expected', v_payment.amount_paise, 'received', p_amount_paise), true)
    on conflict do nothing;
    insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
    values (v_order.store_id, v_order.id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise,
            'amount_mismatch')
    on conflict (provider, provider_payment_id) do nothing;
    return 'amount_mismatch';
  end if;

  if v_order.order_status = 'CANCELLED' or v_order.reservation_expires_at < now() then
    update payments set status = 'FAILED', provider_payment_id = p_provider_payment_id,
           failure_reason = 'paid after reservation expired', updated_at = now()
    where id = v_payment.id;
    insert into late_payments (store_id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, reason)
    values (v_order.store_id, v_order.id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise,
            case when v_order.order_status = 'CANCELLED' then 'after_cancellation' else 'after_reservation_expiry' end)
    on conflict (provider, provider_payment_id) do nothing;
    return 'late_payment_requires_review';
  end if;

  update payments set status = 'PAID', provider_payment_id = p_provider_payment_id,
         paid_at = now(), updated_at = now()
  where id = v_payment.id;

  update orders set payment_status = 'PAID', paid_at = now(), updated_at = now() where id = v_order.id;
  perform consume_order_stock(v_order.id);
  if v_order.order_status = 'PLACED' then
    perform app.set_order_status(v_order.id, 'CONFIRMED', 'payment received');
  end if;
  return 'paid';
end $$;

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
   where r.status = 'succeeded' and r.refund_type is distinct from 'late_payment' and r.processed_at >= v_start and r.processed_at < v_end
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
     where status = 'succeeded' and refund_type is distinct from 'late_payment' and processed_at >= v_start and processed_at < v_end
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
           from refunds where status = 'succeeded' and refund_type is distinct from 'late_payment' and processed_at >= v_start and processed_at < v_end
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

-- 4. Refund request for a late payment decided as 'refund'. Idempotent per late payment: a second call returns the
--    refund already created. Refuses when the payment cannot be attributed to this store or is not a late state.
create or replace function public.late_payment_refund_request(
  p_late uuid, p_actor uuid, p_request_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l late_payments%rowtype;
  p payments%rowtype;
  v_refund uuid;
  v_existing_refund refunds%rowtype;
begin
  if not app.is_server() then raise exception 'refunds are processed by the server' using errcode = '42501'; end if;
  if p_request_key is null or length(p_request_key) not between 8 and 80 then
    raise exception 'missing request key' using errcode = 'P0001';
  end if;

  select * into l from late_payments where id = p_late for update;
  if not found then raise exception 'late payment not found' using errcode = 'P0002'; end if;

  if l.refund_id is not null then
    select * into v_existing_refund from refunds where id = l.refund_id;
    return jsonb_build_object('replayed', true, 'refund_id', l.refund_id, 'status', v_existing_refund.status,
                              'amount_paise', v_existing_refund.amount_paise);
  end if;

  if l.status <> 'refund_requested' then
    raise exception 'record a refund decision first (status %)', l.status using errcode = 'P0001';
  end if;
  if l.store_id is null then
    raise exception 'this payment is not attributed to a store; investigate before refunding' using errcode = 'P0001';
  end if;
  if not exists (select 1 from store_owners where store_id = l.store_id and profile_id = p_actor
                 and role = 'owner' and is_active) then
    raise exception 'forbidden: an owner of this store is required' using errcode = '42501';
  end if;

  -- The payment this late money belongs to must be the one we recorded for this provider payment id.
  select * into p from payments
   where provider = 'razorpay' and provider_payment_id = l.provider_payment_id and store_id = l.store_id
   for update;
  if not found then
    raise exception 'no payment record matches this provider payment; reconcile before refunding' using errcode = 'P0001';
  end if;
  if p.status not in ('FAILED','EXPIRED') then
    raise exception 'the payment is not in a late state (status %)', p.status using errcode = 'P0001';
  end if;
  if p.amount_paise <> l.amount_paise then
    raise exception 'the verified amount does not match the payment; retain for investigation' using errcode = 'P0001';
  end if;
  if exists (select 1 from refunds where payment_id = p.id and status in ('requested','processing','succeeded')) then
    raise exception 'a refund already exists for this payment' using errcode = 'P0001';
  end if;

  insert into refunds (store_id, payment_id, order_id, amount_paise, status, reason, refund_method, refund_type,
                       request_key, requested_by)
  values (l.store_id, p.id, p.order_id, l.amount_paise, 'requested', 'Late payment not fulfilled',
          'online', 'late_payment', p_request_key, p_actor)
  returning id into v_refund;

  update late_payments set refund_id = v_refund where id = l.id;
  perform app.audit(l.store_id, 'late_payment.refund_requested', 'late_payments', l.id, null,
    jsonb_build_object('refund_id', v_refund, 'amount_paise', l.amount_paise));
  return jsonb_build_object('replayed', false, 'refund_id', v_refund, 'status', 'requested',
                            'amount_paise', l.amount_paise);
end $$;

-- 5. Grants: server only. The replaced functions keep their existing grants.
revoke execute on function public.late_payment_refund_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.late_payment_refund_request(uuid, uuid, text) to service_role;
