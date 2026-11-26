-- ZENTRO BuildMart: core schema (multi-tenant).
-- Conventions:
--   * Money is stored as integer paise (bigint). No floating point for money.
--   * Tenant tables carry store_id and are protected by RLS in 0002_rls.sql.
--   * Quantities for tile variants are in the variant's selling unit (usually boxes).
--   * Status values are text + CHECK constraints so they stay readable in SQL and in the API.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity and platform
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 1 and 120),
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table platform_admins (
  profile_id  uuid primary key references profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table roles (
  code        text primary key check (code in ('super_admin','shop_owner','manager','staff','customer')),
  description text not null
);

create table permissions (
  code        text primary key,
  description text not null
);

create table role_permissions (
  role_code       text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table platform_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stores (tenants)
-- ---------------------------------------------------------------------------
create table stores (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name          text not null check (length(trim(name)) between 1 and 160),
  status        text not null default 'draft' check (status in ('draft','active','suspended','archived')),
  gstin         text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  address_line  text,
  city          text,
  state         text,
  pincode       text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  phone         text,
  email         text,
  logo_url      text,
  brand_colour  text not null default '#6A0D2A' check (brand_colour ~ '^#[0-9A-Fa-f]{6}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create table store_owners (
  store_id    uuid not null references stores(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','manager','staff')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (store_id, profile_id)
);
create index store_owners_profile_idx on store_owners(profile_id);

create table store_settings (
  store_id                  uuid primary key references stores(id) on delete cascade,
  invoice_prefix            text not null default 'INV' check (invoice_prefix ~ '^[A-Z]{1,6}$'),
  order_prefix              text not null default 'ZBM' check (order_prefix ~ '^[A-Z]{1,6}$'),
  default_language          text not null default 'en' check (default_language in ('en','ta')),
  catalogue_visible         boolean not null default true,
  online_payment_enabled    boolean not null default true,
  cash_payment_enabled      boolean not null default true,
  delivery_charge_paise     bigint not null default 0 check (delivery_charge_paise >= 0),
  free_delivery_above_paise bigint check (free_delivery_above_paise is null or free_delivery_above_paise >= 0),
  reservation_minutes       integer not null default 30 check (reservation_minutes between 5 and 1440),
  payment_expiry_minutes    integer not null default 15 check (payment_expiry_minutes between 5 and 120),
  opening_hours             jsonb not null default '{}'::jsonb,
  notification_email        text,
  updated_at                timestamptz not null default now()
);

create table store_counters (
  store_id    uuid not null references stores(id) on delete cascade,
  kind        text not null check (kind in ('order','invoice','quotation','po','grn','payment','refund')),
  next_value  bigint not null default 1 check (next_value >= 1),
  primary key (store_id, kind)
);

create table feature_flags (
  store_id    uuid not null references stores(id) on delete cascade,
  feature_key text not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (store_id, feature_key)
);

-- ---------------------------------------------------------------------------
-- Subscriptions (ZENTRO platform revenue; separate from retail sales)
-- ---------------------------------------------------------------------------
create table subscription_plans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  billing_interval text not null check (billing_interval in ('monthly','annual')),
  price_paise     bigint not null check (price_paise >= 0),
  max_products    integer check (max_products is null or max_products > 0),
  features        jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  plan_id             uuid not null references subscription_plans(id),
  status              text not null check (status in ('trialing','active','grace','expired','cancelled')),
  period_start        date not null,
  period_end          date not null check (period_end > period_start),
  grace_ends_on       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index subscriptions_store_idx on subscriptions(store_id, status);

create table subscription_payments (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  store_id        uuid not null references stores(id) on delete cascade,
  amount_paise    bigint not null check (amount_paise > 0),
  status          text not null check (status in ('pending','paid','failed','refunded')),
  reference       text,
  paid_on         date,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  image_url   text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, slug)
);

create table subcategories (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  sort_order  integer not null default 0,
  unique (store_id, category_id, slug)
);

create table brands (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  logo_url    text,
  is_premium  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (store_id, slug)
);

create table products (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  category_id       uuid not null references categories(id),
  subcategory_id    uuid references subcategories(id),
  brand_id          uuid references brands(id),
  sku               text not null check (length(trim(sku)) between 2 and 64),
  slug              text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text not null check (length(trim(name)) between 1 and 200),
  description       text,
  model_number     text,
  material          text,
  finish            text,
  application       text check (application is null or application in ('floor','wall','bathroom','kitchen','outdoor','general')),
  colour            text,
  size_label        text,
  thickness_mm      numeric(6,2) check (thickness_mm is null or thickness_mm > 0),
  warranty_months   integer check (warranty_months is null or warranty_months >= 0),
  hsn_code          text,
  gst_rate_bps      integer not null default 1800 check (gst_rate_bps between 0 and 2800),  -- 1800 = 18.00%
  unit_of_sale      text not null default 'piece' check (unit_of_sale in ('piece','box','sqft','sqm','set','kg','metre')),
  is_featured       boolean not null default false,
  is_new_arrival    boolean not null default false,
  is_best_seller    boolean not null default false,
  is_special_offer  boolean not null default false,
  visibility        text not null default 'public' check (visibility in ('public','hidden')),
  status            text not null default 'active' check (status in ('active','archived')),
  specs             jsonb not null default '{}'::jsonb,
  search_tsv        tsvector generated always as (
                      to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' ||
                                  coalesce(model_number,'') || ' ' || coalesce(description,''))
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  unique (store_id, sku),
  unique (store_id, slug)
);
create index products_store_category_idx on products(store_id, category_id) where status = 'active';
create index products_search_idx on products using gin (search_tsv);
create index products_store_flags_idx on products(store_id, is_featured, is_new_arrival, is_best_seller);

create table product_variants (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references stores(id) on delete cascade,
  product_id              uuid not null references products(id) on delete cascade,
  sku                     text not null check (length(trim(sku)) between 2 and 80),
  label                   text not null,
  size_label              text,
  colour                  text,
  finish                  text,
  thickness_mm            numeric(6,2) check (thickness_mm is null or thickness_mm > 0),
  sale_price_paise        bigint not null check (sale_price_paise >= 0),
  cost_price_paise        bigint not null default 0 check (cost_price_paise >= 0),
  mrp_paise               bigint check (mrp_paise is null or mrp_paise >= sale_price_paise),
  price_unit              text not null default 'piece' check (price_unit in ('piece','box','sqft','sqm','set','kg','metre')),
  pieces_per_box          integer not null default 1 check (pieces_per_box > 0),
  coverage_sqft_per_box   numeric(10,3) check (coverage_sqft_per_box is null or coverage_sqft_per_box > 0),
  is_default              boolean not null default false,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (store_id, sku)
);
create index product_variants_product_idx on product_variants(product_id);
-- At most one default variant per product.
create unique index product_variants_one_default_idx on product_variants(product_id) where is_default;

create table variant_price_history (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  variant_id          uuid not null references product_variants(id) on delete cascade,
  sale_price_paise    bigint not null check (sale_price_paise >= 0),
  cost_price_paise    bigint not null check (cost_price_paise >= 0),
  effective_from      timestamptz not null default now()
);
create index variant_price_history_idx on variant_price_history(variant_id, effective_from desc);

create table product_images (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  storage_path text,
  public_url   text not null,
  alt_text     text not null default '',
  sort_order   integer not null default 0,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index product_images_product_idx on product_images(product_id, sort_order);

create table product_specifications (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  label       text not null,
  value       text not null,
  sort_order  integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create table inventory (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  variant_id      uuid not null unique references product_variants(id) on delete cascade,
  on_hand         bigint not null default 0 check (on_hand >= 0),
  reserved        bigint not null default 0 check (reserved >= 0),
  damaged         bigint not null default 0 check (damaged >= 0),
  incoming        bigint not null default 0 check (incoming >= 0),
  reorder_level   bigint not null default 0 check (reorder_level >= 0),
  updated_at      timestamptz not null default now(),
  check (reserved <= on_hand)   -- the database refuses overselling even if application code is wrong
);
create index inventory_store_idx on inventory(store_id);

create table inventory_batches (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id) on delete cascade,
  variant_id         uuid not null references product_variants(id) on delete cascade,
  supplier_id        uuid,
  batch_number       text not null,
  shade_code         text,
  calibre            text,
  manufacturing_date date,
  on_hand            bigint not null default 0 check (on_hand >= 0),
  reserved           bigint not null default 0 check (reserved >= 0),
  damaged            bigint not null default 0 check (damaged >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (store_id, variant_id, batch_number),
  check (reserved <= on_hand)
);

create table inventory_reservations (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  order_id    uuid not null,
  variant_id  uuid not null references product_variants(id),
  quantity    bigint not null check (quantity > 0),
  status      text not null default 'active' check (status in ('active','released','consumed')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (order_id, variant_id)
);
create index inventory_reservations_active_idx on inventory_reservations(expires_at) where status = 'active';

create table stock_movements (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  variant_id      uuid not null references product_variants(id),
  batch_id        uuid references inventory_batches(id),
  movement_type   text not null check (movement_type in
                    ('purchase','sale','return','adjustment','damage','transfer_in','transfer_out',
                     'reserve','release','reconcile','opening')),
  quantity        bigint not null check (quantity <> 0),  -- signed: + increases on_hand, - decreases
  reference_type  text,
  reference_id    uuid,
  actor_id        uuid references profiles(id),
  note            text,
  created_at      timestamptz not null default now()
);
create index stock_movements_variant_idx on stock_movements(variant_id, created_at desc);

create table damaged_stock (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  variant_id  uuid not null references product_variants(id),
  batch_id    uuid references inventory_batches(id),
  quantity    bigint not null check (quantity > 0),
  reason      text not null,
  reported_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customers, guests and carts
-- ---------------------------------------------------------------------------
create table customers (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  full_name           text not null,
  mobile              text check (mobile is null or mobile ~ '^[0-9]{10}$'),
  email               text,
  gstin               text,
  is_credit_approved  boolean not null default false,
  credit_limit_paise  bigint not null default 0 check (credit_limit_paise >= 0),
  lifetime_value_paise bigint not null default 0 check (lifetime_value_paise >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index customers_store_mobile_idx on customers(store_id, mobile) where mobile is not null;

create table addresses (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  line1       text not null,
  line2       text,
  city        text not null,
  state       text not null,
  pincode     text not null check (pincode ~ '^[0-9]{6}$'),
  is_default  boolean not null default false
);

-- Guest sessions: the raw token lives only in the guest's cookie; the database stores its SHA-256 hash.
create table guest_sessions (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  token_hash    text not null unique check (length(token_hash) = 64),
  customer_id   uuid references customers(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index guest_sessions_store_idx on guest_sessions(store_id);

create table carts (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references stores(id) on delete cascade,
  guest_session_id uuid not null references guest_sessions(id) on delete cascade,
  status           text not null default 'active' check (status in ('active','converted','abandoned')),
  coupon_code      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index carts_one_active_idx on carts(guest_session_id) where status = 'active';

create table cart_items (
  id           uuid primary key default gen_random_uuid(),
  cart_id      uuid not null references carts(id) on delete cascade,
  store_id     uuid not null references stores(id) on delete cascade,
  variant_id   uuid not null references product_variants(id) on delete cascade,
  quantity     numeric(12,3) not null check (quantity > 0),
  created_at   timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create table wishlists (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references stores(id) on delete cascade,
  guest_session_id uuid not null references guest_sessions(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (store_id, guest_session_id)
);

create table wishlist_items (
  wishlist_id  uuid not null references wishlists(id) on delete cascade,
  store_id     uuid not null references stores(id) on delete cascade,
  variant_id   uuid not null references product_variants(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (wishlist_id, variant_id)
);

create table projects (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references stores(id) on delete cascade,
  guest_session_id uuid references guest_sessions(id) on delete cascade,
  customer_id      uuid references customers(id) on delete cascade,
  name             text not null,
  budget_paise     bigint check (budget_paise is null or budget_paise >= 0),
  status           text not null default 'planning' check (status in ('planning','quoted','ordered','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (guest_session_id is not null or customer_id is not null)
);

create table project_rooms (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  room_type   text not null check (room_type in ('living','kitchen','bedroom','bathroom','balcony','entrance','custom')),
  name        text not null,
  sort_order  integer not null default 0
);

create table project_items (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  project_room_id uuid not null references project_rooms(id) on delete cascade,
  variant_id      uuid not null references product_variants(id) on delete cascade,
  quantity        numeric(12,3) not null check (quantity > 0),
  created_at      timestamptz not null default now(),
  unique (project_room_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------
create table coupons (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  code                text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_type       text not null check (discount_type in ('percent','flat')),
  discount_bps        integer check (discount_bps is null or discount_bps between 1 and 10000),
  discount_paise      bigint check (discount_paise is null or discount_paise > 0),
  min_order_paise     bigint not null default 0 check (min_order_paise >= 0),
  max_uses            integer check (max_uses is null or max_uses > 0),
  used_count          integer not null default 0 check (used_count >= 0),
  starts_at           timestamptz,
  ends_at             timestamptz,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (store_id, code),
  check ((discount_type = 'percent' and discount_bps is not null and discount_paise is null)
      or (discount_type = 'flat' and discount_paise is not null and discount_bps is null))
);

create table discounts (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  scope         text not null check (scope in ('product','category','bulk')),
  target_id     uuid,
  discount_bps  integer not null check (discount_bps between 1 and 10000),
  min_quantity  numeric(12,3),
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders, payments, cash, invoices
-- ---------------------------------------------------------------------------
create table orders (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references stores(id) on delete cascade,
  order_number            text not null,
  channel                 text not null default 'online' check (channel in ('online','pos')),
  guest_session_id        uuid references guest_sessions(id) on delete set null,
  customer_id             uuid references customers(id) on delete set null,
  customer_name           text not null,
  customer_mobile         text,
  customer_email          text,
  fulfilment              text not null default 'pickup' check (fulfilment in ('pickup','delivery')),
  delivery_address        jsonb,
  payment_method          text not null check (payment_method in ('online','cash','credit')),
  payment_status          text not null default 'PENDING' check (payment_status in
                            ('PENDING','CASH_PENDING','PROCESSING','PAID','FAILED','EXPIRED','PARTIALLY_REFUNDED','REFUNDED')),
  order_status            text not null default 'PLACED' check (order_status in
                            ('PLACED','CONFIRMED','PROCESSING','PACKED','READY_FOR_PICKUP','OUT_FOR_DELIVERY','COMPLETED','CANCELLED')),
  subtotal_paise          bigint not null check (subtotal_paise >= 0),
  discount_paise          bigint not null default 0 check (discount_paise >= 0),
  taxable_paise           bigint not null check (taxable_paise >= 0),
  tax_paise               bigint not null check (tax_paise >= 0),
  delivery_paise          bigint not null default 0 check (delivery_paise >= 0),
  total_paise             bigint not null check (total_paise >= 0),
  coupon_code             text,
  access_token_hash       text check (access_token_hash is null or length(access_token_hash) = 64),
  reservation_expires_at  timestamptz,
  paid_at                 timestamptz,
  cancelled_at            timestamptz,
  cancel_reason           text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (store_id, order_number),
  check (total_paise = subtotal_paise - discount_paise + tax_paise + delivery_paise)
);
create index orders_store_status_idx on orders(store_id, payment_status, order_status, created_at desc);
create index orders_guest_idx on orders(guest_session_id);

-- Foreign key for reservations now that orders exists.
alter table inventory_reservations
  add constraint inventory_reservations_order_fk foreign key (order_id) references orders(id) on delete cascade;

create table order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references orders(id) on delete cascade,
  store_id              uuid not null references stores(id) on delete cascade,
  variant_id            uuid not null references product_variants(id),
  product_name_snapshot text not null,
  variant_label_snapshot text not null,
  sku_snapshot          text not null,
  hsn_code_snapshot     text,
  quantity              numeric(12,3) not null check (quantity > 0),   -- in the price unit (sqft, box, piece...)
  stock_units           bigint not null check (stock_units >= 0),      -- whole selling units reserved and deducted from inventory
  cost_price_paise_snapshot bigint not null default 0 check (cost_price_paise_snapshot >= 0),
  unit_price_paise      bigint not null check (unit_price_paise >= 0),
  discount_paise        bigint not null default 0 check (discount_paise >= 0),
  gst_rate_bps          integer not null check (gst_rate_bps between 0 and 2800),
  taxable_paise         bigint not null check (taxable_paise >= 0),
  tax_paise             bigint not null check (tax_paise >= 0),
  line_total_paise      bigint not null check (line_total_paise >= 0)
);
create index order_items_order_idx on order_items(order_id);

create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  store_id    uuid not null references stores(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_id    uuid references profiles(id),
  note        text,
  created_at  timestamptz not null default now()
);

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  order_id            uuid not null references orders(id) on delete cascade,
  method              text not null check (method in ('online','cash')),
  provider            text not null check (provider in ('razorpay','simulator','cash')),
  provider_order_id   text unique,
  provider_payment_id text unique,
  status              text not null check (status in
                        ('PENDING','CASH_PENDING','PROCESSING','PAID','FAILED','EXPIRED','PARTIALLY_REFUNDED','REFUNDED')),
  amount_paise        bigint not null check (amount_paise > 0),
  currency            text not null default 'INR' check (currency = 'INR'),
  upi_qr_payload      text,
  expires_at          timestamptz,
  paid_at             timestamptz,
  failure_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Duplicate-payment protection: one open payment attempt per order at a time.
create unique index payments_one_open_per_order_idx on payments(order_id)
  where status in ('PENDING','CASH_PENDING','PROCESSING');
create index payments_store_status_idx on payments(store_id, status, created_at desc);

-- Every webhook/event is recorded once; a repeated provider_event_id is a duplicate and is ignored.
create table payment_events (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid references stores(id) on delete set null,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null,
  signature_valid   boolean not null default false,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (provider, provider_event_id)
);

create table cash_confirmations (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references stores(id) on delete cascade,
  order_id              uuid not null unique references orders(id) on delete cascade,
  payment_id            uuid not null references payments(id),
  amount_due_paise      bigint not null check (amount_due_paise > 0),
  amount_received_paise bigint not null check (amount_received_paise >= 0),
  confirmed_by          uuid not null references profiles(id),
  confirmed_at          timestamptz not null default now(),
  note                  text
);

create table refunds (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  payment_id          uuid not null references payments(id),
  order_id            uuid not null references orders(id) on delete cascade,
  amount_paise        bigint not null check (amount_paise > 0),
  status              text not null default 'requested' check (status in ('requested','processing','succeeded','failed','rejected')),
  reason              text not null,
  provider_refund_id  text unique,
  requested_by        uuid references profiles(id),
  created_at          timestamptz not null default now(),
  processed_at        timestamptz
);

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  order_id        uuid not null unique references orders(id) on delete cascade,  -- one invoice per order
  invoice_number  text not null,
  invoice_date    date not null default current_date,
  taxable_paise   bigint not null check (taxable_paise >= 0),
  tax_paise       bigint not null check (tax_paise >= 0),
  total_paise     bigint not null check (total_paise >= 0),
  pdf_path        text,
  created_at      timestamptz not null default now(),
  unique (store_id, invoice_number)
);

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------
create table quotations (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  quotation_number    text not null,
  guest_session_id    uuid references guest_sessions(id) on delete set null,
  customer_id         uuid references customers(id) on delete set null,
  project_id          uuid references projects(id) on delete set null,
  customer_name       text not null,
  customer_mobile     text,
  customer_email      text,
  requirements        text,
  delivery_expectation text,
  status              text not null default 'REQUESTED' check (status in
                        ('REQUESTED','UNDER_REVIEW','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED')),
  valid_until         date,
  subtotal_paise      bigint not null default 0 check (subtotal_paise >= 0),
  discount_paise      bigint not null default 0 check (discount_paise >= 0),
  tax_paise           bigint not null default 0 check (tax_paise >= 0),
  total_paise         bigint not null default 0 check (total_paise >= 0),
  converted_order_id  uuid references orders(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, quotation_number),
  check (total_paise = subtotal_paise - discount_paise + tax_paise)
);
create unique index quotations_converted_order_idx on quotations(converted_order_id) where converted_order_id is not null;

create table quotation_items (
  id                 uuid primary key default gen_random_uuid(),
  quotation_id       uuid not null references quotations(id) on delete cascade,
  store_id           uuid not null references stores(id) on delete cascade,
  variant_id         uuid not null references product_variants(id),
  quantity           numeric(12,3) not null check (quantity > 0),
  unit_price_paise   bigint not null check (unit_price_paise >= 0),
  discount_paise     bigint not null default 0 check (discount_paise >= 0),
  tax_paise          bigint not null default 0 check (tax_paise >= 0),
  line_total_paise   bigint not null check (line_total_paise >= 0)
);

-- ---------------------------------------------------------------------------
-- Suppliers and purchasing
-- ---------------------------------------------------------------------------
create table suppliers (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  name            text not null,
  contact_person  text,
  phone           text,
  email           text,
  gstin           text,
  address         text,
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table inventory_batches
  add constraint inventory_batches_supplier_fk foreign key (supplier_id) references suppliers(id) on delete set null;

create table supplier_products (
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  store_id     uuid not null references stores(id) on delete cascade,
  variant_id   uuid not null references product_variants(id) on delete cascade,
  supplier_sku text,
  primary key (supplier_id, variant_id)
);

create table purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  supplier_id   uuid not null references suppliers(id),
  po_number     text not null,
  status        text not null default 'draft' check (status in ('draft','sent','partially_received','received','cancelled')),
  expected_on   date,
  total_paise   bigint not null default 0 check (total_paise >= 0),
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, po_number)
);

create table purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  store_id           uuid not null references stores(id) on delete cascade,
  variant_id         uuid not null references product_variants(id),
  quantity_ordered   bigint not null check (quantity_ordered > 0),
  quantity_received  bigint not null default 0 check (quantity_received >= 0),
  unit_cost_paise    bigint not null check (unit_cost_paise >= 0),
  check (quantity_received <= quantity_ordered)
);

create table goods_receipts (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id) on delete cascade,
  purchase_order_id  uuid references purchase_orders(id),
  supplier_id        uuid not null references suppliers(id),
  grn_number         text not null,
  received_on        date not null default current_date,
  received_by        uuid references profiles(id),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (store_id, grn_number)
);

create table goods_receipt_items (
  id                 uuid primary key default gen_random_uuid(),
  goods_receipt_id   uuid not null references goods_receipts(id) on delete cascade,
  store_id           uuid not null references stores(id) on delete cascade,
  purchase_order_item_id uuid references purchase_order_items(id),
  variant_id         uuid not null references product_variants(id),
  batch_number       text,
  quantity_received  bigint not null check (quantity_received >= 0),
  quantity_damaged   bigint not null default 0 check (quantity_damaged >= 0),
  unit_cost_paise    bigint not null check (unit_cost_paise >= 0),
  check (quantity_damaged <= quantity_received)
);

create table supplier_invoices (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  supplier_id     uuid not null references suppliers(id),
  purchase_order_id uuid references purchase_orders(id),
  invoice_number  text not null,
  invoice_date    date not null,
  amount_paise    bigint not null check (amount_paise > 0),
  created_at      timestamptz not null default now(),
  unique (store_id, supplier_id, invoice_number)
);

create table supplier_payments (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id) on delete cascade,
  supplier_id        uuid not null references suppliers(id),
  supplier_invoice_id uuid references supplier_invoices(id),
  amount_paise       bigint not null check (amount_paise > 0),
  paid_on            date not null default current_date,
  method             text not null check (method in ('cash','bank','upi','cheque')),
  reference          text,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Credit ledger, expenses, cash reconciliation, deliveries
-- ---------------------------------------------------------------------------
create table credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  entry_type    text not null check (entry_type in ('sale','payment','adjustment')),
  amount_paise  bigint not null check (amount_paise <> 0),  -- + increases what the customer owes, - reduces it
  due_on        date,
  reference_type text,
  reference_id  uuid,
  note          text,
  created_at    timestamptz not null default now()
);
create index credit_ledger_customer_idx on credit_ledger(customer_id, created_at);

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  category      text not null,
  amount_paise  bigint not null check (amount_paise > 0),
  expense_on    date not null default current_date,
  paid_from     text not null default 'cash' check (paid_from in ('cash','bank','other')),
  note          text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table cash_reconciliations (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references stores(id) on delete cascade,
  business_date            date not null,
  opening_paise            bigint not null default 0 check (opening_paise >= 0),
  cash_sales_paise         bigint not null default 0 check (cash_sales_paise >= 0),
  cash_refunds_paise       bigint not null default 0 check (cash_refunds_paise >= 0),
  cash_expenses_paise      bigint not null default 0 check (cash_expenses_paise >= 0),
  cash_deposits_paise      bigint not null default 0 check (cash_deposits_paise >= 0),
  expected_closing_paise   bigint not null,
  actual_closing_paise     bigint not null check (actual_closing_paise >= 0),
  difference_paise         bigint not null,
  closed_by                uuid references profiles(id),
  created_at               timestamptz not null default now(),
  unique (store_id, business_date),
  check (difference_paise = actual_closing_paise - expected_closing_paise)
);

create table deliveries (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references stores(id) on delete cascade,
  order_id              uuid not null unique references orders(id) on delete cascade,
  status                text not null default 'scheduled' check (status in
                          ('scheduled','assigned','out_for_delivery','delivered','failed')),
  scheduled_on          date,
  delivery_charge_paise bigint not null default 0 check (delivery_charge_paise >= 0),
  assigned_to           text,
  vehicle_number        text,
  delivered_at          timestamptz,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- QR codes
-- ---------------------------------------------------------------------------
create table qr_codes (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  target_type   text not null check (target_type in ('showroom','category','product','invoice')),
  target_id     uuid,
  public_url    text not null,
  storage_path  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  check ((target_type = 'showroom') = (target_id is null))
);
create unique index qr_codes_target_idx on qr_codes(store_id, target_type, target_id) where target_id is not null;
create unique index qr_codes_showroom_idx on qr_codes(store_id) where target_type = 'showroom';

create table qr_scan_logs (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  qr_code_id    uuid not null references qr_codes(id) on delete cascade,
  scanned_at    timestamptz not null default now(),
  user_agent_hash text
);
create index qr_scan_logs_store_idx on qr_scan_logs(store_id, scanned_at desc);

-- ---------------------------------------------------------------------------
-- Notifications, audit, support
-- ---------------------------------------------------------------------------
create table notifications (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid references stores(id) on delete cascade,
  recipient_profile_id  uuid references profiles(id) on delete cascade,
  type                  text not null,
  title                 text not null,
  body                  text,
  link                  text,
  read_at               timestamptz,
  created_at            timestamptz not null default now()
);
create index notifications_store_idx on notifications(store_id, created_at desc);

create table audit_logs (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid references stores(id) on delete set null,
  actor_id     uuid references profiles(id) on delete set null,
  actor_type   text not null check (actor_type in ('super_admin','shop_owner','guest','system','webhook')),
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  before_state jsonb,
  after_state  jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_store_idx on audit_logs(store_id, created_at desc);

create table support_tickets (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid references stores(id) on delete set null,
  requester_id  uuid references profiles(id) on delete set null,
  category      text not null check (category in ('billing','technical','inventory','payments','onboarding','other')),
  priority      text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status        text not null default 'open' check (status in ('open','in_progress','waiting','resolved','closed')),
  subject       text not null,
  assigned_to   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create table support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','stores','store_settings','subscriptions','categories','products','product_variants',
    'inventory','inventory_batches','inventory_reservations','customers','carts','projects',
    'orders','payments','quotations','purchase_orders','suppliers','support_tickets','platform_settings'
  ] loop
    execute format('create trigger %I_set_updated_at before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
