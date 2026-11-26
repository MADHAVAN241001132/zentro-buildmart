-- ZENTRO BuildMart: DEVELOPMENT DEMO DATA ONLY.
-- Never run this against production. It creates demo accounts with a known password.
-- Run after migrations 0001-0004. Re-running requires a fresh database.
--
-- Demo accounts (password for all: ZentroDev!2026)
--   admin@zentro.example                  Super Admin
--   owner.ambattur@zentro.example         Shop Owner, ZENTRO Ambattur Central Showroom
--   manager.ambattur@zentro.example       Manager, ZENTRO Ambattur Central Showroom
--   owner.coimbatore@zentro.example       Shop Owner, ZENTRO Coimbatore Tiles & Sanitary
--
-- The order flows below call the same SECURITY DEFINER functions the app uses, so the seed
-- also exercises reservation, payment settlement, cash confirmation and purchasing.

begin;

-- ---------------------------------------------------------------------------
-- Demo accounts
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@zentro.example',
     crypt('ZentroDev!2026', gen_salt('bf')), '{"full_name":"ZENTRO Super Admin"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'owner.ambattur@zentro.example',
     crypt('ZentroDev!2026', gen_salt('bf')), '{"full_name":"Vijay Shankar"}'),
  ('00000000-0000-4000-8000-0000000000a3', 'owner.coimbatore@zentro.example',
     crypt('ZentroDev!2026', gen_salt('bf')), '{"full_name":"Meena Arumugam"}'),
  ('00000000-0000-4000-8000-0000000000a4', 'manager.ambattur@zentro.example',
     crypt('ZentroDev!2026', gen_salt('bf')), '{"full_name":"R. Rajesh Kumar"}');

insert into platform_admins (profile_id) values ('00000000-0000-4000-8000-0000000000a1');

-- ---------------------------------------------------------------------------
-- Stores (two tenants, to verify isolation)
-- ---------------------------------------------------------------------------
insert into stores (id, slug, name, status, gstin, address_line, city, state, pincode, phone, email) values
  ('11111111-1111-4111-8111-111111111111', 'ambattur-central', 'ZENTRO Ambattur Central Showroom', 'active',
   '33AAAAA1234A1ZV', 'No. 14, Padi Main Road', 'Chennai', 'Tamil Nadu', '600053', '044-26201455', 'ambattur@zentro.example'),
  ('22222222-2222-4222-8222-222222222222', 'coimbatore-tiles', 'ZENTRO Coimbatore Tiles & Sanitary', 'active',
   '33BBBBB5678B1ZY', 'Avinashi Road', 'Coimbatore', 'Tamil Nadu', '641037', '0422-2551190', 'coimbatore@zentro.example');

update store_settings set delivery_charge_paise = 19900, free_delivery_above_paise = 1500000
  where store_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

insert into store_owners (store_id, profile_id, role) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a2', 'owner'),
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a4', 'manager'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-0000000000a3', 'owner');

insert into subscription_plans (code, name, billing_interval, price_paise, max_products, products_unlimited, max_users, users_unlimited, features) values
  ('STARTER', 'Starter', 'monthly', 99900, 200, false, 5, false, '{"qr":true,"pos":true}'),
  ('GROWTH', 'Growth', 'monthly', 249900, 1000, false, 15, false, '{"qr":true,"pos":true,"reports":true,"quotations":true}'),
  ('ENTERPRISE', 'Enterprise', 'annual', 2499900, null, true, null, true, '{"qr":true,"pos":true,"reports":true,"quotations":true,"multi_store":true}');

insert into subscriptions (store_id, plan_id, status, period_start, period_end)
select '11111111-1111-4111-8111-111111111111', id, 'active', '2026-11-01', '2026-12-31'
from subscription_plans where code = 'GROWTH';

insert into subscriptions (store_id, plan_id, status, period_start, period_end, grace_ends_on)
select '22222222-2222-4222-8222-222222222222', id, 'grace', '2026-08-01', '2026-09-30', '2026-12-15'
from subscription_plans where code = 'STARTER';

insert into store_settings (store_id, delivery_charge_paise, free_delivery_above_paise, notification_email)
values ('11111111-1111-4111-8111-111111111111', 19900, 1500000, 'ambattur@zentro.example')
on conflict (store_id) do update set delivery_charge_paise = excluded.delivery_charge_paise,
  free_delivery_above_paise = excluded.free_delivery_above_paise, notification_email = excluded.notification_email;

