-- 0019: quotation workflow for owners and guests.
--
-- Lifecycle: REQUESTED (guest enquiry) -> DRAFT (priced by the owner) -> SENT (share link issued) -> ACCEPTED or REJECTED
-- (by the customer) -> CONVERTED (order created). SENT, EXPIRED and REJECTED can be revised back to DRAFT; expiry is set
-- by expire_quotations(). CANCELLED is terminal. CONVERTED is terminal and a quotation converts at most once.
--
-- Prices and totals are frozen once a quotation is SENT. Conversion re-derives every line and total from the stored
-- rows, refuses a quotation whose stored figures no longer reconcile, refuses an expired quotation, and reserves stock
-- through reserve_order_stock inside the same transaction. Any failure rolls the whole conversion back.
-- Server-only writes take the acting user explicitly and check their store role, as pos_place_bill does.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
update quotations set status = 'DRAFT' where status = 'UNDER_REVIEW';

alter table quotations drop constraint if exists quotations_status_check;
alter table quotations add constraint quotations_status_check check (status in
  ('REQUESTED','DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED','CONVERTED'));

alter table quotations
  add column if not exists source text not null default 'owner' check (source in ('owner','guest')),
  add column if not exists created_by uuid references profiles(id),
  add column if not exists project_name text check (project_name is null or length(project_name) <= 160),
  add column if not exists delivery_address text check (delivery_address is null or length(delivery_address) <= 500),
  add column if not exists taxable_paise bigint not null default 0 check (taxable_paise >= 0),
  add column if not exists delivery_paise bigint not null default 0 check (delivery_paise >= 0),
  add column if not exists terms text check (terms is null or length(terms) <= 4000),
  add column if not exists revision integer not null default 1 check (revision >= 1),
  add column if not exists share_token_hash text check (share_token_hash is null or length(share_token_hash) = 64),
  add column if not exists sent_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists response_note text check (response_note is null or length(response_note) <= 500),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  add column if not exists converted_order_id uuid references orders(id),
  add column if not exists converted_at timestamptz;

alter table quotations drop constraint if exists quotations_check;
alter table quotations add constraint quotations_amounts_check check (
  taxable_paise = subtotal_paise - discount_paise
  and total_paise = taxable_paise + tax_paise + delivery_paise);

create unique index if not exists quotations_share_token_idx on quotations(share_token_hash) where share_token_hash is not null;
create index if not exists quotations_store_status_idx on quotations(store_id, status, created_at desc);

alter table quotation_items
  add column if not exists sort_order integer not null default 0,
  add column if not exists product_name_snapshot text,
  add column if not exists variant_label_snapshot text,
  add column if not exists sku_snapshot text,
  add column if not exists hsn_code_snapshot text,
  add column if not exists gst_rate_bps integer not null default 0 check (gst_rate_bps between 0 and 2800),
  add column if not exists gross_paise bigint not null default 0 check (gross_paise >= 0),
  add column if not exists taxable_paise bigint not null default 0 check (taxable_paise >= 0);

alter table quotation_items drop constraint if exists quotation_items_amounts_check;
alter table quotation_items add constraint quotation_items_amounts_check check (
  discount_paise <= gross_paise
  and taxable_paise = gross_paise - discount_paise
  and line_total_paise = taxable_paise + tax_paise);

create unique index if not exists quotation_items_one_variant_idx on quotation_items(quotation_id, variant_id);

alter table orders add column if not exists quotation_id uuid references quotations(id);
create unique index if not exists orders_one_per_quotation_idx on orders(quotation_id) where quotation_id is not null;

-- Document downloads are recorded here (kind invoice or quotation). Owners, guests and share links all call it.
-- Stores no document content and no share token.

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create or replace function app.actor_store_role(p_store uuid, p_actor uuid) returns text
language sql stable security definer set search_path = public as $$
  select so.role from store_owners so
  where so.store_id = p_store and so.profile_id = p_actor and so.is_active
  limit 1
$$;

-- Authority for a customer action: the guest session that owns the quotation, or the share-link hash.
create or replace function app.quotation_customer_match(
  p_quotation quotations, p_guest_session uuid, p_token_hash text
) returns boolean
language sql immutable as $$
  select (p_guest_session is not null and p_quotation.guest_session_id = p_guest_session)
      or (p_token_hash is not null and p_quotation.share_token_hash is not null and p_quotation.share_token_hash = p_token_hash)
$$;

-- Line figures are derived the same way for saving, converting and checking.
create or replace function app.quotation_line_figures(p_quantity numeric, p_unit bigint, p_discount bigint, p_rate integer)
returns table (gross_paise bigint, taxable_paise bigint, tax_paise bigint)
language sql immutable as $$
  select g.gross, g.gross - p_discount,
         round((g.gross - p_discount)::numeric * p_rate / 10000.0)::bigint
  from (select round(p_quantity * p_unit)::bigint as gross) g
