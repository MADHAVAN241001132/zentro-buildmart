-- ZENTRO BuildMart: tests for migration 0014 (coupons on POS bills, line allocation, redemption, release).
-- Run after migrations 0001-0014 and the dev seed. Rolled back at the end.

begin;

create or replace function pg_temp.try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

create or replace function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user::text)::text, true);
end $$;

create or replace function pg_temp.reset_session() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_var uuid; v_price bigint; v_gst integer;
  v_var2 uuid; v_price2 bigint; v_gst2 integer;
  v_coupon uuid; v_min_coupon uuid;
  v_bill uuid; v_bill2 uuid;
  v_quote jsonb; v_res jsonb; v_order uuid;
  v_s bigint; v_d bigint; v_line jsonb; v_sum_alloc bigint := 0;
  v_gross bigint; v_disc bigint; v_taxable bigint; v_tax bigint; v_total bigint;
  v_used integer; v_redemptions integer; v_msg text;
  v_order_discount bigint;
begin
  select pv.id, pv.sale_price_paise, pr.gst_rate_bps into v_var, v_price, v_gst
    from product_variants pv join products pr on pr.id = pv.product_id where pv.sku = 'AMB-V001';
  select pv.id, pv.sale_price_paise, pr.gst_rate_bps into v_var2, v_price2, v_gst2
    from product_variants pv join products pr on pr.id = pv.product_id
   where pv.store_id = store_a and pv.is_active and pv.id <> v_var order by pv.sku limit 1;
  if v_var2 is null then raise exception 'coupon tests need a second active variant in store A'; end if;
  update inventory set on_hand = 50, reserved = 0 where variant_id in (v_var, v_var2);

  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, max_uses, is_active)
  values (store_a, 'ZPOS10', 'percent', 1000, 0, 1, true) returning id into v_coupon;
  insert into coupons (store_id, code, discount_type, discount_bps, min_order_paise, is_active)
  values (store_a, 'ZMIN', 'percent', 1000, 1000000000, true) returning id into v_min_coupon;

  -- A held bill with two lines: 3 units of AMB-V001 and 1 unit of a second variant.
  perform pg_temp.act_as(owner_a);
  v_bill := pos_save_bill(null, store_a, null, jsonb_build_array(
    jsonb_build_object('variant_id', v_var, 'quantity', 3, 'line_discount_paise', 0),
    jsonb_build_object('variant_id', v_var2, 'quantity', 1, 'line_discount_paise', 0)), 'coupon test');
  v_quote := pos_set_coupon(v_bill, 'zpos10');
  perform pg_temp.reset_session();

  v_s := 3 * v_price + v_price2;
  v_d := round(v_s * 0.10)::bigint;

  -- K1: the coupon discount is the percentage of the subtotal, allocated across lines, and GST is per line on the taxable value.
  if (v_quote ->> 'coupon_discount_paise')::bigint <> v_d then
    raise exception 'K1 FAILED: coupon discount % expected %', v_quote ->> 'coupon_discount_paise', v_d;
  end if;
  v_sum_alloc := 0;
  for v_line in select * from jsonb_array_elements(v_quote -> 'lines') loop
    v_gross := (v_line ->> 'gross_paise')::bigint;
    v_disc := (v_line ->> 'discount_paise')::bigint;
    v_taxable := (v_line ->> 'taxable_paise')::bigint;
    v_tax := (v_line ->> 'tax_paise')::bigint;
    v_sum_alloc := v_sum_alloc + (v_line ->> 'coupon_discount_paise')::bigint;
    if v_taxable <> v_gross - v_disc then raise exception 'K1 FAILED: taxable does not equal gross less discount'; end if;
    if v_tax <> round(v_taxable * (v_line ->> 'gst_rate_bps')::integer / 10000.0)::bigint then
      raise exception 'K1 FAILED: GST not computed on the discounted taxable value';
    end if;
  end loop;
  if v_sum_alloc <> v_d then raise exception 'K1 FAILED: allocated % of %', v_sum_alloc, v_d; end if;
  if (v_quote ->> 'subtotal_paise')::bigint - (v_quote ->> 'discount_paise')::bigint + (v_quote ->> 'tax_paise')::bigint
     <> (v_quote ->> 'total_paise')::bigint then
    raise exception 'K1 FAILED: totals do not reconcile';
  end if;
  raise notice 'K1 ok: coupon % allocated across two lines, GST per line on the discounted value', v_d;

  -- K2: placing the bill (cash) writes the discounted order, one redemption, and counts the use.
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, owner_a, 'cash', null, null);
  v_order := (v_res ->> 'order_id')::uuid;
  select discount_paise into v_order_discount from orders where id = v_order;
  if v_order_discount <> v_d then raise exception 'K2 FAILED: order discount % expected %', v_order_discount, v_d; end if;
  select used_count into v_used from coupons where id = v_coupon;
  select count(*) into v_redemptions from coupon_redemptions where order_id = v_order and discount_paise = v_d;
  if v_used <> 1 or v_redemptions <> 1 then raise exception 'K2 FAILED: used % redemptions %', v_used, v_redemptions; end if;
  raise notice 'K2 ok: order carries the discount; one redemption recorded and counted';

  -- K3: the single-use coupon cannot be applied to another bill.
  perform pg_temp.act_as(owner_a);
  v_bill2 := pos_save_bill(null, store_a, null,
    jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1, 'line_discount_paise', 0)), null);
  v_msg := pg_temp.try(format('select pos_set_coupon(%L, %L)', v_bill2, 'ZPOS10'));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'K3 FAILED: fully used coupon applied again'; end if;
  raise notice 'K3 ok: fully used coupon refused (%)', v_msg;

  -- K4: a coupon whose minimum order is not met is refused on the bill.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select pos_set_coupon(%L, %L)', v_bill2, 'ZMIN'));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'K4 FAILED: minimum order ignored'; end if;
  raise notice 'K4 ok: minimum order enforced on POS bills';

  -- K5: cancelling the order releases the redemption and the code can be used again.
  update orders set order_status = 'CANCELLED', cancel_reason = 'test release' where id = v_order;
  select used_count into v_used from coupons where id = v_coupon;
  select count(*) into v_redemptions from coupon_redemptions where order_id = v_order;
  if v_used <> 0 or v_redemptions <> 0 then raise exception 'K5 FAILED: release left used % redemptions %', v_used, v_redemptions; end if;
  perform pg_temp.act_as(owner_a);
  v_quote := pos_set_coupon(v_bill2, 'ZPOS10');
  perform pg_temp.reset_session();
  if (v_quote ->> 'coupon_discount_paise')::bigint <> round(v_price * 0.10)::bigint then
    raise exception 'K5 FAILED: released coupon did not apply';
  end if;
  raise notice 'K5 ok: cancelled order releases its coupon use';

  -- K6: coupons cannot change on a bill that is already placed.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format('select pos_set_coupon(%L, %L)', v_bill, 'ZPOS10'));
  perform pg_temp.reset_session();
  if left(v_msg, 5) = 'ok' then raise exception 'K6 FAILED: placed bill coupon changed'; end if;
  raise notice 'K6 ok: placed bills keep their coupon (%)', v_msg;

  raise notice 'Coupon POS tests: all groups passed';
end $$;

rollback;