-- ---------------------------------------------------------------------------
-- Catalogue generator (80 products per store, with inventory and tile batches)
-- ---------------------------------------------------------------------------
create or replace function public.dev_seed_catalogue(p_store uuid, p_prefix text, p_batches boolean)
returns void language plpgsql as $$
declare
  cat_slugs text[] := array['floor-vitrified-tiles','wall-tiles','ceramic-tiles','steel-doors','taps-and-faucets',
                            'wash-basins','sanitaryware','bathroom-accessories','kitchen-accessories','construction-accessories'];
  cat_names text[] := array['Floor & Vitrified Tiles','Wall Tiles & Panels','Ceramic Tiles','Steel Doors','Taps & Faucets',
                            'Wash Basins','Sanitaryware','Bathroom Accessories','Kitchen Accessories','Construction Accessories'];
  cat_materials text[] := array['Vitrified porcelain','Glazed ceramic','Glazed ceramic','Steel with wood-grain laminate',
                                'Brass with chrome finish','Vitreous china','Vitreous china','Stainless steel',
                                'Stainless steel','Cementitious and polymer'];
  cat_hsn text[] := array['6907','6907','6907','7308','8481','6910','6910','3924','7324','3214'];
  cat_base bigint[] := array[180000,90000,65000,1800000,350000,450000,1200000,120000,650000,65000];
  brand_slugs text[] := array['kajaria','somany','johnson','hindware','jaquar','cera','parryware',
                              'asian-granito','orient-bell','zentro-select'];
  brand_names text[] := array['Kajaria','Somany','Johnson','Hindware','Jaquar','Cera','Parryware',
                              'Asian Granito','Orient Bell','ZENTRO Select'];
  designs text[] := array[
    'Statuario White Marble Vitrified','Calacatta Gold Vitrified','Venezia Terrazzo Porcelain','Nero Marquina Polished',
    'Travertine Beige Matt','Onyx Amber Glossy','Wooden Oak Plank','Concrete Grey Rustic',
    'Pearl Mosaic Wall Tile','Sage Green Gloss Wall','Blush Pink Subway','Marble Look Wall Panel',
    'Ivory Textured Wall','Charcoal Brick Wall','Aqua Glass Mosaic','Sand Beige Wall Tile',
    'Terracotta Ceramic Floor','Ivory Anti-skid Ceramic','Slate Grey Ceramic','Kitchen Mosaic Ceramic',
    'Rustic Stone Ceramic','Cream Matt Ceramic','Walnut Look Ceramic','Pebble Ceramic Tile',
    'Teakwood Finish Steel Door','Walnut Finish Steel Door','Burgundy Premium Steel Door','Fire-rated Steel Door',
    'Double Leaf Steel Door','Grey Frame Steel Door','Ivory Shutter Steel Door','Wood Grain Entry Door',
    'Florentine Gold Basin Mixer','Matt Black Pillar Tap','Chrome Wall Mounted Tap','Brushed Brass Kitchen Mixer',
    'Rain Shower Set','Thermostatic Shower Mixer','Pull-out Kitchen Faucet','Bib Cock Chrome',
    'Wall Hung Ceramic Basin','Countertop Round Basin','Pedestal Basin Set','Vessel Glass Basin',
    'Semi-recessed Basin','Under-counter Basin','Marble Top Vanity Basin','Compact Corner Basin',
    'Floor Mounted EWC','Wall Hung EWC Rimless','Western Commode Dual Flush','Half Pedestal Toilet',
    'Urinal Set Ceramic','One-piece Toilet Premium','Cistern Low-level Set','Bidet Spray Set',
    'Towel Rail Chrome','Soap Dispenser Brass','Toilet Paper Holder','Glass Shower Shelf',
    'Robe Hook Set','Grab Bar Stainless','Shower Caddy Corner','Bathroom Mirror Cabinet',
    'Stainless Steel Sink Double Bowl','Granite Sink Single Bowl','Chimney Filter Set','Kitchen Rack Pull-out',
    'Cutlery Tray Organiser','Spice Rack Steel','Corner Carousel Unit','Drain Board Steel',
    'ZENTRO Gold-Flex Tile Adhesive 20kg','Grout Sealant Epoxy 1kg','Tile Spacer Kit 3mm','Cement Waterproofing 5L',
    'Floor Leveling Compound 25kg','Tile Cutter Heavy Duty','PVC Skirting Strip','Silicone Sealant Clear'
  ];
  cat_ids uuid[] := '{}';
  brand_ids uuid[] := '{}';
  v_id uuid; v_prod uuid; v_var uuid; v_var2 uuid;
  i int; n int; cat_idx int; unit_name text; ppb int; cov numeric;
  sale bigint; cost bigint; mrp bigint; on_hand bigint;
  b1 bigint; b2 bigint; batch1 uuid; batch2 uuid;
  slug text; sku_n text;
