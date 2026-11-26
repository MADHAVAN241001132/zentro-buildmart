-- ZENTRO BuildMart: Row-Level Security.
-- Principles:
--   1. Every tenant table has RLS enabled. No table is readable or writable by default.
--   2. Shop owners and managers see only rows of stores they belong to (store_owners).
--   3. Super Admins (platform_admins) can see and manage everything.
--   4. Guest customers never query tables directly. The app reaches them through the
--      service role after validating the guest session cookie, so the anon role gets
--      only the public catalogue (active stores, visible products).
--   5. Stock, money and invoice numbers change only through the SECURITY DEFINER
--      functions in 0003 (or the service role). Owners get read access to those tables.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Helper predicates
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from platform_admins p where p.profile_id = auth.uid())
$$;

create or replace function app.is_store_member(p_store uuid, p_roles text[] default array['owner','manager','staff'])
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from store_owners so
    where so.store_id = p_store
      and so.profile_id = auth.uid()
      and so.is_active
      and so.role = any (p_roles)
  )
$$;

create or replace function app.store_is_public(p_store uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from stores s
    join store_settings ss on ss.store_id = s.id
    where s.id = p_store and s.status = 'active' and ss.catalogue_visible
  )
$$;

create or replace function app.product_is_public(p_product uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from products p
    where p.id = p_product and p.status = 'active' and p.visibility = 'public'
      and app.store_is_public(p.store_id)
  )
$$;

-- Guarantees the anon/authenticated roles can execute the helpers.
grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere (default-deny)
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in ('schema_migrations')
  loop
    execute format('alter table %I enable row level security', t.tablename);
  end loop;
end $$;

-- Table privileges: keep the anon role on read-only catalogue tables only.
revoke all on all tables in schema public from anon, authenticated;
-- Table grants allow the operation; RLS policies decide which rows and which tables are writable.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on categories, subcategories, brands, products, product_variants,
                product_images, product_specifications, stores, subscription_plans, roles, permissions
  to anon;

-- ---------------------------------------------------------------------------
-- Platform-level tables
-- ---------------------------------------------------------------------------
-- profiles
create policy profiles_self_read on profiles for select to authenticated
  using (id = auth.uid() or app.is_platform_admin());
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on profiles for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- platform_admins: only admins can see the list; only the service role can change it.
create policy platform_admins_read on platform_admins for select to authenticated
  using (app.is_platform_admin());

-- roles / permissions: reference data, readable by all signed-in users.
create policy roles_read on roles for select to anon, authenticated using (true);
create policy permissions_read on permissions for select to anon, authenticated using (true);
create policy role_permissions_read on role_permissions for select to authenticated using (true);

-- platform_settings and subscription plans
create policy platform_settings_admin on platform_settings for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy subscription_plans_public on subscription_plans for select to anon, authenticated
  using (is_active or app.is_platform_admin());
create policy subscription_plans_admin_write on subscription_plans for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Stores and membership
-- ---------------------------------------------------------------------------
create policy stores_public_read on stores for select to anon
  using (status = 'active');
create policy stores_member_read on stores for select to authenticated
  using (status = 'active' or app.is_store_member(id) or app.is_platform_admin());
create policy stores_owner_update on stores for update to authenticated
  using (app.is_store_member(id, array['owner'])) with check (app.is_store_member(id, array['owner']));
create policy stores_admin_all on stores for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Only platform admins may change a store's lifecycle status.
create or replace function app.guard_store_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and not app.is_platform_admin() and current_user <> 'service_role' then
    raise exception 'Only a platform administrator can change a store status'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger stores_guard_status before update on stores
  for each row execute function app.guard_store_status();

create policy store_owners_member_read on store_owners for select to authenticated
  using (profile_id = auth.uid() or app.is_store_member(store_id) or app.is_platform_admin());
create policy store_owners_owner_manage on store_owners for all to authenticated
  using (app.is_store_member(store_id, array['owner']) or app.is_platform_admin())
  with check (app.is_store_member(store_id, array['owner']) or app.is_platform_admin());

create policy store_settings_member_read on store_settings for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
create policy store_settings_owner_update on store_settings for update to authenticated
  using (app.is_store_member(store_id, array['owner','manager'])) with check (app.is_store_member(store_id, array['owner','manager']));
create policy store_settings_admin_all on store_settings for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy store_counters_admin on store_counters for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Public catalogue (anon + signed-in)
-- ---------------------------------------------------------------------------
create policy categories_public on categories for select to anon, authenticated
  using (is_active and app.store_is_public(store_id));
