-- 0035: QR entry tracking, attribution and QR analytics. Additive. Existing printed QR codes keep working.

-- 1. Tracking identifier per QR code. Existing rows receive a unique token from the volatile default.
alter table qr_codes
  add column if not exists entry_token text not null default replace(gen_random_uuid()::text, '-', '');
alter table qr_codes drop constraint if exists qr_codes_entry_token_format;
alter table qr_codes add constraint qr_codes_entry_token_format check (entry_token ~ '^[0-9a-f]{32}$');
create unique index if not exists qr_codes_entry_token_idx on qr_codes(entry_token);

-- 2. Documented analytics settings. One row; platform administrators change it through SQL.
create table if not exists qr_analytics_settings (
  id                boolean primary key default true check (id),
  attribution_hours integer not null default 24 check (attribution_hours between 1 and 168),
  dedupe_minutes    integer not null default 30 check (dedupe_minutes between 1 and 1440),
  updated_at        timestamptz not null default now()
);
insert into qr_analytics_settings (id) values (true) on conflict (id) do nothing;
alter table qr_analytics_settings enable row level security;
create policy qr_analytics_settings_read on qr_analytics_settings for select to authenticated using (true);
create policy qr_analytics_settings_admin on qr_analytics_settings for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- 3. Recorded entry events. Raw rows hold guest-session links, so no client role can read them directly.
create table if not exists qr_entry_events (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references stores(id) on delete cascade,
  qr_code_id       uuid not null references qr_codes(id) on delete cascade,
  guest_session_id uuid not null references guest_sessions(id) on delete cascade,
  entered_at       timestamptz not null default now()
);
create index if not exists qr_entry_events_store_time_idx on qr_entry_events(store_id, entered_at);
create index if not exists qr_entry_events_session_idx on qr_entry_events(store_id, guest_session_id, entered_at desc);
create index if not exists qr_entry_events_qr_time_idx on qr_entry_events(qr_code_id, entered_at);
alter table qr_entry_events enable row level security;

-- 4. Attribution of an order to the entry that preceded it. The order id is the key, so an order is attributed once.
create table if not exists qr_order_attributions (
  order_id         uuid primary key references orders(id) on delete cascade,
  store_id         uuid not null references stores(id) on delete cascade,
  qr_code_id       uuid not null references qr_codes(id) on delete cascade,
  entry_event_id   uuid not null references qr_entry_events(id) on delete cascade,
  guest_session_id uuid not null references guest_sessions(id) on delete cascade,
  entered_at       timestamptz not null,
  attributed_at    timestamptz not null default now()
);
create index if not exists qr_order_attributions_store_entry_idx on qr_order_attributions(store_id, entered_at);
alter table qr_order_attributions enable row level security;

create or replace function app.attribute_qr_order() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  ev qr_entry_events%rowtype;
  window_hours integer;
begin
  if new.guest_session_id is null then return new; end if;
  select attribution_hours into window_hours from qr_analytics_settings where id;
  select e.* into ev from qr_entry_events e
   where e.store_id = new.store_id
     and e.guest_session_id = new.guest_session_id
     and e.entered_at <= new.created_at
     and e.entered_at >= new.created_at - make_interval(hours => coalesce(window_hours, 24))
   order by e.entered_at desc
   limit 1;
  if found then
    insert into qr_order_attributions (order_id, store_id, qr_code_id, entry_event_id, guest_session_id, entered_at)
    values (new.id, new.store_id, ev.qr_code_id, ev.id, ev.guest_session_id, ev.entered_at)
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

create trigger orders_qr_attribution after insert on orders
  for each row execute function app.attribute_qr_order();