begin
  for i in 1..10 loop
    insert into categories (store_id, slug, name, sort_order) values (p_store, cat_slugs[i], cat_names[i], i)
    returning id into v_id;
    cat_ids := cat_ids || v_id;
  end loop;

  for i in 1..10 loop
    insert into brands (store_id, slug, name, is_premium) values (p_store, brand_slugs[i], brand_names[i], i in (5,9,10))
    returning id into v_id;
    brand_ids := brand_ids || v_id;
  end loop;

  for n in 1..80 loop
    cat_idx := (n - 1) / 8 + 1;
    sku_n := lpad(n::text, 3, '0');
    slug := regexp_replace(lower(designs[n]), '[^a-z0-9]+', '-', 'g') || '-' || n::text;
    slug := trim(both '-' from slug);
    sale := cat_base[cat_idx] + (n % 5) * 2500;
    cost := round(sale * 0.78);
    mrp := round(sale * 1.12);

    if cat_idx <= 3 then
      unit_name := 'box';
      ppb := case cat_idx when 1 then 4 when 2 then 6 else 4 end;
      cov := case cat_idx when 1 then 15.000 when 2 then 10.500 else 16.000 end;
    else
      unit_name := 'piece';
      ppb := 1;
      cov := null;
    end if;

    insert into products (store_id, category_id, brand_id, sku, slug, name, description, material, application,
                          colour, hsn_code, gst_rate_bps, unit_of_sale, is_featured, is_new_arrival, is_best_seller,
                          is_special_offer, visibility, status)
    values (p_store, cat_ids[cat_idx], brand_ids[(n % 10) + 1], p_prefix || '-P' || sku_n, slug, designs[n],
            'Premium ' || lower(designs[n]) || ' from the ZENTRO curated range. Suitable for residential and commercial use.',
            cat_materials[cat_idx],
            case when cat_idx <= 3 then 'floor' when cat_idx = 4 then 'general' else 'bathroom' end,
            case n % 4 when 0 then 'Ivory' when 1 then 'Grey' when 2 then 'Gold' else 'White' end,
            cat_hsn[cat_idx], 1800, unit_name::text,
            n % 7 = 0, n % 5 = 1, n % 6 = 2, n % 9 = 3, 'public', 'active')
    returning id into v_prod;

    insert into product_variants (store_id, product_id, sku, label, sale_price_paise, cost_price_paise, mrp_paise,
                                  price_unit, pieces_per_box, coverage_sqft_per_box, is_default)
    values (p_store, v_prod, p_prefix || '-V' || sku_n, 'Standard', sale, cost, mrp,
            unit_name, ppb, cov, true)
    returning id into v_var;

    insert into variant_price_history (store_id, variant_id, sale_price_paise, cost_price_paise)
    values (p_store, v_var, sale, cost);

    -- Every other tile product also sells in a second size.
    if cat_idx <= 3 and n % 2 = 0 then
      insert into product_variants (store_id, product_id, sku, label, size_label, sale_price_paise, cost_price_paise,
                                    mrp_paise, price_unit, pieces_per_box, coverage_sqft_per_box, is_default)
      values (p_store, v_prod, p_prefix || '-V' || sku_n || 'L', '600 x 1200 mm', '600 x 1200 mm',
              round(sale * 1.15), round(sale * 1.15 * 0.78), round(sale * 1.15 * 1.12), unit_name, ppb, cov, false)
      returning id into v_var2;
      insert into variant_price_history (store_id, variant_id, sale_price_paise, cost_price_paise)
      values (p_store, v_var2, round(sale * 1.15), round(sale * 1.15 * 0.78));
      insert into inventory (store_id, variant_id, on_hand, reorder_level)
      values (p_store, v_var2, 10 + (n % 8), 6)
      on conflict (variant_id) do update set on_hand = excluded.on_hand, reorder_level = excluded.reorder_level;
    end if;

    on_hand := 20 + ((n * 37) % 60);
    if n % 9 = 0 then on_hand := 4; end if;  -- a few lines start below reorder level

    if p_batches and cat_idx <= 3 then
      b1 := floor(on_hand * 0.6);
      b2 := on_hand - b1;
      insert into inventory_batches (store_id, variant_id, batch_number, shade_code, calibre, manufacturing_date, on_hand)
      values (p_store, v_var, 'ZBM-BT-' || (8400 + n) || 'A', 'SH-' || (n % 4 + 1), 'C1', date '2026-09-01' + n, b1)
      returning id into batch1;
      insert into inventory_batches (store_id, variant_id, batch_number, shade_code, calibre, manufacturing_date, on_hand)
      values (p_store, v_var, 'ZBM-BT-' || (8400 + n) || 'B', 'SH-' || (n % 4 + 1), 'C1', date '2026-10-15' + n, b2)
      returning id into batch2;
    end if;

    insert into inventory (store_id, variant_id, on_hand, reorder_level)
    values (p_store, v_var, on_hand, 12)
    on conflict (variant_id) do update set on_hand = excluded.on_hand, reorder_level = excluded.reorder_level;

    insert into product_specifications (store_id, product_id, label, value, sort_order) values
      (p_store, v_prod, 'Material', cat_materials[cat_idx], 1),
      (p_store, v_prod, 'Warranty', case when cat_idx = 4 then '5 years' when cat_idx = 10 then 'Not applicable' else '10 years' end, 2);
  end loop;
