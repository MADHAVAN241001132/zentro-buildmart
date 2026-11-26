-- 0006: every new product variant gets an inventory row automatically.
-- Owners create variants directly through RLS, and RLS does not allow them to insert inventory.
-- Without this trigger a new variant would have no stock row and could not be adjusted.
-- Additive only: existing variants already have rows, and ON CONFLICT leaves them unchanged.

create or replace function app.ensure_variant_inventory()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into inventory (store_id, variant_id, on_hand, reserved, damaged, incoming, reorder_level)
  values (new.store_id, new.id, 0, 0, 0, 0, 0)
  on conflict (variant_id) do nothing;
  return new;
end $$;

drop trigger if exists product_variants_ensure_inventory on product_variants;
create trigger product_variants_ensure_inventory
  after insert on product_variants
  for each row execute function app.ensure_variant_inventory();

revoke execute on function app.ensure_variant_inventory() from public, anon, authenticated;
