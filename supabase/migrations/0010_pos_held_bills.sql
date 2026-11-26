-- 0010: point of sale. Held bills persist across sessions and are not sales until placed.
-- Placing a bill re-prices every line from the database, reserves stock and creates the order through the
-- existing reservation, payment and credit functions, in one transaction. Held bills never move stock.

-- Held-bill references come from the shared counter table, so it must accept the 'pos' kind.
alter table store_counters drop constraint store_counters_kind_check;
alter table store_counters add constraint store_counters_kind_check
  check (kind in ('order','invoice','quotation','po','grn','payment','refund','pos'));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table pos_bills (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  bill_reference    text not null,
  status            text not null default 'HELD' check (status in ('HELD','AWAITING_PAYMENT','COMPLETED','CANCELLED','EXPIRED')),
  customer_id       uuid references customers(id) on delete set null,
  note              text check (note is null or length(note) <= 300),
  order_id          uuid references orders(id) on delete set null,
  created_by        uuid references profiles(id) on delete set null,
  completed_by      uuid references profiles(id) on delete set null,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (store_id, bill_reference),
  check ((status in ('AWAITING_PAYMENT','COMPLETED')) = (order_id is not null))
);

create table pos_bill_items (
  id                  uuid primary key default gen_random_uuid(),
  bill_id             uuid not null references pos_bills(id) on delete cascade,
  store_id            uuid not null references stores(id) on delete cascade,
  variant_id          uuid not null references product_variants(id),
  quantity            numeric(12,3) not null check (quantity > 0 and quantity <= 999),
  line_discount_paise bigint not null default 0 check (line_discount_paise >= 0),
  sort_order          integer not null default 0,
  unique (bill_id, variant_id)
);

create index pos_bills_store_status_idx on pos_bills (store_id, status);

alter table pos_bills enable row level security;
alter table pos_bill_items enable row level security;

create policy pos_bills_member_read on pos_bills for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
create policy pos_bill_items_member_read on pos_bill_items for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Pricing: the single source of totals for a held bill. Recomputed at every use.
-- ---------------------------------------------------------------------------