end $$;

do $$ begin
  perform public.dev_seed_catalogue('11111111-1111-4111-8111-111111111111', 'AMB', true);
  perform public.dev_seed_catalogue('22222222-2222-4222-8222-222222222222', 'CBE', false);
end $$;

-- ---------------------------------------------------------------------------
-- Order helpers (dev only)
-- ---------------------------------------------------------------------------
-- p_lines: [{"sku": "AMB-V001", "qty": 2}]. Prices come from the variant, never from the client.
create or replace function public.dev_place_order(
  p_store uuid, p_name text, p_mobile text, p_method text,
  p_guest uuid, p_customer uuid, p_lines jsonb
) returns uuid language plpgsql as $$
declare
  o_id uuid; o_num text;
  sub bigint := 0; tax_total bigint := 0;
  r record;
  v_sale bigint; v_gst integer;
  gross bigint; tax bigint;
begin
  for r in select (e->>'sku') as sku, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    select pv.sale_price_paise, pr.gst_rate_bps into strict v_sale, v_gst
      from product_variants pv join products pr on pr.id = pv.product_id
      where pv.store_id = p_store and pv.sku = r.sku;
    gross := round(r.qty * v_sale);
    tax := round(gross * v_gst / 10000);
    sub := sub + gross;
    tax_total := tax_total + tax;
  end loop;

  o_num := app.next_number(p_store, 'order', 'ZBM');
  insert into orders (store_id, order_number, guest_session_id, customer_id, customer_name, customer_mobile,
                      fulfilment, payment_method, subtotal_paise, discount_paise, taxable_paise, tax_paise,
                      delivery_paise, total_paise)
  values (p_store, o_num, p_guest, p_customer, p_name, p_mobile, 'pickup', p_method,
          sub, 0, sub, tax_total, 0, sub + tax_total)
  returning id into o_id;

  for r in select (e->>'sku') as sku, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into order_items (order_id, store_id, variant_id, product_name_snapshot, variant_label_snapshot,
                             sku_snapshot, hsn_code_snapshot, quantity, stock_units, cost_price_paise_snapshot,
                             unit_price_paise, discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise)
    select o_id, p_store, pv.id, pr.name, pv.label, pv.sku, pr.hsn_code, r.qty, ceil(r.qty)::bigint,
           pv.cost_price_paise, pv.sale_price_paise, 0, pr.gst_rate_bps,
           round(r.qty * pv.sale_price_paise),
           round(round(r.qty * pv.sale_price_paise) * pr.gst_rate_bps / 10000),
           round(r.qty * pv.sale_price_paise) + round(round(r.qty * pv.sale_price_paise) * pr.gst_rate_bps / 10000)
    from product_variants pv join products pr on pr.id = pv.product_id
    where pv.store_id = p_store and pv.sku = r.sku;
  end loop;

  return o_id;
end $$;

