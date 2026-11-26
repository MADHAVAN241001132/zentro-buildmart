-- 0014: coupons applied to POS order totals, with line-level allocation and GST on the discounted taxable value.
-- A coupon discount is computed once on the bill subtotal (after line discounts), allocated across lines in proportion
-- to each line's pre-coupon amount (largest-remainder: any paise left over go to the first lines that can take them),
-- and GST is then computed per line on the taxable value. All money is integer paise.
-- Usage is counted when the bill is linked to its order: the coupon row is locked, the limit is re-checked, a redemption
-- row is written (one per order), and used_count increases. Cancelling the order releases the redemption.

create table coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  coupon_id       uuid not null references coupons(id),
  order_id        uuid not null unique references orders(id) on delete cascade,
  discount_paise  bigint not null check (discount_paise >= 0),
  created_at      timestamptz not null default now()
);

alter table coupon_redemptions enable row level security;
create policy coupon_redemptions_member_read on coupon_redemptions for select to authenticated
  using (app.is_store_member(store_id) or app.is_platform_admin());
revoke insert, update, delete on coupon_redemptions from authenticated, anon;

alter table pos_bills add column coupon_id uuid references coupons(id) on delete set null;

-- Shared rule for applying a coupon to a subtotal. Raises a readable error when the coupon cannot apply.
create or replace function app.coupon_discount(p_coupon coupons, p_subtotal bigint) returns bigint
language plpgsql stable set search_path = public as $$
declare
  v bigint;
begin
  if not p_coupon.is_active then raise exception 'coupon % is switched off', p_coupon.code using errcode = 'P0001'; end if;
  if p_coupon.starts_at is not null and now() < p_coupon.starts_at then
    raise exception 'coupon % is not valid yet', p_coupon.code using errcode = 'P0001';
  end if;
  if p_coupon.ends_at is not null and now() > p_coupon.ends_at then
    raise exception 'coupon % has expired', p_coupon.code using errcode = 'P0001';
  end if;
  if p_coupon.max_uses is not null and p_coupon.used_count >= p_coupon.max_uses then
    raise exception 'coupon % has been fully used', p_coupon.code using errcode = 'P0001';
  end if;
  if p_subtotal < p_coupon.min_order_paise then
    raise exception 'coupon % needs an order of at least % paise', p_coupon.code, p_coupon.min_order_paise using errcode = 'P0001';
  end if;
  if p_coupon.discount_type = 'percent' then
    v := round(p_subtotal * p_coupon.discount_bps / 10000.0)::bigint;
  else
    v := p_coupon.discount_paise;
  end if;
  return least(v, p_subtotal);
end $$;

