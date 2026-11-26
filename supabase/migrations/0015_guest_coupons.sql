-- 0015: coupons on Guest carts and checkout.
-- The guest cart is priced with the same rules as POS: app.coupon_discount on the cart subtotal, then the
-- discount is allocated across lines with the same largest-remainder rule as app.price_pos_bill (earlier lines
-- take the leftover paise). GST is then computed per line in the application on the discounted taxable value,
-- so a basket gets identical line discounts and GST in both channels.
-- Both functions are server-only (service role through the admin client). Redemption is written only after the
-- stock reservation succeeds, and the redemption unique key on order_id prevents a second use of the same order.

create or replace function app.cart_coupon_allocation(p_cart uuid, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_store uuid;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  c coupons%rowtype;
  r record;
  v_ids uuid[] := '{}';
  v_pre bigint[] := '{}';
  v_alloc bigint[] := '{}';
  v_s bigint := 0;
  v_d bigint := 0;
  v_sum bigint := 0;
  v_rem bigint;
  v_n integer;
  v_i integer;
  v_out jsonb := '[]'::jsonb;
begin
  select store_id into v_store from carts where id = p_cart;
  if not found then raise exception 'cart not found' using errcode = 'P0002'; end if;

  for r in
    select ci.id, round(ci.quantity * pv.sale_price_paise)::bigint as gross
    from cart_items ci
    join product_variants pv on pv.id = ci.variant_id
    where ci.cart_id = p_cart
    order by ci.created_at, ci.id
  loop
    v_ids := v_ids || r.id;
    v_pre := v_pre || r.gross;
    v_s := v_s + r.gross;
  end loop;
  v_n := coalesce(array_length(v_ids, 1), 0);

  if v_code is not null then
    select * into c from coupons where store_id = v_store and code = v_code;
    if not found then raise exception 'coupon code not recognised' using errcode = 'P0001'; end if;
    -- Lock the coupon row so concurrent checkouts read a consistent used_count.
    select * into c from coupons where id = c.id for update;
    v_d := app.coupon_discount(c, v_s);
  end if;

  for v_i in 1..v_n loop
    v_alloc := v_alloc || (case when v_d > 0 and v_s > 0
                                then floor(v_d::numeric * v_pre[v_i] / v_s)::bigint
                                else 0 end);
    v_sum := v_sum + v_alloc[v_i];
  end loop;
  v_rem := v_d - v_sum;
  for v_i in 1..v_n loop
    exit when v_rem <= 0;
    if v_pre[v_i] - v_alloc[v_i] > 0 then
      v_alloc[v_i] := v_alloc[v_i] + 1;
      v_rem := v_rem - 1;
    end if;
  end loop;
  if v_rem <> 0 then raise exception 'the coupon could not be allocated to the lines' using errcode = 'P0001'; end if;

  for v_i in 1..v_n loop
    v_out := v_out || jsonb_build_object(
      'cart_item_id', v_ids[v_i],
      'gross_paise', v_pre[v_i],
      'discount_paise', v_alloc[v_i]);
  end loop;

  return jsonb_build_object(
    'coupon_id', c.id,
    'coupon_code', c.code,
    'subtotal_paise', v_s,
    'discount_paise', v_d,
    'lines', v_out);
end $$;

-- Server-only quote for a guest cart. Returns the coupon, the total discount and each cart line's share.
create or replace function public.guest_cart_coupon_quote(p_cart uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  return app.cart_coupon_allocation(p_cart, p_code);
end $$;

-- Server-only. Called after the order's stock is reserved. Locks the coupon, re-derives the discount from the order's
-- subtotal, refuses any mismatch with the stored order discount, and writes one redemption.
create or replace function public.guest_redeem_coupon(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  c coupons%rowtype;
  v_d bigint;
begin
  if not app.is_server() then raise exception 'server-only' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.coupon_code is null or btrim(o.coupon_code) = '' then
    return jsonb_build_object('redeemed', false);
  end if;

  select * into c from coupons where store_id = o.store_id and code = upper(btrim(o.coupon_code)) for update;
  if not found then raise exception 'coupon code not recognised' using errcode = 'P0001'; end if;
  v_d := app.coupon_discount(c, o.subtotal_paise);
  if v_d <> o.discount_paise then
    raise exception 'the coupon no longer gives this discount; review your cart' using errcode = 'P0001';
  end if;

  insert into coupon_redemptions (store_id, coupon_id, order_id, discount_paise)
  values (o.store_id, c.id, o.id, v_d);
  update coupons set used_count = used_count + 1 where id = c.id;
  return jsonb_build_object('redeemed', true, 'coupon_id', c.id, 'discount_paise', v_d);
end $$;

revoke execute on function app.cart_coupon_allocation(uuid, text) from public, anon, authenticated;
revoke execute on function public.guest_cart_coupon_quote(uuid, text) from public, anon, authenticated;
revoke execute on function public.guest_redeem_coupon(uuid) from public, anon, authenticated;