-- ---------------------------------------------------------------------------
-- Customers, guests, carts and wishlists
-- ---------------------------------------------------------------------------
insert into customers (store_id, full_name, mobile, email, is_credit_approved, credit_limit_paise) values
  ('11111111-1111-4111-8111-111111111111', 'Karthik Subramanian', '9840011001', 'karthik.s@example.com', false, 0),
  ('11111111-1111-4111-8111-111111111111', 'Priya Venkatesan', '9840011002', null, false, 0),
  ('11111111-1111-4111-8111-111111111111', 'Mohammed Irfan', '9840011003', null, false, 0),
  ('11111111-1111-4111-8111-111111111111', 'Lakshmi Narayanan', '9840011004', null, false, 0),
  ('11111111-1111-4111-8111-111111111111', 'Anand Raghunathan', '9840011005', null, false, 0),
  ('11111111-1111-4111-8111-111111111111', 'Meenakshi Sundaram', '9840011006', 'meena.architect@example.com', true, 5000000),
  ('11111111-1111-4111-8111-111111111111', 'Divya Krishnan', '9840011007', null, false, 0),
  ('11111111-1111-4111-8111-111111111111', 'Suresh Babu', '9840011008', null, false, 0),
  ('22222222-2222-4222-8222-222222222222', 'Arun Kumar', '9840022001', null, false, 0),
  ('22222222-2222-4222-8222-222222222222', 'Revathi Palani', '9840022002', null, false, 0);

insert into guest_sessions (id, store_id, token_hash, expires_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
     encode(digest('dev-guest-ambattur-1', 'sha256'), 'hex'), '2030-01-01'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
     encode(digest('dev-guest-coimbatore-1', 'sha256'), 'hex'), '2030-01-01');

insert into carts (store_id, guest_session_id)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001');

insert into cart_items (cart_id, store_id, variant_id, quantity)
select c.id, c.store_id, pv.id, 2
from carts c join product_variants pv on pv.sku = 'AMB-V009'
where c.guest_session_id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into wishlists (store_id, guest_session_id)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001');

insert into wishlist_items (wishlist_id, store_id, variant_id)
select w.id, w.store_id, pv.id
from wishlists w join product_variants pv on pv.sku = 'AMB-V033'
where w.guest_session_id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Sample orders. Every flow below runs through the real database functions.
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := '11111111-1111-4111-8111-111111111111';
  b constant uuid := '22222222-2222-4222-8222-222222222222';
  owner_a uuid := '00000000-0000-4000-8000-0000000000a2';
  owner_b uuid := '00000000-0000-4000-8000-0000000000a3';
  o uuid; total bigint; num text; cust uuid;