-- Replaces app.price_pos_bill (migration 0010) with coupon support. Same validation and output keys, plus
-- coupon_discount_paise and coupon_code. Each line gains coupon_discount_paise; discount_paise includes it.
create or replace function app.price_pos_bill(p_bill uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_coupon coupons%rowtype;
  v_coupon_code text;
  v_item record;
  v_meta jsonb := '[]'::jsonb;
  v_gross bigint[] := '{}';
  v_disc bigint[] := '{}';
  v_pre bigint[] := '{}';
  v_gst integer[] := '{}';
  v_alloc bigint[] := '{}';
  v_count integer := 0;
  v_gross_i bigint;
  v_pre_i bigint;
  v_s bigint := 0;
  v_subtotal bigint := 0;
  v_coupon_d bigint := 0;
  v_alloc_sum bigint := 0;
  v_rem bigint;
  v_i integer;
  v_t bigint;
  v_tax bigint;
  v_lines jsonb := '[]'::jsonb;
  v_taxable bigint := 0;
  v_tax_total bigint := 0;
  v_disc_total bigint := 0;
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
    v_gross_i := round(v_item.quantity * v_item.sale_price_paise)::bigint;
    if v_item.line_discount_paise > v_gross_i then
      raise exception 'discount on % is larger than the line amount', v_item.sku using errcode = 'P0001';
    end if;
    v_pre_i := v_gross_i - v_item.line_discount_paise;

    v_meta := v_meta || jsonb_build_object(
      'variant_id', v_item.variant_id,
      'sku', v_item.sku,
      'product_name', v_item.product_name,
      'variant_label', v_item.label,
      'hsn_code', v_item.hsn_code,
      'quantity', v_item.quantity,
      'stock_units', ceil(v_item.quantity)::bigint,
      'unit_price_paise', v_item.sale_price_paise,
      'cost_price_paise', v_item.cost_price_paise);
    v_gross := v_gross || v_gross_i;
    v_disc := v_disc || v_item.line_discount_paise;
    v_pre := v_pre || v_pre_i;
    v_gst := v_gst || v_item.gst_rate_bps::integer;
    v_s := v_s + v_pre_i;
    v_subtotal := v_subtotal + v_gross_i;
  end loop;

  if v_bill.coupon_id is not null then
    select * into v_coupon from coupons where id = v_bill.coupon_id;
    if not found then raise exception 'the coupon on this bill no longer exists' using errcode = 'P0001'; end if;
    v_coupon_code := v_coupon.code;
    v_coupon_d := app.coupon_discount(v_coupon, v_s);
  end if;

  -- Largest-remainder allocation of the coupon across lines, proportional to each line's pre-coupon amount.
  for v_i in 1..v_count loop
    v_alloc := v_alloc || (case when v_coupon_d > 0 and v_s > 0
                                then floor(v_coupon_d::numeric * v_pre[v_i] / v_s)::bigint
                                else 0 end);
    v_alloc_sum := v_alloc_sum + v_alloc[v_i];
  end loop;
  v_rem := v_coupon_d - v_alloc_sum;
  for v_i in 1..v_count loop
    exit when v_rem <= 0;
    if v_pre[v_i] - v_alloc[v_i] > 0 then
      v_alloc[v_i] := v_alloc[v_i] + 1;
      v_rem := v_rem - 1;
    end if;
  end loop;
  if v_rem <> 0 then raise exception 'the coupon could not be allocated to the lines' using errcode = 'P0001'; end if;

  for v_i in 1..v_count loop
    v_t := v_pre[v_i] - v_alloc[v_i];
    v_tax := round(v_t * v_gst[v_i] / 10000.0)::bigint;
    v_taxable := v_taxable + v_t;
    v_tax_total := v_tax_total + v_tax;
    v_disc_total := v_disc_total + v_disc[v_i] + v_alloc[v_i];
    v_lines := v_lines || ((v_meta -> (v_i - 1)) || jsonb_build_object(
      'gross_paise', v_gross[v_i],
      'discount_paise', v_disc[v_i] + v_alloc[v_i],
      'coupon_discount_paise', v_alloc[v_i],
      'gst_rate_bps', v_gst[v_i],
      'taxable_paise', v_t,
      'tax_paise', v_tax,
      'line_total_paise', v_t + v_tax));
  end loop;

  return jsonb_build_object(
    'lines', v_lines,
    'line_count', v_count,
    'subtotal_paise', v_subtotal,
    'discount_paise', v_disc_total,
    'coupon_discount_paise', v_coupon_d,
    'coupon_code', v_coupon_code,
    'taxable_paise', v_taxable,
    'tax_paise', v_tax_total,
    'total_paise', v_taxable + v_tax_total);
end $$;

-- Owner sets or clears the coupon on a held bill. The price call validates the coupon; an invalid one rolls back.
create or replace function pos_set_coupon(p_bill uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bill pos_bills%rowtype;
  v_coupon coupons%rowtype;
begin
  select * into v_bill from pos_bills where id = p_bill for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_bill.store_id, array['owner','manager']);
  if v_bill.status <> 'HELD' then raise exception 'coupons can only be changed on a held bill' using errcode = 'P0001'; end if;

  if p_code is null or btrim(p_code) = '' then
    update pos_bills set coupon_id = null, updated_at = now() where id = p_bill;
    return app.price_pos_bill(p_bill);
  end if;

  select * into v_coupon from coupons where store_id = v_bill.store_id and code = upper(btrim(p_code));
  if not found then raise exception 'coupon code not recognised' using errcode = 'P0001'; end if;
  update pos_bills set coupon_id = v_coupon.id, updated_at = now() where id = p_bill;
  return app.price_pos_bill(p_bill);
end $$;

-- Fires when a placed bill is linked to its order. Locks the coupon, re-checks it, records one redemption, counts the use.
create or replace function app.pos_bill_redeem_coupon() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c coupons%rowtype;
  v_d bigint;
begin
  if new.coupon_id is null or new.order_id is null or old.order_id is not null then return null; end if;
  select * into c from coupons where id = new.coupon_id for update;
  if c.max_uses is not null and c.used_count >= c.max_uses then
    raise exception 'coupon % has been fully used', c.code using errcode = 'P0001';
  end if;
  v_d := (app.price_pos_bill(new.id) ->> 'coupon_discount_paise')::bigint;
  insert into coupon_redemptions (store_id, coupon_id, order_id, discount_paise)
  values (new.store_id, c.id, new.order_id, v_d);
  update coupons set used_count = used_count + 1 where id = c.id;
  return null;
end $$;

drop trigger if exists pos_bill_redeem_coupon on pos_bills;
create trigger pos_bill_redeem_coupon
  after update of order_id on pos_bills
  for each row execute function app.pos_bill_redeem_coupon();

-- Cancelling an order releases its coupon redemption so the code can be used again.
create or replace function app.order_release_coupon() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r coupon_redemptions%rowtype;
begin
  if new.order_status = 'CANCELLED' and old.order_status is distinct from 'CANCELLED' then
    select * into r from coupon_redemptions where order_id = new.id for update;
    if found then
      delete from coupon_redemptions where id = r.id;
      update coupons set used_count = greatest(used_count - 1, 0) where id = r.coupon_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists order_release_coupon on orders;
create trigger order_release_coupon
  after update of order_status on orders
  for each row execute function app.order_release_coupon();

revoke execute on function app.coupon_discount(coupons, bigint), app.pos_bill_redeem_coupon(),
  app.order_release_coupon() from public, anon, authenticated;
revoke execute on function pos_set_coupon(uuid, text) from public, anon;
grant execute on function pos_set_coupon(uuid, text) to authenticated;
