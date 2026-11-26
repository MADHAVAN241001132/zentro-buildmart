-- Permission-filtered dashboard, coupon boundaries and direct-table policies, as the authenticated role (rolled back).
-- D1-D3 dashboard, C1-C2 coupon use and administration, R1-R4 direct row access.
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
  store_a uuid; bill uuid; coupon_code text := 'T' || upper(tag);
  oa uuid := gen_random_uuid(); mgr uuid := gen_random_uuid();
  s_pos uuid := gen_random_uuid(); s_set uuid := gen_random_uuid(); s_ord uuid := gen_random_uuid(); s_none uuid := gen_random_uuid();
  n integer; msg text; j jsonb;
begin
  insert into auth.users (id, email) values
    (oa, 'pd-oa-' || tag || '@example.test'), (mgr, 'pd-mg-' || tag || '@example.test'),
    (s_pos, 'pd-sp-' || tag || '@example.test'), (s_set, 'pd-ss-' || tag || '@example.test'),
    (s_ord, 'pd-so-' || tag || '@example.test'), (s_none, 'pd-sn-' || tag || '@example.test');
  insert into profiles (id, full_name) values (oa, 'Owner'), (mgr, 'Manager'), (s_pos, 'Cashier'),
    (s_set, 'Settings'), (s_ord, 'Orders'), (s_none, 'Nothing') on conflict (id) do nothing;
  insert into stores (slug, name, status) values ('pd-a-' || tag, 'Policy A', 'active') returning id into store_a;
  insert into subscription_migration_allowances (store_id, expires_on, reason)
    values (store_a, today + 5, 'policy test');
  insert into store_owners (store_id, profile_id, role) values
    (store_a, oa, 'owner'), (store_a, mgr, 'manager'), (store_a, s_pos, 'staff'),
    (store_a, s_set, 'staff'), (store_a, s_ord, 'staff'), (store_a, s_none, 'staff');
  -- Fixtures are inserted as the superuser session, so row policies do not apply here.
  insert into cash_reconciliations (store_id, business_date, opening_paise, cash_sales_paise, cash_refunds_paise,
    cash_expenses_paise, cash_deposits_paise, expected_closing_paise, actual_closing_paise, difference_paise,
    cash_manual_in_paise, cash_withdrawals_paise, cash_manual_out_paise)
    values (store_a, today, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  insert into coupons (store_id, code, discount_type, discount_paise, min_order_paise, is_active)
    values (store_a, coupon_code, 'flat', 100, 0, true);
  insert into pos_bills (store_id, bill_reference, status) values (store_a, 'B' || upper(tag), 'HELD')
    returning id into bill;

  perform pg_temp.as_user(oa);
  perform zb_set_store_member_access(store_a, mgr, 'manager', array['cash_confirmation']);
  perform zb_set_store_member_access(store_a, s_pos, 'staff', array['pos_billing']);
  perform zb_set_store_member_access(store_a, s_set, 'staff', array['store_settings']);
  perform zb_set_store_member_access(store_a, s_ord, 'staff', array['order_management']);
  perform zb_set_store_member_access(store_a, s_none, 'staff', array[]::text[]);

  -- D1: the owner sees every section.
  j := store_dashboard_metrics(store_a, now() - interval '1 day', now());
  if not (j ? 'gross_sales_paise' and j ? 'pending_cash_count' and j ? 'low_stock_count') or j->'hidden_sections' <> '[]'::jsonb then
    raise exception 'D1 failed: owner did not receive every dashboard section: %', j;
  end if;
  raise notice 'D1 ok: the owner receives every dashboard section';

  -- D2: a staff member with only order_management sees order counts but no financial aggregates or cash figures.
  perform pg_temp.as_user(s_ord);
  j := store_dashboard_metrics(store_a, now() - interval '1 day', now());
  if not (j ? 'orders_placed') or j ? 'gross_sales_paise' or j ? 'pending_cash_count' or j ? 'low_stock_count' then
    raise exception 'D2 failed: order-only staff received restricted sections: %', j;
  end if;
  if not (j->'hidden_sections' @> '["reports", "cash", "inventory"]'::jsonb) then
    raise exception 'D2 failed: hidden sections not reported: %', j;
  end if;
  raise notice 'D2 ok: order-only staff receive order counts and no restricted aggregates';

  -- D3: a member with no permissions receives only the date range and every section withheld.
  perform pg_temp.as_user(s_none);
  j := store_dashboard_metrics(store_a, now() - interval '1 day', now());
  if j ? 'orders_placed' or j ? 'gross_sales_paise' or j ? 'pending_cash_paise' then
    raise exception 'D3 failed: member without permissions received sections: %', j;
  end if;
  raise notice 'D3 ok: a member with no permissions receives no restricted sections';

  -- C1: applying an existing coupon to a bill needs pos_billing. Store settings alone is refused.
  perform pg_temp.as_user(s_set);
  msg := null;
  begin
    perform pos_set_coupon(bill, coupon_code);
  exception when others then msg := sqlstate;
  end;
  if msg is distinct from '42501' then raise exception 'C1 failed: store-settings-only member applied a coupon (state %)', msg; end if;
  raise notice 'C1 ok: store settings alone cannot apply a coupon';

  -- C2: a cashier with pos_billing passes the gate; the call may fail later on validation, not on authority.
  perform pg_temp.as_user(s_pos);
  msg := null;
  begin
    perform pos_set_coupon(bill, coupon_code);
  exception when others then msg := sqlstate;
  end;
  if msg = '42501' then raise exception 'C2 failed: cashier with pos_billing refused by the coupon gate'; end if;
  raise notice 'C2 ok: a cashier with pos_billing passes the coupon gate (state %)', coalesce(msg, 'ok');

  -- R1: a cashier cannot create or change coupons directly; coupon administration needs store_settings.
  msg := null;
  begin
    insert into coupons (store_id, code, discount_type, discount_paise, min_order_paise, is_active)
      values (store_a, 'X' || upper(tag), 'flat', 50, 0, true);
    raise exception 'R1 failed: cashier inserted a coupon directly';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'R1 ok: a cashier cannot write coupons directly';

  -- R2: a member without cash confirmation reads no cash reconciliations.
  perform pg_temp.as_user(s_ord);
  select count(*) into n from cash_reconciliations where store_id = store_a;
  if n <> 0 then raise exception 'R2 failed: order-only staff read % cash reconciliation rows', n; end if;
  raise notice 'R2 ok: cash reconciliations are hidden from members without cash confirmation';

  -- R3: a manager with cash confirmation reads them.
  perform pg_temp.as_user(mgr);
  select count(*) into n from cash_reconciliations where store_id = store_a;
  if n <> 1 then raise exception 'R3 failed: manager with cash confirmation read % rows, expected 1', n; end if;
  raise notice 'R3 ok: a manager with cash confirmation reads cash reconciliations';

  -- R4: a manager without store settings cannot insert coupons.
  msg := null;
  begin
    insert into coupons (store_id, code, discount_type, discount_paise, min_order_paise, is_active)
      values (store_a, 'Y' || upper(tag), 'flat', 50, 0, true);
    raise exception 'R4 failed: manager without store settings inserted a coupon';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'R4 ok: coupon writes need store settings, not manager role alone';
end $$;
rollback;