begin
  -- 1. Paid online (simulator): reserve -> payment attempt -> settle (stock deducted once)
  o := dev_place_order(a, 'Karthik Subramanian', '9840011001', 'online',
        'aaaaaaaa-0000-4000-8000-000000000001', null,
        '[{"sku":"AMB-V001","qty":2},{"sku":"AMB-V033","qty":1},{"sku":"AMB-V073","qty":5}]');
  perform reserve_order_stock(o);
  select total_paise, order_number into total, num from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'sim_order_' || num, total, now() + interval '15 minutes', null);
  perform settle_online_payment('simulator', 'sim_order_' || num, 'sim_pay_' || num, total, true, null);

  -- 2. Paid online, second customer
  o := dev_place_order(a, 'Priya Venkatesan', '9840011002', 'online', null, null,
        '[{"sku":"AMB-V009","qty":3},{"sku":"AMB-V041","qty":1}]');
  perform reserve_order_stock(o);
  select total_paise, order_number into total, num from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'sim_order_' || num, total, now() + interval '15 minutes', null);
  perform settle_online_payment('simulator', 'sim_order_' || num, 'sim_pay_' || num, total, true, null);

  -- 3. Cash order collected at the counter by the owner
  o := dev_place_order(a, 'Anand Raghunathan', '9840011005', 'cash', null, null,
        '[{"sku":"AMB-V017","qty":4}]');
  perform reserve_order_stock(o);
  select total_paise, order_number into total, num from orders where id = o;
  perform create_payment_attempt(o, 'cash', 'cash', null, total, now() + interval '60 minutes', null);
  perform confirm_cash_payment(o, total, 'Counter cash collected', owner_a);

  -- 4. Cash order still waiting at the counter (CASH_PENDING)
  o := dev_place_order(a, 'Mohammed Irfan', '9840011003', 'cash', null, null,
        '[{"sku":"AMB-V049","qty":2}]');
  perform reserve_order_stock(o);
  select total_paise, order_number into total, num from orders where id = o;
  perform create_payment_attempt(o, 'cash', 'cash', null, total, now() + interval '60 minutes', null);

  -- 5. Second cash order, still waiting
  o := dev_place_order(a, 'Lakshmi Narayanan', '9840011004', 'cash', null, null,
        '[{"sku":"AMB-V057","qty":1},{"sku":"AMB-V025","qty":2}]');
  perform reserve_order_stock(o);
  select total_paise, order_number into total, num from orders where id = o;
  perform create_payment_attempt(o, 'cash', 'cash', null, total, now() + interval '60 minutes', null);

  -- 6. Unpaid order cancelled by the customer: reservation released, stock back to available
  o := dev_place_order(a, 'Divya Krishnan', '9840011007', 'online', null, null,
        '[{"sku":"AMB-V065","qty":2}]');
  perform reserve_order_stock(o);
  perform cancel_order(o, 'Customer changed their mind');

  -- 7. Store B: one paid online and one pending cash order (tenant isolation fixtures)
  o := dev_place_order(b, 'Arun Kumar', '9840022001', 'online', null, null,
        '[{"sku":"CBE-V001","qty":1}]');
  perform reserve_order_stock(o);
  select total_paise, order_number into total, num from orders where id = o;
  perform create_payment_attempt(o, 'online', 'simulator', 'sim_order_' || num || '_cbe', total, now() + interval '15 minutes', null);
  perform settle_online_payment('simulator', 'sim_order_' || num || '_cbe', 'sim_pay_' || num || '_cbe', total, true, null);

  o := dev_place_order(b, 'Revathi Palani', '9840022002', 'cash', null, null,
        '[{"sku":"CBE-V033","qty":1}]');
  perform reserve_order_stock(o);
  select total_paise, order_number into total, num from orders where id = o;
  perform create_payment_attempt(o, 'cash', 'cash', null, total, now() + interval '60 minutes', null);

  -- Credit sale to an approved architect, then a partial payment
  select id into cust from customers where mobile = '9840011006';
  perform record_credit_entry(cust, 'sale', 1200000, date '2026-12-31', 'Bulk tiles for Studio Chidambaram project');
  perform record_credit_entry(cust, 'payment', 200000, null, 'Part payment by cheque');
end $$;

-- ---------------------------------------------------------------------------
-- Quotations (architect enquiry and an owner-sent quotation)
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := '11111111-1111-4111-8111-111111111111';
  q uuid; num text; cust uuid;
  r record; gross bigint; tax bigint; sub bigint := 0; tax_t bigint := 0;
begin
  -- Requested by a walk-in guest (no account yet)
  num := app.next_number(a, 'quotation', 'QT');
  insert into quotations (store_id, quotation_number, guest_session_id, customer_name, customer_mobile,
                          requirements, delivery_expectation, status, valid_until,
                          subtotal_paise, discount_paise, tax_paise, total_paise)
  values (a, num, 'aaaaaaaa-0000-4000-8000-000000000001', 'Suresh Babu', '9840011008',
          'Marble-look floor and wall tiles for a 1,200 sq ft apartment, living and dining area', 'Within 2 weeks', 'REQUESTED',
          date '2026-12-15', 0, 0, 0, 0)
  returning id into q;
  for r in select pv.id vid, pv.sale_price_paise price, pr.gst_rate_bps gst
           from product_variants pv join products pr on pr.id = pv.product_id
           where pv.sku in ('AMB-V001','AMB-V009') loop
    gross := 40 * r.price; tax := round(gross * r.gst / 10000);
    insert into quotation_items (quotation_id, store_id, variant_id, quantity, unit_price_paise, discount_paise, tax_paise, line_total_paise,
                                 gross_paise, taxable_paise, gst_rate_bps)
    values (q, a, r.vid, 40, r.price, 0, tax, gross + tax, gross, gross, r.gst);
    sub := sub + gross; tax_t := tax_t + tax;
  end loop;
  update quotations set subtotal_paise = sub, taxable_paise = sub, tax_paise = tax_t, total_paise = sub + tax_t where id = q;

  -- Owner-sent quotation to an approved architect
  select id into cust from customers where mobile = '9840011006';
  sub := 0; tax_t := 0;
  num := app.next_number(a, 'quotation', 'QT');
  insert into quotations (store_id, quotation_number, customer_id, customer_name, customer_mobile,
                          requirements, status, valid_until, subtotal_paise, discount_paise, tax_paise, total_paise)
  values (a, num, cust, 'Meenakshi Sundaram', '9840011006',
          'Bathroom package for a 12-unit project: wash basins, taps and sanitaryware', 'SENT', date '2026-12-20',
          0, 0, 0, 0)
  returning id into q;
  for r in select pv.id vid, pv.sale_price_paise price, pr.gst_rate_bps gst
           from product_variants pv join products pr on pr.id = pv.product_id
           where pv.sku in ('AMB-V049','AMB-V057') loop
    gross := 12 * r.price; tax := round(gross * r.gst / 10000);
    insert into quotation_items (quotation_id, store_id, variant_id, quantity, unit_price_paise, discount_paise, tax_paise, line_total_paise,
                                 gross_paise, taxable_paise, gst_rate_bps)
    values (q, a, r.vid, 12, r.price, 0, tax, gross + tax, gross, gross, r.gst);
    sub := sub + gross; tax_t := tax_t + tax;
  end loop;
  update quotations set subtotal_paise = sub, taxable_paise = sub, tax_paise = tax_t, total_paise = sub + tax_t where id = q;
