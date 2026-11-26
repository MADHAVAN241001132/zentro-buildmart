-- 0041: concurrency-safe last-owner guard, POS coupon use under pos_billing, permission-filtered dashboard
-- metrics, and permission-based row policies for direct table access from the browser session.

-- 1. Last-owner guard. Owner changes for one store are serialised by locking the store row, then the
--    remaining-owner count runs after the lock. Under READ COMMITTED each statement in the function takes a
--    fresh snapshot, so a concurrent deactivation that committed first is seen.
create or replace function app.guard_store_owner_rows()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  remaining integer;
begin
  perform 1 from stores where id = old.store_id for update;

  if tg_op = 'UPDATE' then
    if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active) then
      select count(*) into remaining from store_owners
       where store_id = old.store_id and role = 'owner' and is_active and profile_id <> old.profile_id;
      if remaining = 0 then
        raise exception 'The store must keep at least one active owner' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- Deletion cascaded from a deleted store is allowed; deleting the last owner of a live store is not.
  if old.role = 'owner' and old.is_active and exists (select 1 from stores where id = old.store_id) then
    select count(*) into remaining from store_owners
     where store_id = old.store_id and role = 'owner' and is_active and profile_id <> old.profile_id;
    if remaining = 0 then
      raise exception 'The store must keep at least one active owner' using errcode = 'P0001';
    end if;
  end if;
  return old;
end $$;

-- 2. Permission helper for row policies: any of the listed keys, or a platform administrator.
create or replace function app.store_perm_any(p_store uuid, p_keys text[])
returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_platform_admin()
      or exists (select 1 from unnest(p_keys) k where app.has_store_permission(p_store, k));
$$;
revoke all on function app.store_perm_any(uuid, text[]) from public, anon;
grant execute on function app.store_perm_any(uuid, text[]) to authenticated, service_role;

