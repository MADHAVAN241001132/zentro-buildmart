-- Platform dashboard aggregates (rolled back). D1-D6.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(p_user uuid) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user::text)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;
do $$
declare
  tag text := substr(gen_random_uuid()::text, 1, 6);
  today date := app.ist_today();
  admin_id uuid := gen_random_uuid(); owner_d uuid := gen_random_uuid(); mgr_d uuid := gen_random_uuid();
  store_d uuid; store_draft uuid; plan_d uuid; sub_d uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; p1 uuid; p4 uuid;
  d jsonb; v_rows integer; v_err text; v_state text;
begin
  insert into auth.users (id, email) values
    (admin_id, 'dash-admin-' || tag || '@example.test'), (owner_d, 'dash-o-' || tag || '@example.test'),
    (mgr_d, 'dash-m-' || tag || '@example.test');
  insert into profiles (id, full_name) values (admin_id, 'Admin'), (owner_d, 'Owner'), (mgr_d, 'Manager') on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (admin_id) on conflict do nothing;

  insert into stores (slug, name, status) values ('dash-d-' || tag, 'Dashboard D', 'active') returning id into store_d;
  insert into stores (slug, name, status) values ('dash-x-' || tag, 'Draft shop', 'draft') returning id into store_draft;
  insert into store_onboardings (store_id, status, step_data) values (store_draft, 'in_progress', '{}');

  insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
    values ('DASH_' || tag, 'Dash plan', 'monthly', 99900, 5, 2, '{}') returning id into plan_d;
  insert into subscriptions (store_id, plan_id, status, period_start, period_end)
    values (store_d, plan_d, 'active', today - 1, today + 30) returning id into sub_d;
  insert into store_owners (store_id, profile_id, role, is_active) values (store_d, owner_d, 'owner', true), (store_d, mgr_d, 'manager', true);
  insert into subscription_payments (subscription_id, store_id, amount_paise, status, paid_on)
    values (sub_d, store_d, 99900, 'paid', today);

  -- Orders: one paid, one pending, one cancelled, one paid then refunded.
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_d, 'D-' || tag || '-1', 'online', 'A', 'pickup', 'online', 'PAID', 'COMPLETED', 1000, 0, 1000, 0, 0, 1000) returning id into o1;
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_d, 'D-' || tag || '-2', 'online', 'B', 'pickup', 'online', 'PENDING', 'PLACED', 500, 0, 500, 0, 0, 500) returning id into o2;
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_d, 'D-' || tag || '-3', 'online', 'C', 'pickup', 'online', 'PENDING', 'CANCELLED', 300, 0, 300, 0, 0, 300) returning id into o3;
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (store_d, 'D-' || tag || '-4', 'online', 'D', 'pickup', 'cash', 'REFUNDED', 'COMPLETED', 800, 0, 800, 0, 0, 800) returning id into o4;

  insert into payments (store_id, order_id, method, provider, provider_order_id, status, amount_paise, paid_at)
    values (store_d, o1, 'online', 'razorpay', 'po1-' || tag, 'PAID', 1000, now()) returning id into p1;
  insert into payments (store_id, order_id, method, provider, provider_order_id, status, amount_paise, paid_at)
    values (store_d, o4, 'cash', 'cash', 'po4-' || tag, 'REFUNDED', 800, now()) returning id into p4;
  insert into refunds (store_id, payment_id, order_id, amount_paise, status, reason, processed_at)
    values (store_d, p4, o4, 800, 'succeeded', 'test refund', now());
  insert into refunds (store_id, payment_id, order_id, amount_paise, status, reason)
    values (store_d, p1, o1, 200, 'requested', 'not yet processed');

  -- D1: a platform administrator reads the figures for the store; merchant figures follow the rules.
  perform pg_temp.as_user(admin_id);
  d := public.zb_admin_dashboard(today - 1, today + 1, store_d);
  if (d->'merchant'->>'total')::int <> 4 or (d->'merchant'->>'paid')::int <> 2 or (d->'merchant'->>'pending')::int <> 1
     or (d->'merchant'->>'cancelled')::int <> 1 or (d->'merchant'->>'refunded')::int <> 1 then
    raise exception 'D1 failed: order counts %', d->'merchant';
  end if;
  if (d->'merchant'->>'gross_order_value_paise')::bigint <> 2300 then
    raise exception 'D1 failed: gross excludes cancelled orders incorrectly: %', d->'merchant'->>'gross_order_value_paise';
  end if;
  raise notice 'D1 ok: order counts and gross value follow the dashboard rules';

  -- D2: collected and refund-adjusted revenue; the requested refund is not counted, and the refund is not double-counted.
  if (d->'merchant'->>'collected_paise')::bigint <> 1800 or (d->'merchant'->>'refunds_paise')::bigint <> 800
     or (d->'merchant'->>'refund_adjusted_revenue_paise')::bigint <> 1000 then
    raise exception 'D2 failed: revenue %', d->'merchant';
  end if;
  raise notice 'D2 ok: collected 1800, refunds 800, refund-adjusted 1000 (requested refund excluded)';

  -- D3: subscriptions, quota utilisation and recorded renewals are separate from merchant sales.
  if (d->'subscriptions'->>'active')::int <> 1 or (d->'subscriptions'->>'expected_plan_value_paise')::bigint <> 99900
     or (d->'subscriptions'->>'recorded_payments_paise')::bigint <> 99900 then
    raise exception 'D3 failed: subscriptions %', d->'subscriptions';
  end if;
  if not exists (select 1 from jsonb_array_elements(d->'subscriptions'->'near_limit') e where (e->>'percent')::int = 100) then
    raise exception 'D3 failed: a full user quota was not flagged';
  end if;
  raise notice 'D3 ok: plan value is expected, not collected; full user quota flagged';

  -- D4: by-store rows and the daily trend. Every day in the range appears.
  if jsonb_array_length(d->'merchant'->'by_store') <> 1 or (d->'merchant'->'by_store'->0->>'net_paise')::bigint <> 1000 then
    raise exception 'D4 failed: store row %', d->'merchant'->'by_store';
  end if;
  if jsonb_array_length(d->'merchant'->'trend') <> 3 then raise exception 'D4 failed: trend days %', d->'merchant'->'trend'; end if;
  raise notice 'D4 ok: store performance and a complete daily trend';

  -- D5: an empty range returns zeros, not errors or gaps.
  d := public.zb_admin_dashboard(date '2000-01-01', date '2000-01-02', store_d);
  if (d->'merchant'->>'total')::int <> 0 or (d->'merchant'->>'collected_paise')::bigint <> 0
     or jsonb_array_length(d->'merchant'->'by_store') <> 0 or jsonb_array_length(d->'merchant'->'trend') <> 2 then
    raise exception 'D5 failed: empty range %', d;
  end if;
  raise notice 'D5 ok: an empty range returns zeros and a complete trend';

  -- D6: refusals. A signed-in owner is not a platform administrator; bad ranges and unknown stores are refused.
  perform pg_temp.as_user(owner_d);
  v_err := null;
  begin perform public.zb_admin_dashboard(today - 1, today + 1, null);
  exception when sqlstate '42501' then v_err := 'refused'; end;
  if v_err is null then raise exception 'D6 failed: a store owner read platform figures'; end if;
  perform pg_temp.as_user(admin_id);
  v_err := null;
  begin perform public.zb_admin_dashboard(today + 1, today - 1, null);
  exception when sqlstate '22023' then v_err := 'range'; end;
  if v_err is null then raise exception 'D6 failed: a reversed range was accepted'; end if;
  v_err := null;
  begin perform public.zb_admin_dashboard(date '2000-01-01', date '2002-01-01', null);
  exception when sqlstate '22023' then v_err := 'too long'; end;
  if v_err is null then raise exception 'D6 failed: a range over 366 days was accepted'; end if;
  v_err := null;
  begin perform public.zb_admin_dashboard(today, today, gen_random_uuid());
  exception when sqlstate 'P0002' then v_err := 'unknown store'; end;
  if v_err is null then raise exception 'D6 failed: an unknown store was accepted'; end if;
  raise notice 'D6 ok: non-administrators are refused; reversed, long and unknown-store requests are refused';
end $$;
rollback;