end $$;

-- ---------------------------------------------------------------------------
-- Suppliers, purchase order with a partial goods receipt, and supplier ledger
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := '11111111-1111-4111-8111-111111111111';
  b constant uuid := '22222222-2222-4222-8222-222222222222';
  s uuid; po uuid; poi1 uuid; poi2 uuid; grn uuid; num text;
  v1 uuid; v2 uuid; total bigint := 0; c1 bigint; c2 bigint;
  owner_a uuid := '00000000-0000-4000-8000-0000000000a2';
begin
  insert into suppliers (store_id, name, contact_person, phone, email, gstin, payment_terms_days)
  values (a, 'Kajaria Ceramics Ltd.', 'Anil Mehta', '011-45452000', 'dealers@kajaria.example', '07AAAAA1234A1Z5', 30)
  returning id into s;
  insert into suppliers (store_id, name, contact_person, phone, payment_terms_days)
  values (a, 'Hindware Supply Co.', 'Ramesh Iyer', '044-42003300', 45);
  insert into suppliers (store_id, name, contact_person, phone, payment_terms_days)
  values (b, 'Coimbatore Sanitary Wholesale', 'Murugan P', '0422-2300400', 30);

  select id, cost_price_paise into v1, c1 from product_variants where sku = 'AMB-V001';
  select id, cost_price_paise into v2, c2 from product_variants where sku = 'AMB-V009';
  insert into supplier_products (supplier_id, store_id, variant_id, supplier_sku) values
    (s, a, v1, 'KJ-STAT-600'), (s, a, v2, 'KJ-PEARL-300');

  num := app.next_number(a, 'po', 'PO');
  insert into purchase_orders (store_id, supplier_id, po_number, status, expected_on, created_by)
  values (a, s, num, 'draft', date '2026-11-20', owner_a) returning id into po;

  insert into purchase_order_items (purchase_order_id, store_id, variant_id, quantity_ordered, unit_cost_paise)
  values (po, a, v1, 100, c1) returning id into poi1;
  insert into purchase_order_items (purchase_order_id, store_id, variant_id, quantity_ordered, unit_cost_paise)
  values (po, a, v2, 80, c2) returning id into poi2;

  total := 100 * c1 + 80 * c2;
  update purchase_orders set total_paise = total, status = 'sent' where id = po;

  -- Partial receipt: 60 of 100 boxes of line 1, 2 of them damaged; line 2 not yet received
  grn := receive_goods(po, jsonb_build_array(
    jsonb_build_object('po_item_id', poi1, 'quantity', 60, 'damaged', 2, 'batch_number', 'ZBM-BT-9001')
  ), 'First truck, partial delivery');

  insert into supplier_invoices (store_id, supplier_id, purchase_order_id, invoice_number, invoice_date, amount_paise)
  values (a, s, po, 'KJ/2026/1184', date '2026-11-18', 60 * c1);
  insert into supplier_payments (store_id, supplier_id, amount_paise, paid_on, method, reference)
  values (a, s, 2000000, date '2026-11-22', 'bank', 'NEFT UTR KJ11840001');
end $$;