-- 5. Target lookup for the tracked entry route. Returns nothing for unknown, inactive or hidden targets.
create or replace function public.zb_qr_entry_target(p_token text)
returns table (qr_code_id uuid, store_id uuid, store_slug text, target_type text, target_slug text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return; end if;
  return query
    select q.id, s.id, s.slug::text, q.target_type::text,
           case q.target_type
             when 'category' then (select c.slug::text from categories c where c.id = q.target_id and c.store_id = q.store_id and c.is_active)
             when 'product' then (select p.slug::text from products p where p.id = q.target_id and p.store_id = q.store_id and p.status = 'active' and p.visibility = 'public')
             else null
           end
      from qr_codes q
      join stores s on s.id = q.store_id and s.status = 'active'
     where q.entry_token = p_token
       and q.is_active
       and (q.target_type = 'showroom'
            or (q.target_type = 'category' and exists (select 1 from categories c where c.id = q.target_id and c.store_id = q.store_id and c.is_active))
            or (q.target_type = 'product' and exists (select 1 from products p where p.id = q.target_id and p.store_id = q.store_id and p.status = 'active' and p.visibility = 'public')));
end $$;

-- 6. Records one entry. Returns 'recorded', 'duplicate' (same guest session and QR within the dedupe window) or 'invalid'.
create or replace function public.zb_record_qr_entry(p_token text, p_session uuid)
returns text
language plpgsql security definer set search_path = public, app as $$
declare
  t record;
  dedupe integer;
begin
  select * into t from public.zb_qr_entry_target(p_token);
  if not found then return 'invalid'; end if;
  if p_session is null or not exists (
    select 1 from guest_sessions gs
     where gs.id = p_session and gs.store_id = t.store_id and gs.expires_at > now()
  ) then
    return 'invalid';
  end if;
  select q.dedupe_minutes into dedupe from qr_analytics_settings q where q.id;
  if exists (
    select 1 from qr_entry_events e
     where e.qr_code_id = t.qr_code_id
       and e.guest_session_id = p_session
       and e.entered_at > now() - make_interval(mins => coalesce(dedupe, 30))
  ) then
    return 'duplicate';
  end if;
  insert into qr_entry_events (store_id, qr_code_id, guest_session_id) values (t.store_id, t.qr_code_id, p_session);
  return 'recorded';
end $$;

-- 7. Creates or finds the tracked QR for a category, product or showroom. Targets must be visible to customers.
create or replace function public.zb_ensure_qr_code(p_store uuid, p_type text, p_target uuid, p_public_url text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare
  token text;
begin
  if p_type = 'showroom' then
    insert into qr_codes (store_id, target_type, target_id, public_url)
    values (p_store, 'showroom', null, p_public_url)
    on conflict (store_id) where target_type = 'showroom' do nothing;
    select q.entry_token into token from qr_codes q where q.store_id = p_store and q.target_type = 'showroom';
  elsif p_type = 'category' then
    if not exists (select 1 from categories c where c.id = p_target and c.store_id = p_store and c.is_active) then
      raise exception 'category not found' using errcode = 'P0002';
    end if;
    insert into qr_codes (store_id, target_type, target_id, public_url)
    values (p_store, 'category', p_target, p_public_url)
    on conflict (store_id, target_type, target_id) where target_id is not null do nothing;
    select q.entry_token into token from qr_codes q where q.store_id = p_store and q.target_type = 'category' and q.target_id = p_target;
  elsif p_type = 'product' then
    if not exists (select 1 from products p where p.id = p_target and p.store_id = p_store and p.status = 'active' and p.visibility = 'public') then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
    insert into qr_codes (store_id, target_type, target_id, public_url)
    values (p_store, 'product', p_target, p_public_url)
    on conflict (store_id, target_type, target_id) where target_id is not null do nothing;
    select q.entry_token into token from qr_codes q where q.store_id = p_store and q.target_type = 'product' and q.target_id = p_target;
  else
    raise exception 'unsupported QR target' using errcode = '22023';
  end if;
  return token;
end $$;

-- 8. Analytics authorisation: platform administrators see everything; store owners and managers see their own store.
create or replace function app.qr_analytics_allowed(p_store uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_platform_admin()
      or (p_store is not null and app.is_store_member(p_store, array['owner', 'manager']))
$$;

create or replace function public.zb_qr_daily(p_store uuid, p_from date, p_to date)
returns table (day date, entries bigint, unique_sessions bigint, attributed_orders bigint, paid_orders bigint, paid_value_paise bigint)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.qr_analytics_allowed(p_store) then
    raise exception 'not authorised for QR analytics' using errcode = '42501';
  end if;
  if p_store is null and not app.is_platform_admin() then
    raise exception 'not authorised for platform QR analytics' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  return query
  with ev as (
    select (e.entered_at at time zone 'Asia/Kolkata')::date as d, e.guest_session_id
      from qr_entry_events e
     where (p_store is null or e.store_id = p_store)
       and (e.entered_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ),
  att as (
    select (a.entered_at at time zone 'Asia/Kolkata')::date as d, o.order_status, o.payment_status, o.total_paise
      from qr_order_attributions a
      join orders o on o.id = a.order_id
     where (p_store is null or a.store_id = p_store)
       and (a.entered_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ),
  days as (select generate_series(p_from, p_to, interval '1 day')::date as d)
  select days.d,
         (select count(*) from ev where ev.d = days.d)::bigint,
         (select count(distinct ev.guest_session_id) from ev where ev.d = days.d)::bigint,
         (select count(*) from att where att.d = days.d and att.order_status <> 'CANCELLED')::bigint,
         (select count(*) from att where att.d = days.d and att.order_status <> 'CANCELLED'
             and att.payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'))::bigint,
         (select coalesce(sum(att.total_paise), 0) from att where att.d = days.d and att.order_status <> 'CANCELLED'
             and att.payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'))::bigint
    from days
   order by days.d;
end $$;

create or replace function public.zb_qr_summary(p_store uuid, p_from date, p_to date)
returns table (
  entries bigint, unique_sessions bigint, repeat_entries bigint,
  entries_today bigint, entries_last_7_days bigint, entries_month_to_date bigint,
  attributed_orders bigint, paid_orders bigint, paid_value_paise bigint, refunded_paise bigint,
  converted_sessions bigint, conversion_bps integer
)
language plpgsql stable security definer set search_path = public, app as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not app.qr_analytics_allowed(p_store) then
    raise exception 'not authorised for QR analytics' using errcode = '42501';
  end if;
  if p_store is null and not app.is_platform_admin() then
    raise exception 'not authorised for platform QR analytics' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  return query
  with ev as (
    select e.guest_session_id, (e.entered_at at time zone 'Asia/Kolkata')::date as d
      from qr_entry_events e
     where (p_store is null or e.store_id = p_store)
  ),
  ev_range as (select * from ev where d between p_from and p_to),
  att as (
    select a.guest_session_id, o.id as order_id, o.order_status, o.payment_status, o.total_paise
      from qr_order_attributions a
      join orders o on o.id = a.order_id
     where (p_store is null or a.store_id = p_store)
       and (a.entered_at at time zone 'Asia/Kolkata')::date between p_from and p_to
       and o.order_status <> 'CANCELLED'
  ),
  att_paid as (select * from att where payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  counts as (
    select (select count(*) from ev_range)::bigint as entries,
           (select count(distinct guest_session_id) from ev_range)::bigint as unique_sessions
  )
  select c.entries,
         c.unique_sessions,
         (c.entries - c.unique_sessions)::bigint,
         (select count(*) from ev where d = today)::bigint,
         (select count(*) from ev where d between today - 6 and today)::bigint,
         (select count(*) from ev where d >= date_trunc('month', today)::date and d <= today)::bigint,
         (select count(*) from att)::bigint,
         (select count(*) from att_paid)::bigint,
         (select coalesce(sum(total_paise), 0) from att_paid)::bigint,
         (select coalesce(sum(r.amount_paise), 0) from refunds r
             where r.status = 'succeeded' and r.order_id in (select order_id from att_paid))::bigint,
         (select count(distinct guest_session_id) from att_paid)::bigint,
         case when c.unique_sessions = 0 then null
              else round(((select count(distinct guest_session_id) from att_paid)::numeric * 10000) / c.unique_sessions)::integer
         end
    from counts c;
end $$;

create or replace function public.zb_qr_store_comparison(p_from date, p_to date, p_store uuid default null)
returns table (
  store_id uuid, store_name text, entries bigint, unique_sessions bigint,
  attributed_orders bigint, paid_orders bigint, paid_value_paise bigint,
  converted_sessions bigint, conversion_bps integer
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_platform_admin() then
    raise exception 'only platform administrators can compare stores' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  return query
  with ev as (
    select e.store_id, e.guest_session_id
      from qr_entry_events e
     where (e.entered_at at time zone 'Asia/Kolkata')::date between p_from and p_to
       and (p_store is null or e.store_id = p_store)
  ),
  att as (
    select a.store_id, a.guest_session_id, o.order_status, o.payment_status, o.total_paise
      from qr_order_attributions a
      join orders o on o.id = a.order_id
     where (a.entered_at at time zone 'Asia/Kolkata')::date between p_from and p_to
       and o.order_status <> 'CANCELLED'
       and (p_store is null or a.store_id = p_store)
  ),
  att_paid as (select * from att where payment_status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  per_store as (
    select s.id as sid, s.name::text as sname,
           (select count(*) from ev where ev.store_id = s.id)::bigint as e_count,
           (select count(distinct ev.guest_session_id) from ev where ev.store_id = s.id)::bigint as e_sessions,
           (select count(*) from att where att.store_id = s.id)::bigint as a_count,
           (select count(*) from att_paid where att_paid.store_id = s.id)::bigint as p_count,
           (select coalesce(sum(att_paid.total_paise), 0) from att_paid where att_paid.store_id = s.id)::bigint as p_value,
           (select count(distinct att_paid.guest_session_id) from att_paid where att_paid.store_id = s.id)::bigint as c_sessions
      from stores s
     where (p_store is null or s.id = p_store)
  )
  select per_store.sid, per_store.sname, per_store.e_count, per_store.e_sessions, per_store.a_count, per_store.p_count,
         per_store.p_value, per_store.c_sessions,
         case when per_store.e_sessions = 0 then null
              else round((per_store.c_sessions::numeric * 10000) / per_store.e_sessions)::integer end
    from per_store
   where per_store.e_count > 0 or per_store.a_count > 0
   order by per_store.e_count desc, per_store.sname;
end $$;

-- 9. Grants. Recording and target lookup are server-side only. Analytics functions check authorisation themselves.
revoke all on function public.zb_qr_entry_target(text) from public;
revoke all on function public.zb_record_qr_entry(text, uuid) from public;
revoke all on function public.zb_ensure_qr_code(uuid, text, uuid, text) from public;
grant execute on function public.zb_qr_entry_target(text) to service_role;
grant execute on function public.zb_record_qr_entry(text, uuid) to service_role;
grant execute on function public.zb_ensure_qr_code(uuid, text, uuid, text) to service_role;
revoke all on function public.zb_qr_daily(uuid, date, date) from public;
revoke all on function public.zb_qr_summary(uuid, date, date) from public;
revoke all on function public.zb_qr_store_comparison(date, date, uuid) from public;
grant execute on function public.zb_qr_daily(uuid, date, date) to authenticated, service_role;
grant execute on function public.zb_qr_summary(uuid, date, date) to authenticated, service_role;
grant execute on function public.zb_qr_store_comparison(date, date, uuid) to authenticated, service_role;

-- 10. Seller snapshot basis. Snapshots made by migration 0033 are marked as migration-time, not issue-time.
alter table invoices add column if not exists seller_snapshot_basis text not null default 'issue'
  check (seller_snapshot_basis in ('issue', 'migration_0033'));
alter table quotations add column if not exists seller_snapshot_basis text not null default 'issue'
  check (seller_snapshot_basis in ('issue', 'migration_0033'));
update invoices set seller_snapshot_basis = 'migration_0033'
 where seller_legal_name is not null
   and created_at < (select applied_at from public.zentro_schema_migrations where version like '0033%');
update quotations set seller_snapshot_basis = 'migration_0033'
 where seller_legal_name is not null
   and created_at < (select applied_at from public.zentro_schema_migrations where version like '0033%');

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
    new.seller_snapshot_basis := 'issue';
    return new;
  end if;
  if old.seller_legal_name is not null
     and (new.seller_legal_name, new.seller_billing_address, new.seller_gstin, new.seller_state,
          new.seller_gst_registration, new.seller_prices_include_gst, new.seller_snapshot_basis)
         is distinct from
         (old.seller_legal_name, old.seller_billing_address, old.seller_gstin, old.seller_state,
          old.seller_gst_registration, old.seller_prices_include_gst, old.seller_snapshot_basis) then
    raise exception 'the seller details of an issued document are fixed' using errcode = '42501';
  end if;
  return new;
end $$;