$$;

-- ---------------------------------------------------------------------------
-- 3. Owner and manager writes (server-only; the acting user is named and checked)
-- ---------------------------------------------------------------------------

-- Creates or re-prices a quotation in REQUESTED or DRAFT. Staff may set quantities and catalogue prices. Owners and
-- managers may also change unit prices, line discounts and the delivery charge.
create or replace function public.quotation_save(p_store uuid, p_actor uuid, p_quotation uuid, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_q quotations%rowtype;
  v_id uuid;
  v_name text;
  v_mobile text;
  v_email text;
  v_customer_id uuid;
  v_line jsonb;
  v_var record;
  v_qty numeric;
  v_unit bigint;
  v_disc bigint;
  v_fig record;
  v_sub bigint := 0;
  v_dsc bigint := 0;
  v_tax bigint := 0;
  v_taxable bigint := 0;
  v_delivery bigint := 0;
  v_valid date;
  v_seen uuid[] := '{}';
  v_sort integer := 0;
  v_number text;
  v_user_owned boolean;
begin
  if not app.is_server() then raise exception 'quotation writes are server-only' using errcode = '42501'; end if;
  v_role := app.actor_store_role(p_store, p_actor);
  if v_role is null then raise exception 'actor is not a member of this store' using errcode = '42501'; end if;
  v_user_owned := v_role in ('owner','manager');

  v_name := btrim(coalesce(p_payload ->> 'customer_name', ''));
  if length(v_name) < 1 or length(v_name) > 160 then raise exception 'customer name is required (up to 160 characters)' using errcode = 'P0001'; end if;
  v_mobile := nullif(btrim(coalesce(p_payload ->> 'customer_mobile', '')), '');
  if v_mobile is not null and v_mobile !~ '^[0-9]{10}$' then raise exception 'mobile must be 10 digits' using errcode = 'P0001'; end if;
  v_email := nullif(btrim(coalesce(p_payload ->> 'customer_email', '')), '');

  if nullif(p_payload ->> 'customer_id', '') is not null then
    select id, full_name, mobile, email into v_customer_id, v_name, v_mobile, v_email
    from customers where id = (p_payload ->> 'customer_id')::uuid and store_id = p_store;
    if not found then raise exception 'customer not found in this store' using errcode = 'P0002'; end if;
  end if;

  v_valid := nullif(p_payload ->> 'valid_until', '')::date;
  if v_valid is not null and v_valid < current_date then raise exception 'validity date is in the past' using errcode = 'P0001'; end if;

  if p_payload ? 'delivery_paise' and coalesce((p_payload ->> 'delivery_paise')::bigint, 0) <> 0 and not v_user_owned then
    raise exception 'only owners and managers can set a delivery charge' using errcode = '42501';
  end if;
  v_delivery := coalesce(nullif(p_payload ->> 'delivery_paise', '')::bigint, 0);
  if v_delivery < 0 or v_delivery > 100000000 then raise exception 'delivery charge is out of range' using errcode = 'P0001'; end if;

  if p_quotation is null then
    v_number := app.next_number(p_store, 'quotation', 'QT');
    insert into quotations (store_id, quotation_number, source, status, customer_id, customer_name, customer_mobile, customer_email,
                            created_by, valid_until)
    values (p_store, v_number, 'owner', 'DRAFT', v_customer_id, v_name, v_mobile, v_email, p_actor, v_valid)
    returning id into v_id;
  else
    select * into v_q from quotations where id = p_quotation for update;
    if not found or v_q.store_id <> p_store then raise exception 'quotation not found' using errcode = 'P0002'; end if;
    if v_q.status not in ('REQUESTED','DRAFT') then
      raise exception 'a % quotation cannot be edited; revise it first', v_q.status using errcode = 'P0001';
    end if;
    v_id := v_q.id;
    update quotations set customer_id = v_customer_id, customer_name = v_name, customer_mobile = v_mobile, customer_email = v_email,
                          valid_until = v_valid, updated_at = now()
    where id = v_id;
  end if;

  if jsonb_typeof(p_payload -> 'lines') is distinct from 'array' or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'add at least one product' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_payload -> 'lines') > 200 then raise exception 'a quotation can have at most 200 lines' using errcode = 'P0001'; end if;

  delete from quotation_items where quotation_id = v_id;

  for v_line in select value from jsonb_array_elements(p_payload -> 'lines') loop
    v_sort := v_sort + 1;
    select pv.id, pv.sku, pv.label, pv.sale_price_paise, pv.is_active, pv.store_id,
           pr.name, pr.hsn_code, pr.gst_rate_bps, pr.status as product_status
      into v_var
      from product_variants pv join products pr on pr.id = pv.product_id
     where pv.id = (v_line ->> 'variant_id')::uuid;
    if not found or v_var.store_id <> p_store then raise exception 'a product on this quotation was not found' using errcode = 'P0002'; end if;
    if not v_var.is_active or v_var.product_status <> 'active' then
      raise exception 'product % is not available for sale', v_var.sku using errcode = 'P0001';
    end if;
    if v_var.id = any(v_seen) then raise exception 'product % appears twice; combine the quantities', v_var.sku using errcode = 'P0001'; end if;
    v_seen := v_seen || v_var.id;

    v_qty := (v_line ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 99999 or v_qty <> round(v_qty, 3) then
      raise exception 'quantity for % must be above 0 and up to 99999 (3 decimals)', v_var.sku using errcode = 'P0001';
    end if;

    v_unit := coalesce(nullif(v_line ->> 'unit_price_paise', '')::bigint, v_var.sale_price_paise);
    if v_unit < 0 then raise exception 'price for % cannot be negative', v_var.sku using errcode = 'P0001'; end if;
    if v_unit <> v_var.sale_price_paise and not v_user_owned then
      raise exception 'only owners and managers can change a quoted price' using errcode = '42501';
    end if;

    v_disc := coalesce(nullif(v_line ->> 'discount_paise', '')::bigint, 0);
    if v_disc < 0 then raise exception 'discount cannot be negative' using errcode = 'P0001'; end if;
    if v_disc > 0 and not v_user_owned then raise exception 'only owners and managers can apply a discount' using errcode = '42501'; end if;

    select * into v_fig from app.quotation_line_figures(v_qty, v_unit, v_disc, v_var.gst_rate_bps);
    if v_disc > v_fig.gross_paise then raise exception 'discount on % is larger than the line amount', v_var.sku using errcode = 'P0001'; end if;

    insert into quotation_items (quotation_id, store_id, variant_id, quantity, unit_price_paise, discount_paise, tax_paise,
                                 line_total_paise, sort_order, product_name_snapshot, variant_label_snapshot, sku_snapshot,
                                 hsn_code_snapshot, gst_rate_bps, gross_paise, taxable_paise)
    values (v_id, p_store, v_var.id, v_qty, v_unit, v_disc, v_fig.tax_paise, v_fig.taxable_paise + v_fig.tax_paise, v_sort,
            v_var.name, v_var.label, v_var.sku, v_var.hsn_code, v_var.gst_rate_bps, v_fig.gross_paise, v_fig.taxable_paise);

    v_sub := v_sub + v_fig.gross_paise;
    v_dsc := v_dsc + v_disc;
    v_taxable := v_taxable + v_fig.taxable_paise;
    v_tax := v_tax + v_fig.tax_paise;
  end loop;

  update quotations set
      project_name = nullif(btrim(coalesce(p_payload ->> 'project_name', '')), ''),
      requirements = nullif(btrim(coalesce(p_payload ->> 'requirements', '')), ''),
      delivery_expectation = nullif(btrim(coalesce(p_payload ->> 'delivery_expectation', '')), ''),
      delivery_address = nullif(btrim(coalesce(p_payload ->> 'delivery_address', '')), ''),
      terms = nullif(btrim(coalesce(p_payload ->> 'terms', '')), ''),
      delivery_paise = v_delivery,
      subtotal_paise = v_sub,
      discount_paise = v_dsc,
      taxable_paise = v_taxable,
      tax_paise = v_tax,
      total_paise = v_taxable + v_tax + v_delivery,
      status = case when status = 'REQUESTED' then 'DRAFT' else status end,
      updated_at = now()
  where id = v_id;

  perform app.audit(p_store, 'quotation.saved', 'quotations', v_id, null,
    jsonb_build_object('actor', p_actor, 'lines', v_sort, 'total_paise', v_taxable + v_tax + v_delivery));
  return v_id;
end $$;

-- DRAFT -> SENT. Needs at least one priced line, a payable total, and a validity date that has not passed.
create or replace function public.quotation_send(p_store uuid, p_actor uuid, p_quotation uuid, p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_q quotations%rowtype;
begin
  if not app.is_server() then raise exception 'quotation writes are server-only' using errcode = '42501'; end if;
  if coalesce(app.actor_store_role(p_store, p_actor), '') not in ('owner','manager') then
    raise exception 'only owners and managers can send a quotation' using errcode = '42501';
  end if;
  if length(coalesce(p_token_hash, '')) <> 64 then raise exception 'invalid share token' using errcode = 'P0001'; end if;
  select * into v_q from quotations where id = p_quotation for update;
  if not found or v_q.store_id <> p_store then raise exception 'quotation not found' using errcode = 'P0002'; end if;
  if v_q.status <> 'DRAFT' then raise exception 'only a draft can be sent (this one is %)', v_q.status using errcode = 'P0001'; end if;
  if v_q.valid_until is null or v_q.valid_until < current_date then
    raise exception 'set a validity date from today onwards before sending' using errcode = 'P0001';
  end if;
  if v_q.total_paise <= 0 then raise exception 'the quotation total must be above zero' using errcode = 'P0001'; end if;
  if not exists (select 1 from quotation_items where quotation_id = v_q.id) then
    raise exception 'add at least one product before sending' using errcode = 'P0001';
  end if;

  update quotations set status = 'SENT', sent_at = now(), share_token_hash = p_token_hash, updated_at = now()
  where id = v_q.id;
  perform app.audit(p_store, 'quotation.sent', 'quotations', v_q.id, null,
    jsonb_build_object('actor', p_actor, 'revision', v_q.revision, 'valid_until', v_q.valid_until, 'total_paise', v_q.total_paise));
  return jsonb_build_object('status', 'SENT', 'valid_until', v_q.valid_until, 'revision', v_q.revision);
end $$;

-- Issues a new share link for a SENT quotation. The old link stops working.
create or replace function public.quotation_rotate_share(p_store uuid, p_actor uuid, p_quotation uuid, p_token_hash text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_q quotations%rowtype;
begin
  if not app.is_server() then raise exception 'quotation writes are server-only' using errcode = '42501'; end if;
  if coalesce(app.actor_store_role(p_store, p_actor), '') not in ('owner','manager') then
    raise exception 'only owners and managers can share a quotation' using errcode = '42501';
  end if;
  if length(coalesce(p_token_hash, '')) <> 64 then raise exception 'invalid share token' using errcode = 'P0001'; end if;
  select * into v_q from quotations where id = p_quotation for update;
  if not found or v_q.store_id <> p_store then raise exception 'quotation not found' using errcode = 'P0002'; end if;
  if v_q.status <> 'SENT' then raise exception 'only a sent quotation has a share link (this one is %)', v_q.status using errcode = 'P0001'; end if;
  update quotations set share_token_hash = p_token_hash, updated_at = now() where id = v_q.id;
  perform app.audit(p_store, 'quotation.share_rotated', 'quotations', v_q.id, null, jsonb_build_object('actor', p_actor));
  return 'SENT';
end $$;

-- SENT, EXPIRED or REJECTED -> DRAFT with the next revision. The share link is withdrawn until the quotation is sent again.
create or replace function public.quotation_revise(p_store uuid, p_actor uuid, p_quotation uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_q quotations%rowtype;
begin
  if not app.is_server() then raise exception 'quotation writes are server-only' using errcode = '42501'; end if;
  if coalesce(app.actor_store_role(p_store, p_actor), '') not in ('owner','manager') then
    raise exception 'only owners and managers can revise a quotation' using errcode = '42501';
  end if;
  select * into v_q from quotations where id = p_quotation for update;
  if not found or v_q.store_id <> p_store then raise exception 'quotation not found' using errcode = 'P0002'; end if;
  if v_q.status not in ('SENT','EXPIRED','REJECTED') then
    raise exception 'a % quotation cannot be revised', v_q.status using errcode = 'P0001';
  end if;
  update quotations set status = 'DRAFT', revision = revision + 1, share_token_hash = null, sent_at = null,
                        responded_at = null, response_note = null, updated_at = now()
  where id = v_q.id;
  perform app.audit(p_store, 'quotation.revised', 'quotations', v_q.id, null,
    jsonb_build_object('actor', p_actor, 'from', v_q.status, 'revision', v_q.revision + 1));
  return v_q.revision + 1;
end $$;

create or replace function public.quotation_cancel(p_store uuid, p_actor uuid, p_quotation uuid, p_reason text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_q quotations%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not app.is_server() then raise exception 'quotation writes are server-only' using errcode = '42501'; end if;
  if coalesce(app.actor_store_role(p_store, p_actor), '') not in ('owner','manager') then
    raise exception 'only owners and managers can cancel a quotation' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'give a reason for cancelling (at least 3 characters)' using errcode = 'P0001'; end if;
  select * into v_q from quotations where id = p_quotation for update;
  if not found or v_q.store_id <> p_store then raise exception 'quotation not found' using errcode = 'P0002'; end if;
  if v_q.status not in ('REQUESTED','DRAFT','SENT','EXPIRED','REJECTED') then
    raise exception 'a % quotation cannot be cancelled', v_q.status using errcode = 'P0001';
  end if;
  update quotations set status = 'CANCELLED', cancelled_at = now(), cancel_reason = left(v_reason, 300),
                        share_token_hash = null, updated_at = now()
  where id = v_q.id;
  perform app.audit(p_store, 'quotation.cancelled', 'quotations', v_q.id, null,
    jsonb_build_object('actor', p_actor, 'from', v_q.status));
  return 'CANCELLED';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Guest actions
-- ---------------------------------------------------------------------------

-- A guest enquiry from the cart or from selected products. Lines carry quantities only; the owner prices the quotation.
create or replace function public.quotation_guest_request(p_store uuid, p_guest_session uuid, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_payload ->> 'customer_name', ''));
  v_mobile text := btrim(coalesce(p_payload ->> 'customer_mobile', ''));
  v_email text := nullif(btrim(coalesce(p_payload ->> 'customer_email', '')), '');
  v_open integer;
  v_id uuid;
  v_number text;
  v_line jsonb;
  v_var record;
  v_qty numeric;
  v_sort integer := 0;
  v_seen uuid[] := '{}';
begin
  if not app.is_server() then raise exception 'guest requests are server-only' using errcode = '42501'; end if;
  if not exists (select 1 from guest_sessions where id = p_guest_session and store_id = p_store and expires_at > now()) then
    raise exception 'guest session is not valid for this store' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 160 then raise exception 'enter your name' using errcode = 'P0001'; end if;
  if v_mobile !~ '^[0-9]{10}$' then raise exception 'enter a 10-digit mobile number' using errcode = 'P0001'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'enter a valid email address' using errcode = 'P0001'; end if;
  if length(coalesce(p_payload ->> 'requirements', '')) > 2000 or length(coalesce(p_payload ->> 'project_name', '')) > 160 then
    raise exception 'project details are too long' using errcode = 'P0001';
  end if;

  select count(*) into v_open from quotations
  where guest_session_id = p_guest_session and status = 'REQUESTED';
  if v_open >= 5 then raise exception 'you already have 5 open quotation requests' using errcode = 'P0001'; end if;

  if jsonb_typeof(p_payload -> 'lines') is distinct from 'array' or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'choose at least one product' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_payload -> 'lines') > 50 then raise exception 'a request can have at most 50 products' using errcode = 'P0001'; end if;

  v_number := app.next_number(p_store, 'quotation', 'QT');
  insert into quotations (store_id, quotation_number, source, status, guest_session_id, customer_name, customer_mobile,
                          customer_email, project_name, requirements, delivery_address, delivery_expectation)
  values (p_store, v_number, 'guest', 'REQUESTED', p_guest_session, v_name, v_mobile, v_email,
          nullif(btrim(coalesce(p_payload ->> 'project_name', '')), ''),
          nullif(btrim(coalesce(p_payload ->> 'requirements', '')), ''),
          nullif(btrim(coalesce(p_payload ->> 'delivery_address', '')), ''),
          nullif(btrim(coalesce(p_payload ->> 'delivery_expectation', '')), ''))
  returning id into v_id;

  for v_line in select value from jsonb_array_elements(p_payload -> 'lines') loop
    select pv.id, pv.sku, pv.label, pv.is_active, pv.store_id, pr.name, pr.hsn_code, pr.gst_rate_bps, pr.status as product_status
      into v_var
      from product_variants pv join products pr on pr.id = pv.product_id
     where pv.id = (v_line ->> 'variant_id')::uuid;
    if not found or v_var.store_id <> p_store or not v_var.is_active or v_var.product_status <> 'active' then
      raise exception 'one of the products is not available' using errcode = 'P0001';
    end if;
    if v_var.id = any(v_seen) then raise exception 'a product appears twice' using errcode = 'P0001'; end if;
    v_seen := v_seen || v_var.id;
    v_qty := (v_line ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 99999 or v_qty <> round(v_qty, 3) then
      raise exception 'quantities must be above 0 and up to 99999' using errcode = 'P0001';
    end if;
    v_sort := v_sort + 1;
    insert into quotation_items (quotation_id, store_id, variant_id, quantity, unit_price_paise, discount_paise, tax_paise,
                                 line_total_paise, sort_order, product_name_snapshot, variant_label_snapshot, sku_snapshot,
                                 hsn_code_snapshot, gst_rate_bps, gross_paise, taxable_paise)
    values (v_id, p_store, v_var.id, v_qty, 0, 0, 0, 0, v_sort, v_var.name, v_var.label, v_var.sku, v_var.hsn_code,
            v_var.gst_rate_bps, 0, 0);
  end loop;

  perform app.audit(p_store, 'quotation.requested', 'quotations', v_id, null, jsonb_build_object('lines', v_sort));
  return v_id;
end $$;

create or replace function public.quotation_guest_withdraw(p_quotation uuid, p_guest_session uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_q quotations%rowtype;
begin
  if not app.is_server() then raise exception 'guest actions are server-only' using errcode = '42501'; end if;
  select * into v_q from quotations where id = p_quotation for update;
  if not found or v_q.guest_session_id is distinct from p_guest_session then raise exception 'quotation not found' using errcode = 'P0002'; end if;
  if v_q.status <> 'REQUESTED' then raise exception 'only an unanswered request can be withdrawn' using errcode = 'P0001'; end if;
  update quotations set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Withdrawn by the customer', updated_at = now()
  where id = v_q.id;
  perform app.audit(v_q.store_id, 'quotation.withdrawn', 'quotations', v_q.id, null, null);
  return 'CANCELLED';
end $$;

-- Customer accept or reject of a SENT quotation. Authority: the owning guest session, or the share-link hash.
create or replace function public.quotation_respond(
  p_quotation uuid, p_decision text, p_note text, p_guest_session uuid, p_token_hash text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_q quotations%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app.is_server() then raise exception 'customer actions are server-only' using errcode = '42501'; end if;
  if p_decision not in ('accept','reject') then raise exception 'unknown decision' using errcode = 'P0001'; end if;
  select * into v_q from quotations where id = p_quotation for update;
  if not found or not app.quotation_customer_match(v_q, p_guest_session, p_token_hash) then
    raise exception 'quotation not found' using errcode = 'P0002';
  end if;

  if v_q.status = 'SENT' then
    if v_q.valid_until < current_date then
      -- Returns rather than raises, so the EXPIRED status is kept. The caller shows the customer a message.
      update quotations set status = 'EXPIRED', updated_at = now() where id = v_q.id;
      perform app.audit(v_q.store_id, 'quotation.expired', 'quotations', v_q.id, null, null);
      return 'EXPIRED';
    end if;
    update quotations set
        status = case when p_decision = 'accept' then 'ACCEPTED' else 'REJECTED' end,
        responded_at = now(), response_note = left(v_note, 500), updated_at = now()
    where id = v_q.id;
    perform app.audit(v_q.store_id, 'quotation.' || p_decision || 'ed', 'quotations', v_q.id, null,
      jsonb_build_object('via', case when p_guest_session is not null then 'guest' else 'share_link' end));
    return case when p_decision = 'accept' then 'ACCEPTED' else 'REJECTED' end;
  end if;

  -- Replays of the same decision succeed without changing anything.
  if p_decision = 'accept' and v_q.status in ('ACCEPTED','CONVERTED') then return v_q.status; end if;
  if p_decision = 'reject' and v_q.status = 'REJECTED' then return v_q.status; end if;
  raise exception 'a % quotation cannot be % now', v_q.status, p_decision using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Conversion to an order (once only)
-- ---------------------------------------------------------------------------

-- Creates the order for an ACCEPTED quotation, reserves stock, and records the payment, all in one transaction.
-- Owner conversions (p_actor) use the POS channel. Guest conversions use the online channel and cannot use credit.
create or replace function public.quotation_convert(
  p_quotation uuid,
  p_actor uuid,
  p_guest_session uuid,
  p_token_hash text,
  p_method text,
  p_provider text,
  p_provider_order_id text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_q quotations%rowtype;
  v_role text;
  v_existing uuid;
  v_prefix text;
  v_inv_prefix text;
  v_number text;
  v_order uuid;
  v_item record;
  v_fig record;
  v_stock bigint;
  v_provider text;
  v_provider_order text;
  v_due date := current_date + 30;
  v_channel text;
  v_sum_gross bigint := 0;
  v_sum_disc bigint := 0;
  v_sum_tax bigint := 0;
  v_sum_sub bigint := 0;
  v_total bigint;
begin
  if not app.is_server() then raise exception 'conversion is server-only' using errcode = '42501'; end if;
  if p_method not in ('online','cash','credit') then raise exception 'unknown payment method' using errcode = 'P0001'; end if;

  select * into v_q from quotations where id = p_quotation for update;
  if not found then raise exception 'quotation not found' using errcode = 'P0002'; end if;

  if p_actor is not null then
    v_role := app.actor_store_role(v_q.store_id, p_actor);
    if coalesce(v_role, '') not in ('owner','manager') then
      raise exception 'only owners and managers can convert a quotation' using errcode = '42501';
    end if;
    v_channel := 'pos';
  else
    if not app.quotation_customer_match(v_q, p_guest_session, p_token_hash) then
      raise exception 'quotation not found' using errcode = 'P0002';
    end if;
    if p_method = 'credit' then raise exception 'credit is only available to the store' using errcode = '42501'; end if;
    v_channel := 'online';
  end if;

  -- Duplicate conversion returns the existing order. The unique index on orders.quotation_id backs this up.
  if v_q.status = 'CONVERTED' then
    select id into v_existing from orders where quotation_id = v_q.id;
    return jsonb_build_object('order_id', v_existing, 'replayed', true, 'status', 'CONVERTED');
  end if;
  if v_q.status <> 'ACCEPTED' then
    raise exception 'a % quotation cannot be converted; only accepted quotations can be', v_q.status using errcode = 'P0001';
  end if;
  if v_q.valid_until is null or v_q.valid_until < current_date then
    raise exception 'this quotation has expired; renew it before converting' using errcode = 'P0001';
  end if;
  if p_method = 'credit' and v_q.customer_id is null then
    raise exception 'credit sales need a customer on the quotation' using errcode = 'P0001';
  end if;
  if p_method = 'online' and p_provider is not null and coalesce(p_provider_order_id, '') = '' then
    raise exception 'an online payment needs a gateway order' using errcode = 'P0001';
  end if;

  -- Re-derive every line and the totals from the stored rows. Tampered or inconsistent figures stop the conversion.
  for v_item in
    select qi.*, pv.is_active, pv.sku as live_sku, pr.status as product_status, pv.cost_price_paise, pr.name as live_name, pv.label as live_label
    from quotation_items qi
    join product_variants pv on pv.id = qi.variant_id
    join products pr on pr.id = pv.product_id
    where qi.quotation_id = v_q.id
    order by qi.sort_order, qi.id
  loop
    if not v_item.is_active or v_item.product_status <> 'active' then
      raise exception 'product % is no longer available; revise the quotation', v_item.live_sku using errcode = 'P0001';
    end if;
    select * into v_fig from app.quotation_line_figures(v_item.quantity, v_item.unit_price_paise, v_item.discount_paise, v_item.gst_rate_bps);
    if v_fig.gross_paise <> v_item.gross_paise or v_fig.taxable_paise <> v_item.taxable_paise
       or v_fig.tax_paise <> v_item.tax_paise or v_item.line_total_paise <> v_item.taxable_paise + v_item.tax_paise then
      raise exception 'the quotation line figures do not reconcile; revise and send it again' using errcode = 'P0001';
    end if;
    v_sum_sub := v_sum_sub + v_item.gross_paise;
    v_sum_disc := v_sum_disc + v_item.discount_paise;
    v_sum_tax := v_sum_tax + v_item.tax_paise;
  end loop;
  if v_sum_sub <> v_q.subtotal_paise or v_sum_disc <> v_q.discount_paise or v_sum_tax <> v_q.tax_paise
     or v_q.taxable_paise <> v_q.subtotal_paise - v_q.discount_paise
     or v_q.total_paise <> v_q.taxable_paise + v_q.tax_paise + v_q.delivery_paise then
    raise exception 'the quotation totals do not reconcile; revise and send it again' using errcode = 'P0001';
  end if;
  v_total := v_q.total_paise;

  select order_prefix, invoice_prefix into v_prefix, v_inv_prefix from store_settings where store_id = v_q.store_id;
  v_number := app.next_number(v_q.store_id, 'order', coalesce(v_prefix, 'ZBM'));

  insert into orders (store_id, order_number, channel, guest_session_id, customer_id, customer_name, customer_mobile,
                      customer_email, fulfilment, delivery_address, payment_method, payment_status, order_status,
                      subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise, quotation_id)
  values (v_q.store_id, v_number, v_channel, case when p_actor is null then coalesce(v_q.guest_session_id, p_guest_session) else null end,
          v_q.customer_id, v_q.customer_name, v_q.customer_mobile, v_q.customer_email,
          case when v_q.delivery_address is not null then 'delivery' else 'pickup' end,
          case when v_q.delivery_address is not null then jsonb_build_object('address', v_q.delivery_address) else null end,
          p_method, 'PENDING', 'PLACED',
          v_q.subtotal_paise, v_q.discount_paise, v_q.taxable_paise, v_q.tax_paise, v_q.delivery_paise, v_total, v_q.id)
  returning id into v_order;

  insert into order_items (order_id, store_id, variant_id, product_name_snapshot, variant_label_snapshot, sku_snapshot,
                           hsn_code_snapshot, quantity, stock_units, cost_price_paise_snapshot, unit_price_paise,
                           discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise)
  select v_order, qi.store_id, qi.variant_id, coalesce(qi.product_name_snapshot, pr.name), coalesce(qi.variant_label_snapshot, pv.label),
         coalesce(qi.sku_snapshot, pv.sku), coalesce(qi.hsn_code_snapshot, pr.hsn_code), qi.quantity, ceil(qi.quantity)::bigint,
         pv.cost_price_paise, qi.unit_price_paise, qi.discount_paise, qi.gst_rate_bps, qi.taxable_paise, qi.tax_paise, qi.line_total_paise
  from quotation_items qi
  join product_variants pv on pv.id = qi.variant_id
  join products pr on pr.id = pv.product_id
  where qi.quotation_id = v_q.id
  order by qi.sort_order, qi.id;

  -- Stock is reserved once. A shortfall raises insufficient_stock and the whole conversion rolls back.
  perform reserve_order_stock(v_order);

  if p_method = 'online' then
    v_provider := coalesce(p_provider, 'simulator');
    v_provider_order := coalesce(p_provider_order_id, 'sim_order_' || v_order::text);
    perform create_payment_attempt(v_order, 'online', v_provider, v_provider_order, v_total,
      coalesce(p_expires_at, now() + interval '15 minutes'), null);
  elsif p_method = 'cash' then
    perform create_payment_attempt(v_order, 'cash', 'cash', 'cash_' || v_order::text, v_total, null, null);
    if p_actor is not null then
      -- A cash sale the owner takes at the counter is paid at once. Guest cash waits for the owner to confirm it.
      perform confirm_cash_payment(v_order, v_total, 'Quotation cash sale', p_actor);
    end if;
  else
    perform record_credit_entry(v_q.customer_id, 'sale', v_total, v_due, 'Quotation credit sale ' || v_number);
    perform consume_order_stock(v_order);
    perform app.set_order_status(v_order, 'CONFIRMED', 'Quotation credit sale');
  end if;

  -- Owner cash and credit sales are complete now and get an invoice. Other invoices follow payment (app.ensure_invoice).
  if p_actor is not null and p_method in ('cash','credit') then
    insert into invoices (store_id, order_id, invoice_number, invoice_date, taxable_paise, tax_paise, total_paise)
    values (v_q.store_id, v_order, app.next_number(v_q.store_id, 'invoice', coalesce(v_inv_prefix, 'INV')),
            current_date, v_q.taxable_paise, v_q.tax_paise, v_total)
    on conflict (order_id) do nothing;
  end if;

  update quotations set status = 'CONVERTED', converted_order_id = v_order, converted_at = now(), updated_at = now()
  where id = v_q.id;

  perform app.audit(v_q.store_id, 'quotation.converted', 'quotations', v_q.id, null,
    jsonb_build_object('order_id', v_order, 'order_number', v_number, 'method', p_method, 'total_paise', v_total,
                       'actor', p_actor, 'via', case when p_actor is null then 'guest' else 'owner' end));

  return jsonb_build_object('order_id', v_order, 'order_number', v_number, 'method', p_method, 'total_paise', v_total,
                            'replayed', false, 'status', 'CONVERTED');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Expiry and audit of downloads
-- ---------------------------------------------------------------------------

-- Moves SENT quotations past their validity date to EXPIRED. Run by the cron route. Returns how many changed.
create or replace function public.expire_quotations() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_count integer := 0;
begin
  if not app.is_server() then raise exception 'expiry is server-only' using errcode = '42501'; end if;
  for v_row in
    select id, store_id from quotations
    where status = 'SENT' and valid_until < current_date
    for update skip locked
  loop
    update quotations set status = 'EXPIRED', updated_at = now() where id = v_row.id;
    perform app.audit(v_row.store_id, 'quotation.expired', 'quotations', v_row.id, null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Records that an invoice or quotation PDF was produced. The actor kind is owner, guest or share; no token is stored.
create or replace function public.record_document_download(
  p_store uuid, p_kind text, p_entity uuid, p_actor_kind text, p_actor uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_server() then raise exception 'document audit is server-only' using errcode = '42501'; end if;
  if p_kind not in ('invoice','quotation') then raise exception 'unknown document kind' using errcode = 'P0001'; end if;
  if p_actor_kind not in ('owner','guest','share') then raise exception 'unknown actor kind' using errcode = 'P0001'; end if;
  perform app.audit(p_store, 'document.downloaded', case when p_kind = 'invoice' then 'invoices' else 'quotations' end, p_entity,
    null, jsonb_build_object('kind', p_kind, 'actor_kind', p_actor_kind, 'actor', p_actor));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Privileges: server-only functions are not callable by anon or authenticated clients.
-- ---------------------------------------------------------------------------
revoke execute on function app.actor_store_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function app.quotation_customer_match(quotations, uuid, text) from public, anon, authenticated;
revoke execute on function app.quotation_line_figures(numeric, bigint, bigint, integer) from public, anon, authenticated;
revoke execute on function public.quotation_save(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.quotation_send(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.quotation_rotate_share(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.quotation_revise(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.quotation_cancel(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.quotation_guest_request(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.quotation_guest_withdraw(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.quotation_respond(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.quotation_convert(uuid, uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.expire_quotations() from public, anon, authenticated;
revoke execute on function public.record_document_download(uuid, text, uuid, text, uuid) from public, anon, authenticated;