-- ---------------------------------------------------------------------------
-- Expenses, support, notifications, QR codes, offers, feature flags
-- ---------------------------------------------------------------------------
insert into expenses (store_id, category, amount_paise, expense_on, paid_from, note, created_by) values
  ('11111111-1111-4111-8111-111111111111', 'Electricity', 1845000, '2026-11-05', 'bank', 'October bill', '00000000-0000-4000-8000-0000000000a2'),
  ('11111111-1111-4111-8111-111111111111', 'Staff welfare', 42000, '2026-11-12', 'cash', 'Tea and water for the team', '00000000-0000-4000-8000-0000000000a2'),
  ('11111111-1111-4111-8111-111111111111', 'Transport', 185000, '2026-11-18', 'bank', 'Delivery van diesel and toll', '00000000-0000-4000-8000-0000000000a4'),
  ('11111111-1111-4111-8111-111111111111', 'Packaging', 96000, '2026-11-20', 'cash', 'Bubble wrap and cartons', '00000000-0000-4000-8000-0000000000a4'),
  ('11111111-1111-4111-8111-111111111111', 'Rent', 6500000, '2026-11-01', 'bank', 'Showroom rent, November', '00000000-0000-4000-8000-0000000000a2'),
  ('22222222-2222-4222-8222-222222222222', 'Cleaning', 35000, '2026-11-15', 'cash', 'Showroom cleaning', '00000000-0000-4000-8000-0000000000a3');

insert into support_tickets (store_id, requester_id, category, priority, status, subject) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a2', 'technical', 'medium', 'in_progress',
   'Cash confirmation screen does not refresh on the counter tablet'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-0000000000a3', 'billing', 'low', 'open',
   'Question about the Growth plan renewal date');

insert into notifications (store_id, recipient_profile_id, type, title, body, link) values
  ('11111111-1111-4111-8111-111111111111', null, 'cash_request', 'Cash payment waiting at the counter',
   'ZBM-000004 for Mohammed Irfan is waiting for cash collection.', '/owner/cash'),
  ('11111111-1111-4111-8111-111111111111', null, 'low_stock', 'Low stock alert',
   'Several items are at or below their reorder level.', '/owner/inventory'),
  ('11111111-1111-4111-8111-111111111111', null, 'quotation_request', 'New quotation request',
   'Suresh Babu requested flooring for a 1,200 sq ft apartment.', '/owner/quotations'),
  ('22222222-2222-4222-8222-222222222222', null, 'subscription_expiry', 'Subscription in grace period',
   'Your plan is in its grace period. Renew before 15 December 2026.', '/owner/settings');

insert into qr_codes (store_id, target_type, target_id, public_url) values
  ('11111111-1111-4111-8111-111111111111', 'showroom', null, 'http://localhost:3000/store/ambattur-central'),
  ('22222222-2222-4222-8222-222222222222', 'showroom', null, 'http://localhost:3000/store/coimbatore-tiles');

insert into qr_codes (store_id, target_type, target_id, public_url)
select p.store_id, 'product', p.id, 'http://localhost:3000/store/ambattur-central/product/' || p.slug
from products p where p.sku = 'AMB-P001';

insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, max_uses) values
  ('11111111-1111-4111-8111-111111111111', 'WELCOME10', 'percent', 1000, 0, 500);
insert into coupons (store_id, code, discount_type, discount_paise, min_order_paise) values
  ('11111111-1111-4111-8111-111111111111', 'FLAT500', 'flat', 50000, 300000);

insert into feature_flags (store_id, feature_key, enabled) values
  ('11111111-1111-4111-8111-111111111111', 'batch_tracking', true),
  ('11111111-1111-4111-8111-111111111111', 'room_visualiser', true),
  ('22222222-2222-4222-8222-222222222222', 'batch_tracking', false);

-- Premium module flags for the seeded subscribed stores (mirrors migration 0032's backfill).
insert into feature_flags (store_id, feature_key, enabled)
select s.id, k.feature_key, true
from (values ('11111111-1111-4111-8111-111111111111'::uuid), ('22222222-2222-4222-8222-222222222222'::uuid)) as s(id)
cross join (values
  ('pos_billing'), ('quotations'), ('room_visualiser'), ('house_project_planner'),
  ('bulk_imports'), ('qr_scan_analytics'), ('tile_batches'), ('purchase_orders'), ('reports')
) as k(feature_key)
on conflict (store_id, feature_key) do nothing;

-- ---------------------------------------------------------------------------
-- Remove development helpers so they never persist in the database
-- ---------------------------------------------------------------------------
drop function public.dev_place_order(uuid, text, text, text, uuid, uuid, jsonb);
drop function public.dev_seed_catalogue(uuid, text, boolean);

commit;