-- 3. POS coupon use requires pos_billing. Coupon administration (coupons table) still requires store_settings.
create or replace function public.pos_set_coupon(p_bill uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_coupon coupons%rowtype;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_permission(v_bill.store_id, 'pos_billing');
  if v_bill.status <> 'HELD' then raise exception 'coupons can only be changed on a held bill' using errcode = 'P0001'; end if;

  if p_code is null or btrim(p_code) = '' then
    update pos_bills set coupon_id = null, updated_at = now() where id = p_bill;
    return app.price_pos_bill(p_bill);
  end if;

  select * into v_coupon from coupons where store_id = v_bill.store_id and code = upper(btrim(p_code));
  if not found then raise exception 'coupon code not recognised' using errcode = 'P0001'; end if;
  update pos_bills set coupon_id = v_coupon.id, updated_at = now() where id = p_bill;
  return app.price_pos_bill(p_bill);
end $$;

-- 4. Dashboard metrics. Sections are returned only when the caller holds the matching permission.
--    hidden_sections lists the sections withheld, so the page can show an access-denied state.
create or replace function store_dashboard_metrics(p_store uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb := jsonb_build_object('range', jsonb_build_object('from', p_from, 'to', p_to));
  v_hidden text[] := '{}';
  v_orders boolean;
  v_reports boolean;
  v_cash boolean;
  v_inventory boolean;
begin
  perform app.assert_store_access(p_store, array['owner','manager','staff']);
  v_orders := app.store_perm_any(p_store, array['order_management']);
  v_reports := app.store_perm_any(p_store, array['reports_exports']);
  v_cash := app.store_perm_any(p_store, array['cash_confirmation']);
  v_inventory := app.store_perm_any(p_store, array['inventory_management']);

  if v_orders then
    v_result := v_result || jsonb_build_object(
      'paid_orders', (select count(*) from orders
          where store_id = p_store and payment_status = 'PAID' and paid_at >= p_from and paid_at < p_to),
      'orders_placed', (select count(*) from orders where store_id = p_store and created_at >= p_from and created_at < p_to));
  else v_hidden := v_hidden || 'orders'::text; end if;

  if v_reports then
    v_result := v_result || jsonb_build_object(
      'gross_sales_paise', coalesce((select sum(total_paise) from orders
          where store_id = p_store and payment_status = 'PAID' and paid_at >= p_from and paid_at < p_to), 0),
      'gross_profit_paise', coalesce((
          select sum(oi.taxable_paise - round(oi.quantity * oi.cost_price_paise_snapshot))::bigint
          from order_items oi join orders o on o.id = oi.order_id
          where o.store_id = p_store and o.payment_status = 'PAID' and o.paid_at >= p_from and o.paid_at < p_to), 0),
      'expenses_paise', coalesce((select sum(amount_paise) from expenses
          where store_id = p_store and expense_on >= p_from::date and expense_on < p_to::date), 0),
      'payment_methods', coalesce((
          select jsonb_agg(jsonb_build_object('method', method, 'orders', n, 'amount_paise', amt) order by method)
          from (select payment_method as method, count(*) as n, sum(total_paise) as amt
                from orders where store_id = p_store and payment_status = 'PAID'
                  and paid_at >= p_from and paid_at < p_to
                group by payment_method) m), '[]'::jsonb),
      'category_revenue', coalesce((
          select jsonb_agg(jsonb_build_object('category', c.name, 'amount_paise', amt) order by amt desc)
          from (select pr.category_id, sum(oi.line_total_paise) as amt
                from order_items oi
                join orders o on o.id = oi.order_id
                join product_variants pv on pv.id = oi.variant_id
                join products pr on pr.id = pv.product_id
                where o.store_id = p_store and o.payment_status = 'PAID'
                  and o.paid_at >= p_from and o.paid_at < p_to
                group by pr.category_id) x
          join categories c on c.id = x.category_id), '[]'::jsonb),
      'daily_sales', coalesce((
          select jsonb_agg(jsonb_build_object('day', d.day, 'amount_paise', d.amt) order by d.day)
          from (select date_trunc('day', paid_at) as day, sum(total_paise) as amt
                from orders where store_id = p_store and payment_status = 'PAID'
                  and paid_at >= p_from and paid_at < p_to
                group by 1) d), '[]'::jsonb));
  else v_hidden := v_hidden || 'reports'::text; end if;

  if v_cash then
    v_result := v_result || jsonb_build_object(
      'pending_cash_count', (select count(*) from payments where store_id = p_store and status = 'CASH_PENDING'),
      'pending_cash_paise', coalesce((select sum(amount_paise) from payments
          where store_id = p_store and status = 'CASH_PENDING'), 0));
  else v_hidden := v_hidden || 'cash'::text; end if;

  if v_inventory then
    v_result := v_result || jsonb_build_object(
      'low_stock_count', (select count(*) from inventory
          where store_id = p_store and reorder_level > 0 and (on_hand - reserved) <= reorder_level));
  else v_hidden := v_hidden || 'inventory'::text; end if;

  return v_result || jsonb_build_object('hidden_sections', to_jsonb(v_hidden));
end $$;

-- 5. Direct table access. Writes and sensitive reads follow the permission that owns the data.
--    Catalogue reads stay store-member reads. The broad owner/manager write policies and the
--    member-wide read policies on the tables below are replaced.
do $$
declare
  r record;
  t text;
begin
  -- Writes: table -> permissions allowed to change rows (and read them back).
  for r in
    select * from (values
      ('categories', array['category_brand_management']),
      ('subcategories', array['category_brand_management']),
      ('brands', array['category_brand_management']),
      ('products', array['product_management']),
      ('product_variants', array['product_management']),
      ('product_images', array['product_management']),
      ('product_specifications', array['product_management']),
      ('variant_price_history', array['product_management']),
      ('customers', array['customer_management']),
      ('addresses', array['customer_management']),
      ('suppliers', array['supplier_management']),
      ('supplier_products', array['supplier_management']),
      ('purchase_orders', array['purchasing']),
      ('purchase_order_items', array['purchasing']),
      ('supplier_invoices', array['supplier_management']),
      ('supplier_payments', array['supplier_management']),
      ('coupons', array['store_settings']),
      ('discounts', array['store_settings']),
      ('expenses', array['cash_confirmation']),
      ('qr_codes', array['qr_management']),
      ('quotations', array['quotations']),
      ('quotation_items', array['quotations']),
      ('deliveries', array['order_management']),
      ('cash_reconciliations', array['cash_confirmation']),
      ('feature_flags', array['store_settings'])
    ) as v(tbl, keys)
  loop
    execute format('drop policy if exists %I on %I', r.tbl || '_manage', r.tbl);
    execute format('create policy %I on %I for all to authenticated
      using (app.store_perm_any(store_id, %L::text[]))
      with check (app.store_perm_any(store_id, %L::text[]))', r.tbl || '_manage', r.tbl, r.keys, r.keys);
  end loop;

  -- Reads of sensitive tables: the table, its permission-owners, and nobody else.
  for r in
    select * from (values
      ('customers', array['customer_management','pos_billing','credit_management']),
      ('addresses', array['customer_management','pos_billing']),
      ('suppliers', array['supplier_management','purchasing']),
      ('supplier_products', array['supplier_management','purchasing']),
      ('purchase_orders', array['purchasing','supplier_management']),
      ('purchase_order_items', array['purchasing','supplier_management']),
      ('supplier_invoices', array['supplier_management']),
      ('supplier_payments', array['supplier_management']),
      ('coupons', array['store_settings','pos_billing']),
      ('discounts', array['store_settings','pos_billing']),
      ('expenses', array['cash_confirmation','reports_exports']),
      ('qr_codes', array['qr_management','qr_analytics']),
      ('quotations', array['quotations']),
      ('quotation_items', array['quotations']),
      ('deliveries', array['order_management','pos_billing']),
      ('cash_reconciliations', array['cash_confirmation']),
      ('orders', array['order_management','pos_billing','refund_management','reports_exports']),
      ('order_items', array['order_management','pos_billing','refund_management','reports_exports']),
      ('order_status_history', array['order_management','pos_billing','refund_management']),
      ('invoices', array['order_management','pos_billing','reports_exports']),
      ('payments', array['cash_confirmation']),
      ('cash_confirmations', array['cash_confirmation']),
      ('cash_movements', array['cash_confirmation']),
      ('refunds', array['refund_management']),
      ('refund_items', array['refund_management']),
      ('credit_ledger', array['credit_management']),
      ('goods_receipts', array['purchasing','supplier_management']),
      ('goods_receipt_items', array['purchasing','supplier_management']),
      ('qr_scan_logs', array['qr_analytics'])
    ) as v(tbl, keys)
  loop
    -- Read policies are named *_member_read or *_read depending on the migration that created them.
    foreach t in array array[r.tbl || '_member_read', r.tbl || '_read'] loop
      execute format('drop policy if exists %I on %I', t, r.tbl);
    end loop;
    execute format('create policy %I on %I for select to authenticated
      using (app.store_perm_any(store_id, %L::text[]))', r.tbl || '_permission_read', r.tbl, r.keys);
  end loop;
end $$;