create policy subcategories_public on subcategories for select to anon, authenticated
  using (app.store_is_public(store_id));
create policy brands_public on brands for select to anon, authenticated
  using (app.store_is_public(store_id));
create policy products_public on products for select to anon, authenticated
  using (status = 'active' and visibility = 'public' and app.store_is_public(store_id));
create policy product_variants_public on product_variants for select to anon, authenticated
  using (is_active and app.product_is_public(product_id));
create policy product_images_public on product_images for select to anon, authenticated
  using (app.product_is_public(product_id));
create policy product_specifications_public on product_specifications for select to anon, authenticated
  using (app.product_is_public(product_id));

-- ---------------------------------------------------------------------------
-- Tenant tables: members read; owners and managers write directly
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','subcategories','brands','products','product_variants','product_images',
    'product_specifications','variant_price_history','customers','addresses','suppliers',
    'supplier_products','purchase_orders','purchase_order_items','coupons','discounts',
    'expenses','qr_codes','quotations','quotation_items','deliveries','cash_reconciliations',
    'feature_flags','supplier_invoices','supplier_payments'
  ] loop
    execute format('create policy %I on %I for select to authenticated
      using (app.is_store_member(store_id) or app.is_platform_admin())', t || '_member_read', t);
    execute format('create policy %I on %I for all to authenticated
      using (app.is_store_member(store_id, array[''owner'',''manager'']) or app.is_platform_admin())
      with check (app.is_store_member(store_id, array[''owner'',''manager'']) or app.is_platform_admin())',
      t || '_manage', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tenant tables: members READ only. Changes happen through app functions or the service role.
-- Stock, money, orders, payments, invoices, GRNs and the credit ledger all fall here.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'inventory','inventory_batches','inventory_reservations','stock_movements','damaged_stock',
    'orders','order_items','order_status_history','payments','refunds','invoices',
    'cash_confirmations','credit_ledger','goods_receipts','goods_receipt_items',
    'guest_sessions','carts','cart_items','wishlists','wishlist_items','projects','project_rooms',
    'project_items','subscriptions','subscription_payments','qr_scan_logs','store_counters'
  ] loop
    execute format('create policy %I on %I for select to authenticated
      using (app.is_store_member(store_id) or app.is_platform_admin())', t || '_read', t);
  end loop;
end $$;

-- Cash confirmation is never written by the browser. It is written by confirm_cash_payment()
-- after the function verifies the caller is a store owner or manager (see 0003).

-- Subscription data is managed by Super Admins only.
create policy subscriptions_admin_write on subscriptions for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy subscription_payments_admin_write on subscription_payments for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Payment webhook events: never readable or writable from the client.
-- RLS is on with no policies, so only the service role (webhook handler) can touch them.
-- ---------------------------------------------------------------------------
revoke all on payment_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications, audit and support
-- ---------------------------------------------------------------------------
create policy notifications_read on notifications for select to authenticated
  using (recipient_profile_id = auth.uid()
         or (recipient_profile_id is null and app.is_store_member(store_id))
         or app.is_platform_admin());
create policy notifications_mark_read on notifications for update to authenticated
  using (recipient_profile_id = auth.uid() or (recipient_profile_id is null and app.is_store_member(store_id)))
  with check (recipient_profile_id = auth.uid() or (recipient_profile_id is null and app.is_store_member(store_id)));

create policy audit_logs_read on audit_logs for select to authenticated
  using (app.is_platform_admin() or app.is_store_member(store_id, array['owner']));

create policy support_tickets_read on support_tickets for select to authenticated
  using (requester_id = auth.uid() or app.is_store_member(store_id, array['owner']) or app.is_platform_admin());
create policy support_tickets_create on support_tickets for insert to authenticated
  with check (requester_id = auth.uid());
create policy support_tickets_admin_update on support_tickets for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy support_messages_read on support_messages for select to authenticated
  using (exists (select 1 from support_tickets t where t.id = ticket_id
           and (t.requester_id = auth.uid() or app.is_platform_admin())));
create policy support_messages_insert on support_messages for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from support_tickets t where t.id = ticket_id
           and (t.requester_id = auth.uid() or app.is_platform_admin())));

-- ---------------------------------------------------------------------------
-- New users get a profile automatically (Supabase Auth signup).
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into profiles (id, full_name, phone)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'New user'),
          nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime: broadcast only tables the owner portal may read.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders','payments','cash_confirmations','inventory','notifications','quotations']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
