-- ZENTRO BuildMart: tests for migration 0015 (coupons on Guest carts and checkout).
-- Run after migrations 0001-0015 and the dev seed. Rolled back at the end.

begin;

create or replace function pg_temp.try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

do $$
declare
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_var uuid; v_price bigint;
  v_var2 uuid; v_price2 bigint;
  v_sess uuid; v_cart uuid;
  v_coupon uuid;
  v_q jsonb; v_line jsonb; v_sum bigint := 0;
  v_s bigint; v_d bigint;
  v_pos_bill uuid; v_pos_quote jsonb; v_pos_line jsonb;
  v_order uuid; v_msg text;
  v_used integer; v_red integer; v_redeem jsonb;
  v_bad_order uuid;
begin
  select pv.id, pv.sale_price_paise into v_var, v_price from product_variants pv where pv.sku = 'AMB-V001';
  select pv.id, pv.sale_price_paise into v_var2, v_price2
    from product_variants pv where pv.store_id = store_a and pv.is_active and pv.id <> v_var order by pv.sku limit 1;
  update inventory set on_hand = 50, reserved = 0 where variant_id in (v_var, v_var2);

  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, is_active)
  values (store_a, 'ZGUEST10', 'percent', 1000, 0, true) returning id into v_coupon;

  -- A guest session and cart with the same basket used in coupon_pos_tests: 3 x AMB-V001 and 1 x the second variant.
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, repeat('a', 64), now() + interval '1 day') returning id into v_sess;
  insert into carts (store_id, guest_session_id, status) values (store_a, v_sess, 'active') returning id into v_cart;
  insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, store_a, v_var, 3);
  insert into cart_items (cart_id, store_id, variant_id, quantity, created_at) values (v_cart, store_a, v_var2, 1, now() + interval '1 second');

  v_s := 3 * v_price + v_price2;
  v_d := round(v_s * 0.10)::bigint;

  -- G1: the guest allocation sums to the coupon discount, and each line matches the POS allocation for the same basket.
  v_q := guest_cart_coupon_quote(v_cart, 'zguest10');
  if (v_q ->> 'discount_paise')::bigint <> v_d then raise exception 'G1 FAILED: discount % expected %', v_q ->> 'discount_paise', v_d; end if;
  for v_line in select * from jsonb_array_elements(v_q -> 'lines') loop
    v_sum := v_sum + (v_line ->> 'discount_paise')::bigint;
  end loop;
  if v_sum <> v_d then raise exception 'G1 FAILED: lines allocate % of %', v_sum, v_d; end if;

  -- POS bill for the same basket and coupon, priced with the database POS rule.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', '00000000-0000-4000-8000-0000000000a2')::text, true);
  set local role authenticated;
  v_pos_bill := pos_save_bill(null, store_a, null, jsonb_build_array(
    jsonb_build_object('variant_id', v_var, 'quantity', 3, 'line_discount_paise', 0),
    jsonb_build_object('variant_id', v_var2, 'quantity', 1, 'line_discount_paise', 0)), 'guest parity');
  perform pos_set_coupon(v_pos_bill, 'ZGUEST10');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_pos_quote := app.price_pos_bill(v_pos_bill);

  for v_line in select * from jsonb_array_elements(v_q -> 'lines') loop
    select l.value into v_pos_line
      from jsonb_array_elements(v_pos_quote -> 'lines') as l(value)
     where (l.value ->> 'variant_id')::uuid = (select variant_id from cart_items where id = (v_line ->> 'cart_item_id')::uuid);
    if (v_pos_line ->> 'coupon_discount_paise')::bigint <> (v_line ->> 'discount_paise')::bigint then
      raise exception 'G1 FAILED: guest line share % differs from POS share %',
        v_line ->> 'discount_paise', v_pos_line ->> 'coupon_discount_paise';
    end if;
  end loop;
  raise notice 'G1 ok: guest allocation sums to % and matches the POS allocation line by line', v_d;

  -- G2: a coupon code that does not exist, or a blank code, is handled without changing the cart.
  v_msg := pg_temp.try(format('select guest_cart_coupon_quote(%L, %L)', v_cart, 'NOPE'));
  if left(v_msg, 5) = 'ok' then raise exception 'G2 FAILED: unknown code accepted'; end if;
  v_q := guest_cart_coupon_quote(v_cart, '   ');
  if (v_q ->> 'discount_paise')::bigint <> 0 or v_q -> 'coupon_code' <> 'null'::jsonb then
    raise exception 'G2 FAILED: blank code produced a discount';
  end if;
  raise notice 'G2 ok: unknown codes refused, blank code gives no discount (%)', v_msg;

  -- G3: an exhausted coupon is refused on the guest cart.
  update coupons set max_uses = 1, used_count = 1 where id = v_coupon;
  v_msg := pg_temp.try(format('select guest_cart_coupon_quote(%L, %L)', v_cart, 'ZGUEST10'));
  if left(v_msg, 5) = 'ok' then raise exception 'G3 FAILED: exhausted coupon accepted on the cart'; end if;
  update coupons set max_uses = null, used_count = 0 where id = v_coupon;
  raise notice 'G3 ok: exhausted coupon refused on the guest cart (%)', v_msg;

  -- G4: redemption writes one row and counts one use. A second redemption of the same order is refused.
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise, coupon_code)
  values (store_a, 'TEST-GC-1', 'online', 'Guest Coupon Test', 'pickup', 'online', 'PENDING', 'PLACED',
          v_s, v_d, v_s - v_d, 0, 0, v_s - v_d, 'ZGUEST10')
  returning id into v_order;
  v_redeem := guest_redeem_coupon(v_order);
  select used_count into v_used from coupons where id = v_coupon;
  select count(*) into v_red from coupon_redemptions where order_id = v_order and discount_paise = v_d;
  if v_used <> 1 or v_red <> 1 or (v_redeem ->> 'redeemed') <> 'true' then
    raise exception 'G4 FAILED: used % redemptions %', v_used, v_red;
  end if;
  v_msg := pg_temp.try(format('select guest_redeem_coupon(%L)', v_order));
  if left(v_msg, 5) = 'ok' then raise exception 'G4 FAILED: second redemption accepted'; end if;
  raise notice 'G4 ok: one redemption per order, second attempt refused (%)', v_msg;

  -- G5: a discount that does not match the stored order discount is refused and writes nothing.
  insert into orders (store_id, order_number, channel, customer_name, fulfilment, payment_method, payment_status,
                      order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise, coupon_code)
  values (store_a, 'TEST-GC-2', 'online', 'Guest Coupon Mismatch', 'pickup', 'online', 'PENDING', 'PLACED',
          v_s, v_d + 1, v_s - v_d - 1, 0, 0, v_s - v_d - 1, 'ZGUEST10')
  returning id into v_bad_order;
  v_msg := pg_temp.try(format('select guest_redeem_coupon(%L)', v_bad_order));
  select count(*) into v_red from coupon_redemptions where order_id = v_bad_order;
  if left(v_msg, 5) = 'ok' or v_red <> 0 then raise exception 'G5 FAILED: mismatched discount redeemed'; end if;
  raise notice 'G5 ok: mismatched discount refused, nothing recorded (%)', v_msg;

  -- G6: cancelling the guest order releases the coupon use.
  update orders set order_status = 'CANCELLED', cancel_reason = 'test release' where id = v_order;
  select used_count into v_used from coupons where id = v_coupon;
  if v_used <> 0 then raise exception 'G6 FAILED: cancelled guest order kept the use (used %)', v_used; end if;
  raise notice 'G6 ok: cancelled guest order releases its coupon use';

  raise notice 'Guest coupon tests: all groups passed';
end $$;

rollback;
