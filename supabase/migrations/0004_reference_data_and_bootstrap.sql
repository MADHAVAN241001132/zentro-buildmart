-- ZENTRO BuildMart: reference data needed in every environment (production included),
-- and a trigger that gives every new store its settings row.

insert into roles (code, description) values
  ('super_admin', 'ZENTRO Networks platform administrator'),
  ('shop_owner',  'Owner of a retail store; full access to that store'),
  ('manager',     'Store manager; manages catalogue, orders, purchasing and cash'),
  ('staff',       'Showroom staff; POS billing and order handling'),
  ('customer',    'Customer with an optional account')
on conflict (code) do nothing;

insert into permissions (code, description) values
  ('catalogue.manage',   'Create and edit products, categories, brands and prices'),
  ('inventory.manage',   'Adjust stock, record damage and reconcile counts'),
  ('orders.manage',      'Update order status and cancel orders'),
  ('cash.confirm',       'Confirm cash collected at the counter'),
  ('purchasing.manage',  'Create purchase orders and record goods receipts'),
  ('finance.view',       'View P&L, reports and reconciliations'),
  ('finance.manage',     'Record expenses and close cash reconciliation'),
  ('store.settings',     'Change store settings, branding and payment configuration'),
  ('staff.manage',       'Manage store team members'),
  ('platform.admin',     'Platform administration across all stores')
on conflict (code) do nothing;

insert into role_permissions (role_code, permission_code)
select r, p from (values
  ('super_admin','platform.admin'),
  ('shop_owner','catalogue.manage'),('shop_owner','inventory.manage'),('shop_owner','orders.manage'),
  ('shop_owner','cash.confirm'),('shop_owner','purchasing.manage'),('shop_owner','finance.view'),
  ('shop_owner','finance.manage'),('shop_owner','store.settings'),('shop_owner','staff.manage'),
  ('manager','catalogue.manage'),('manager','inventory.manage'),('manager','orders.manage'),
  ('manager','cash.confirm'),('manager','purchasing.manage'),('manager','finance.view'),
  ('staff','orders.manage')
) as v(r, p)
on conflict do nothing;

-- Every new store starts with default settings, so the storefront can render immediately.
create or replace function app.bootstrap_store() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into store_settings (store_id) values (new.id) on conflict (store_id) do nothing;
  return new;
end $$;

drop trigger if exists stores_bootstrap on stores;
create trigger stores_bootstrap after insert on stores
  for each row execute function app.bootstrap_store();
