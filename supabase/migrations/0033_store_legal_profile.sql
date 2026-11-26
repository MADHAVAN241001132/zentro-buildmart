-- 0033: Store legal and tax profile, seller snapshots on invoices and quotations, and atomic onboarding store creation.
-- Additive. Existing stores keep every value. No tax calculation is changed by this migration.

alter table stores
  add column if not exists legal_name text check (legal_name is null or length(trim(legal_name)) between 1 and 160),
  add column if not exists business_category text check (business_category is null or length(business_category) <= 80),
  add column if not exists business_description text check (business_description is null or length(business_description) <= 500),
  add column if not exists billing_address text check (billing_address is null or length(billing_address) <= 300),
  add column if not exists gst_registration text not null default 'unregistered'
    check (gst_registration in ('regular', 'composition', 'unregistered')),
  add column if not exists prices_include_gst boolean not null default false;

-- Assumption for review: a store that already holds a GSTIN is treated as a regular registrant.
-- A tax adviser must confirm this for each store before the GST release.
update stores set gst_registration = 'regular' where gstin is not null and gst_registration = 'unregistered';

-- Only platform administrators change the legal and tax profile. Owners read it on their settings page.
create or replace function app.guard_store_legal_profile() returns trigger
language plpgsql set search_path = public, app as $$
begin
  if (new.legal_name, new.business_category, new.business_description, new.billing_address, new.gstin, new.state,
      new.gst_registration, new.prices_include_gst)
     is distinct from
     (old.legal_name, old.business_category, old.business_description, old.billing_address, old.gstin, old.state,
      old.gst_registration, old.prices_include_gst)
     and not app.is_platform_admin() and current_user <> 'service_role' then
    raise exception 'Only a platform administrator can change the legal and tax profile' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger stores_guard_legal_profile before update on stores
  for each row execute function app.guard_store_legal_profile();

-- Seller snapshot on documents. Invoices and quotations record the seller details in force when they are issued.
alter table invoices
  add column if not exists seller_legal_name text,
  add column if not exists seller_billing_address text,
  add column if not exists seller_gstin text,
  add column if not exists seller_state text,
  add column if not exists seller_gst_registration text,
  add column if not exists seller_prices_include_gst boolean;

alter table quotations
  add column if not exists seller_legal_name text,
  add column if not exists seller_billing_address text,
  add column if not exists seller_gstin text,
  add column if not exists seller_state text,
  add column if not exists seller_gst_registration text,
  add column if not exists seller_prices_include_gst boolean;

-- Documents issued before this migration are snapshotted once, from the store details on record now.
update invoices i set
  seller_legal_name = coalesce(s.legal_name, s.name),
  seller_billing_address = s.billing_address,
  seller_gstin = s.gstin,
  seller_state = s.state,
  seller_gst_registration = s.gst_registration,
  seller_prices_include_gst = s.prices_include_gst
from stores s
where s.id = i.store_id and i.seller_legal_name is null;

update quotations q set
  seller_legal_name = coalesce(s.legal_name, s.name),
  seller_billing_address = s.billing_address,
  seller_gstin = s.gstin,
  seller_state = s.state,
  seller_gst_registration = s.gst_registration,
  seller_prices_include_gst = s.prices_include_gst
from stores s
where s.id = q.store_id and q.seller_legal_name is null;

create or replace function app.seller_snapshot_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare s stores%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into s from stores where id = new.store_id;
    if not found then raise exception 'store not found' using errcode = '23503'; end if;
    new.seller_legal_name := coalesce(s.legal_name, s.name);
    new.seller_billing_address := s.billing_address;
    new.seller_gstin := s.gstin;
    new.seller_state := s.state;
    new.seller_gst_registration := s.gst_registration;
    new.seller_prices_include_gst := s.prices_include_gst;
    return new;
  end if;
  if old.seller_legal_name is not null
     and (new.seller_legal_name, new.seller_billing_address, new.seller_gstin, new.seller_state,
          new.seller_gst_registration, new.seller_prices_include_gst)
         is distinct from
         (old.seller_legal_name, old.seller_billing_address, old.seller_gstin, old.seller_state,
          old.seller_gst_registration, old.seller_prices_include_gst) then
    raise exception 'the seller details of an issued document are fixed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger invoices_seller_snapshot before insert or update on invoices
  for each row execute function app.seller_snapshot_guard();
create trigger quotations_seller_snapshot before insert or update on quotations
  for each row execute function app.seller_snapshot_guard();

-- Creates a store and links it to its onboarding in one transaction. A failed slug or a second attempt
-- leaves no store behind and changes nothing on the onboarding.
create or replace function public.onboarding_create_store(p_onboarding uuid, p_fields jsonb, p_step_data jsonb, p_step integer)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  ob store_onboardings%rowtype;
  new_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Only a platform administrator can create stores' using errcode = '42501';
  end if;
  if p_step is null or p_step < 1 or p_step > 8 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;
  select * into ob from store_onboardings where id = p_onboarding for update;
  if not found then raise exception 'onboarding not found' using errcode = 'P0002'; end if;
  if ob.status <> 'in_progress' then raise exception 'this onboarding is already closed' using errcode = 'P0001'; end if;
  if ob.store_id is not null then raise exception 'this onboarding already has a store' using errcode = 'P0001'; end if;

  insert into stores (slug, name, status, address_line, city, state, pincode, phone, email, brand_colour,
                      business_category, business_description)
  values (p_fields->>'slug', p_fields->>'name', 'draft', p_fields->>'addressLine', p_fields->>'city', p_fields->>'state',
          p_fields->>'pincode', p_fields->>'phone', p_fields->>'email', p_fields->>'brandColour',
          p_fields->>'category', p_fields->>'description')
  returning id into new_id;

  update store_onboardings
     set store_id = new_id, step_data = p_step_data, current_step = greatest(current_step, p_step)
   where id = p_onboarding;
  return new_id;
end $$;

revoke all on function public.onboarding_create_store(uuid, jsonb, jsonb, integer) from public;
grant execute on function public.onboarding_create_store(uuid, jsonb, jsonb, integer) to authenticated, service_role;