create or replace function app.price_pos_bill(p_bill uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_item record;
  v_lines jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_gross bigint;
  v_line_taxable bigint;
  v_line_tax bigint;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_taxable bigint := 0;
  v_tax bigint := 0;
begin
  select * into v_bill from pos_bills where id = p_bill;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;

  for v_item in
    select pi.variant_id, pi.quantity, pi.line_discount_paise,
           pv.sku, pv.label, pv.sale_price_paise, pv.cost_price_paise, pv.is_active,
           pr.name as product_name, pr.hsn_code, pr.gst_rate_bps, pr.status as product_status
    from pos_bill_items pi
    join product_variants pv on pv.id = pi.variant_id
    join products pr on pr.id = pv.product_id
    where pi.bill_id = p_bill
    order by pi.sort_order, pv.sku
  loop
    v_count := v_count + 1;
    if not v_item.is_active or v_item.product_status <> 'active' then
      raise exception 'product % is no longer available for sale', v_item.sku using errcode = 'P0001';
    end if;
    v_gross := round(v_item.quantity * v_item.sale_price_paise)::bigint;
    if v_item.line_discount_paise > v_gross then
      raise exception 'discount on % is larger than the line amount', v_item.sku using errcode = 'P0001';
    end if;
    v_line_taxable := v_gross - v_item.line_discount_paise;
    v_line_tax := round(v_line_taxable * v_item.gst_rate_bps / 10000.0)::bigint;

    v_subtotal := v_subtotal + v_gross;
    v_discount := v_discount + v_item.line_discount_paise;
    v_taxable := v_taxable + v_line_taxable;
    v_tax := v_tax + v_line_tax;

    v_lines := v_lines || jsonb_build_object(
      'variant_id', v_item.variant_id,
      'sku', v_item.sku,
      'product_name', v_item.product_name,
      'variant_label', v_item.label,
      'hsn_code', v_item.hsn_code,
      'quantity', v_item.quantity,
      'stock_units', ceil(v_item.quantity)::bigint,
      'unit_price_paise', v_item.sale_price_paise,
      'cost_price_paise', v_item.cost_price_paise,
      'gross_paise', v_gross,
      'discount_paise', v_item.line_discount_paise,
      'gst_rate_bps', v_item.gst_rate_bps,
      'taxable_paise', v_line_taxable,
      'tax_paise', v_line_tax,
      'line_total_paise', v_line_taxable + v_line_tax);
  end loop;

  return jsonb_build_object(
    'lines', v_lines,
    'line_count', v_count,
    'subtotal_paise', v_subtotal,
    'discount_paise', v_discount,
    'taxable_paise', v_taxable,
    'tax_paise', v_tax,
    'total_paise', v_taxable + v_tax);
end $$;

-- ---------------------------------------------------------------------------
-- Holding and editing a bill (no stock effect, no revenue)
-- ---------------------------------------------------------------------------

create or replace function pos_save_bill(
  p_bill uuid, p_store uuid, p_customer uuid, p_items jsonb, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_bill uuid;
  v_status text;
  v_item jsonb;
  v_variant uuid;
  v_qty numeric;
  v_disc bigint;
  v_order integer := 0;
begin
  perform app.assert_store_access(p_store, array['owner','manager','staff']);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a bill needs at least one item' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'a bill can hold at most 100 items' using errcode = 'P0001'; end if;
  if p_customer is not null and not exists (select 1 from customers where id = p_customer and store_id = p_store) then
    raise exception 'customer does not belong to this store' using errcode = 'P0001';
  end if;

  if p_bill is null then
    insert into pos_bills (store_id, bill_reference, status, customer_id, note, created_by)
    values (p_store, app.next_number(p_store, 'pos', 'POS'), 'HELD', p_customer, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    returning id into v_bill;
  else
    select status into v_status from pos_bills where id = p_bill and store_id = p_store for update;
    if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
    if v_status <> 'HELD' then raise exception 'only held bills can be edited (this bill is %)', v_status using errcode = 'P0001'; end if;
    v_bill := p_bill;
    update pos_bills set customer_id = p_customer, note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
    where id = v_bill;
    delete from pos_bill_items where bill_id = v_bill;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_order := v_order + 1;
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_disc := coalesce((v_item ->> 'line_discount_paise')::bigint, 0);
    if not exists (select 1 from product_variants where id = v_variant and store_id = p_store and is_active) then
      raise exception 'variant is not an active product of this store' using errcode = 'P0001';
    end if;
    if v_qty <= 0 or v_qty > 999 then raise exception 'quantity must be greater than 0 and at most 999' using errcode = 'P0001'; end if;
    if v_disc < 0 then raise exception 'discount cannot be negative' using errcode = 'P0001'; end if;
    insert into pos_bill_items (bill_id, store_id, variant_id, quantity, line_discount_paise, sort_order)
    values (v_bill, p_store, v_variant, v_qty, v_disc, v_order);
  end loop;

  perform app.audit(p_store, 'pos.saved', 'pos_bills', v_bill, null, jsonb_build_object('items', v_order));
  return v_bill;
end $$;

create or replace function pos_quote_bill(p_bill uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_store uuid;
begin
  select store_id into v_store from pos_bills where id = p_bill;
  if v_store is null then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager','staff']);
  return app.price_pos_bill(p_bill);
end $$;

create or replace function pos_cancel_bill(p_bill uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_bill.store_id, array['owner','manager','staff']);
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'give a reason of at least 3 characters' using errcode = 'P0001'; end if;
  if v_bill.status <> 'HELD' then
    raise exception 'this bill is %; cancel the order instead', v_bill.status using errcode = 'P0001';
  end if;
  update pos_bills set status = 'CANCELLED', cancelled_at = now(), cancel_reason = p_reason, updated_at = now() where id = p_bill;
  perform app.audit(v_bill.store_id, 'pos.cancelled', 'pos_bills', p_bill, null, jsonb_build_object('reason', p_reason));
  return 'CANCELLED';
end $$;

-- ---------------------------------------------------------------------------
-- Placing a bill. Server-only: called by the POS server action with the service role.
-- Idempotent: a bill that is already completed returns its order and does not create another.
-- ---------------------------------------------------------------------------

create or replace function pos_place_bill(
  p_bill uuid, p_actor uuid, p_method text, p_provider_order_id text default null, p_expires_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_quote jsonb;
  v_line jsonb;
  v_order uuid;
  v_number text;
  v_prefix text;
  v_total bigint;
  v_cust_name text := 'Walk-in customer';
  v_cust_mobile text;
  v_cust_email text;
  v_invoice text;
  v_due date := current_date + 30;
begin
  if not app.is_server() then raise exception 'POS placement is server-only' using errcode = '42501'; end if;
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from store_owners so
    where so.store_id = v_bill.store_id and so.profile_id = p_actor and so.is_active and so.role in ('owner','manager')
  ) then
    raise exception 'actor is not a member of this store' using errcode = '42501';
  end if;

  if v_bill.status in ('COMPLETED','AWAITING_PAYMENT') then
    return jsonb_build_object('order_id', v_bill.order_id, 'replayed', true, 'status', v_bill.status);
  end if;
  if v_bill.status <> 'HELD' then raise exception 'bill is %, it cannot be placed', v_bill.status using errcode = 'P0001'; end if;
  if p_method not in ('cash','online','credit') then raise exception 'unknown payment method' using errcode = 'P0001'; end if;
  if p_method = 'online' and coalesce(p_provider_order_id, '') = '' then
    raise exception 'an online payment needs a gateway order' using errcode = 'P0001';
  end if;
  if p_method = 'credit' and v_bill.customer_id is null then
    raise exception 'credit sales need a customer' using errcode = 'P0001';
  end if;

  v_quote := app.price_pos_bill(p_bill);
  if (v_quote ->> 'line_count')::integer = 0 then raise exception 'the bill has no items' using errcode = 'P0001'; end if;
  v_total := (v_quote ->> 'total_paise')::bigint;

  if v_bill.customer_id is not null then
    select full_name, mobile, email into v_cust_name, v_cust_mobile, v_cust_email from customers where id = v_bill.customer_id;
  end if;
  select order_prefix, invoice_prefix into v_prefix, v_invoice from store_settings where store_id = v_bill.store_id;
  v_number := app.next_number(v_bill.store_id, 'order', v_prefix);

  insert into orders (store_id, order_number, channel, customer_id, customer_name, customer_mobile, customer_email,
                      fulfilment, payment_method, payment_status, order_status,
                      subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise)
  values (v_bill.store_id, v_number, 'pos', v_bill.customer_id,
          v_cust_name, v_cust_mobile, v_cust_email,
          'pickup', p_method, 'PENDING', 'PLACED',
          (v_quote ->> 'subtotal_paise')::bigint, (v_quote ->> 'discount_paise')::bigint,
          (v_quote ->> 'taxable_paise')::bigint, (v_quote ->> 'tax_paise')::bigint, 0, v_total)
  returning id into v_order;

  for v_line in select * from jsonb_array_elements(v_quote -> 'lines') loop
    insert into order_items (order_id, store_id, variant_id, product_name_snapshot, variant_label_snapshot, sku_snapshot,
                             hsn_code_snapshot, quantity, stock_units, cost_price_paise_snapshot, unit_price_paise,
                             discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise)
    values (v_order, v_bill.store_id, (v_line ->> 'variant_id')::uuid, v_line ->> 'product_name', v_line ->> 'variant_label',
            v_line ->> 'sku', v_line ->> 'hsn_code', (v_line ->> 'quantity')::numeric, (v_line ->> 'stock_units')::bigint,
            (v_line ->> 'cost_price_paise')::bigint, (v_line ->> 'unit_price_paise')::bigint,
            (v_line ->> 'discount_paise')::bigint, (v_line ->> 'gst_rate_bps')::integer,
            (v_line ->> 'taxable_paise')::bigint, (v_line ->> 'tax_paise')::bigint, (v_line ->> 'line_total_paise')::bigint);
  end loop;

  -- Stock is reserved first; a shortfall aborts the whole bill, leaving it held.
  perform reserve_order_stock(v_order);

  if p_method = 'cash' then
    perform create_payment_attempt(v_order, 'cash', 'cash', 'cash_' || v_order::text, v_total, null, null);
    perform confirm_cash_payment(v_order, v_total, 'POS cash sale', p_actor);
  elsif p_method = 'online' then
    perform create_payment_attempt(v_order, 'online', 'razorpay', p_provider_order_id, v_total,
      coalesce(p_expires_at, now() + interval '15 minutes'), null);
  else
    perform record_credit_entry(v_bill.customer_id, 'sale', v_total, v_due, 'POS credit sale ' || v_number);
    perform consume_order_stock(v_order);
    perform app.set_order_status(v_order, 'CONFIRMED', 'POS credit sale');
  end if;

  -- Cash and credit sales are complete now and get an invoice. Online sales get one once payment settles.
  if p_method <> 'online' then
    insert into invoices (store_id, order_id, invoice_number, invoice_date, taxable_paise, tax_paise, total_paise)
    values (v_bill.store_id, v_order, app.next_number(v_bill.store_id, 'invoice', coalesce(v_invoice, 'INV')),
            current_date, (v_quote ->> 'taxable_paise')::bigint, (v_quote ->> 'tax_paise')::bigint, v_total);
  end if;

  update pos_bills set
      status = case when p_method = 'online' then 'AWAITING_PAYMENT' else 'COMPLETED' end,
      order_id = v_order,
      completed_by = p_actor,
      completed_at = case when p_method = 'online' then null else now() end,
      updated_at = now()
  where id = p_bill;

  perform app.audit(v_bill.store_id, 'pos.placed', 'orders', v_order, null,
    jsonb_build_object('bill', v_bill.bill_reference, 'method', p_method, 'total_paise', v_total));
  return jsonb_build_object('order_id', v_order, 'order_number', v_number, 'total_paise', v_total,
                            'method', p_method, 'replayed', false, 'status', case when p_method = 'online' then 'AWAITING_PAYMENT' else 'COMPLETED' end);
end $$;

-- Moves an online POS bill to COMPLETED once its order has been paid. Safe to call repeatedly.
create or replace function pos_sync_bill(p_bill uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_paid boolean;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_bill.store_id, array['owner','manager','staff']);
  if v_bill.status <> 'AWAITING_PAYMENT' then return v_bill.status; end if;
  select payment_status = 'PAID' into v_paid from orders where id = v_bill.order_id;
  if v_paid then
    update pos_bills set status = 'COMPLETED', completed_at = now(), updated_at = now() where id = p_bill;
    return 'COMPLETED';
  end if;
  return 'AWAITING_PAYMENT';
end $$;

-- Held bills older than 7 days are expired. Expired bills never reserve stock or count as sales.
create or replace function expire_pos_bills() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  update pos_bills set status = 'EXPIRED', updated_at = now()
  where status = 'HELD' and created_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke insert, update, delete on pos_bills, pos_bill_items from authenticated, anon;

revoke execute on function
  app.price_pos_bill(uuid), pos_save_bill(uuid, uuid, uuid, jsonb, text), pos_quote_bill(uuid),
  pos_cancel_bill(uuid, text), pos_place_bill(uuid, uuid, text, text, timestamptz), pos_sync_bill(uuid),
  expire_pos_bills()
from public, anon;

grant execute on function
  pos_save_bill(uuid, uuid, uuid, jsonb, text), pos_quote_bill(uuid), pos_cancel_bill(uuid, text), pos_sync_bill(uuid)
to authenticated;

-- Placement and expiry are server-only; they are not granted to authenticated users.
revoke execute on function pos_place_bill(uuid, uuid, text, text, timestamptz), expire_pos_bills() from authenticated;
