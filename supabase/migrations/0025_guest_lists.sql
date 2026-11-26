-- 0025: guest wishlist and product comparison.
--
-- Both lists belong to one guest session of one store. Rows are written and read only by server code using the
-- service role. RLS is on with no policies and no client grants, so anonymous and signed-in browsers cannot read
-- or change them directly.
--
-- Database rules (not only application rules):
--   * a list row's store must equal the guest session's store and the product's store;
--   * a session may compare at most four products.

create table guest_wishlist_items (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id) on delete cascade,
  guest_session_id   uuid not null references guest_sessions(id) on delete cascade,
  product_id         uuid not null references products(id) on delete cascade,
  created_at         timestamptz not null default now(),
  unique (guest_session_id, product_id)
);
create index guest_wishlist_items_session_idx on guest_wishlist_items (guest_session_id, created_at);

create table guest_compare_items (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id) on delete cascade,
  guest_session_id   uuid not null references guest_sessions(id) on delete cascade,
  product_id         uuid not null references products(id) on delete cascade,
  created_at         timestamptz not null default now(),
  unique (guest_session_id, product_id)
);
create index guest_compare_items_session_idx on guest_compare_items (guest_session_id, created_at);

alter table guest_wishlist_items enable row level security;
alter table guest_compare_items enable row level security;
revoke all on guest_wishlist_items from anon, authenticated;
revoke all on guest_compare_items from anon, authenticated;

create or replace function app.guest_list_scope() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  session_store uuid;
  product_store uuid;
  compare_count integer;
begin
  -- Lock the session row so two concurrent compare requests cannot both pass the count check.
  select gs.store_id into session_store from public.guest_sessions gs where gs.id = new.guest_session_id for update;
  select p.store_id into product_store from public.products p where p.id = new.product_id;
  if session_store is distinct from new.store_id or product_store is distinct from new.store_id then
    raise exception 'This product is not sold by this store' using errcode = '42501';
  end if;
  if tg_table_name = 'guest_compare_items' then
    select count(*) into compare_count from public.guest_compare_items c where c.guest_session_id = new.guest_session_id;
    if compare_count >= 4 then
      raise exception 'You can compare up to four products. Remove one to add another.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function app.guest_list_scope() from public, anon, authenticated;

create trigger guest_wishlist_items_scope before insert on guest_wishlist_items
  for each row execute function app.guest_list_scope();
create trigger guest_compare_items_scope before insert on guest_compare_items
  for each row execute function app.guest_list_scope();
