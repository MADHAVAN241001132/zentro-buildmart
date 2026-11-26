-- ZENTRO BuildMart: tests for migration 0018 (guest refund requests, owner review, approval through create_refund).
-- Run after migrations 0001-0018 and the dev seed. Rolled back.

begin;

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

create or replace function pg_temp.onhand(p_var uuid) returns bigint
language sql as $$ select on_hand from inventory where variant_id = p_var $$;

-- A paid cash sale turned into a guest online order belonging to one guest session.
create or replace function pg_temp.guest_order(p_store uuid, p_owner uuid, p_variant uuid, p_qty integer, p_ref text, p_session uuid)
returns uuid
language plpgsql as $$
declare
  v_bill uuid; v_res jsonb; v_oid uuid;
begin
  perform pg_temp.act_as(p_owner);
  v_bill := pos_save_bill(null, p_store, null,
    jsonb_build_array(jsonb_build_object('variant_id', p_variant, 'quantity', p_qty, 'line_discount_paise', 0)), 'guest ' || p_ref);
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, p_owner, 'cash', null, null);
  v_oid := (v_res ->> 'order_id')::uuid;
  update orders set channel = 'online', guest_session_id = p_session where id = v_oid;
  return v_oid;
end $$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  owner_b constant uuid := '00000000-0000-4000-8000-0000000000a3';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v1 uuid;
  v_sess uuid; v_other uuid;
  v_order uuid; v_item uuid; v_rq1 uuid; v_rq2 uuid; v_rq3 uuid;
  v_ref jsonb; v_refund uuid; v_before bigint; v_msg text; v_status text; v_pending integer; v_committed integer;
begin
  select pv.id into v1 from product_variants pv where pv.sku = 'AMB-V001';
  update inventory set on_hand = 50, reserved = 0, damaged = 0 where variant_id = v1;

  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, repeat('c', 64), now() + interval '1 day') returning id into v_sess;
  insert into guest_sessions (store_id, token_hash, expires_at)
  values (store_a, repeat('d', 64), now() + interval '1 day') returning id into v_other;

  v_order := pg_temp.guest_order(store_a, owner_a, v1, 3, 'rr', v_sess);
  select id into v_item from order_items where order_id = v_order;

  -- RR1: another guest's session cannot see or request this order.
  v_msg := null;
  begin
    perform submit_guest_refund_request(store_a, v_order, v_other, 'damaged', 'Cracked on arrival', jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)));
  exception when sqlstate 'P0002' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'RR1 FAILED: another guest could request a refund'; end if;
  raise notice 'RR1 ok: another guest session cannot request a refund for this order';

  -- RR2: a quantity above what remains is refused.
  v_msg := null;
  begin
    perform submit_guest_refund_request(store_a, v_order, v_sess, 'damaged', 'Cracked on arrival', jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 4)));
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'only 3 unit(s)%' then raise exception 'RR2 FAILED: excess quantity accepted (%)', coalesce(v_msg, 'accepted'); end if;
  raise notice 'RR2 ok: excess quantity refused (%)', v_msg;

  -- RR3: a valid request is stored as submitted and reserves its quantity in the remaining figures.
  v_rq1 := submit_guest_refund_request(store_a, v_order, v_sess, 'damaged', 'Cracked on arrival', jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 2)));
  select status into v_status from refund_requests where id = v_rq1;
  select pending_requests, remaining into v_pending, v_committed from app.refund_remaining(v_order) where order_item_id = v_item;
  if v_status <> 'submitted' or v_pending <> 2 or v_committed <> 1 then
    raise exception 'RR3 FAILED: status % pending % remaining %', v_status, v_pending, v_committed;
  end if;
  raise notice 'RR3 ok: request submitted and reserves its quantity';

  -- RR4: a second open request for the same order is refused.
  v_msg := null;
  begin
    perform submit_guest_refund_request(store_a, v_order, v_sess, 'changed_mind', 'Changed my mind', jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)));
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%already waiting%' then raise exception 'RR4 FAILED: second open request accepted'; end if;
  raise notice 'RR4 ok: second open request refused';

  -- RR5: only the owning guest can withdraw; after withdrawal the order can be requested again.
  v_msg := null;
  begin perform withdraw_guest_refund_request(v_rq1, v_other); exception when sqlstate 'P0002' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'RR5 FAILED: another guest withdrew the request'; end if;
  if withdraw_guest_refund_request(v_rq1, v_sess) <> 'withdrawn' then raise exception 'RR5 FAILED: withdrawal not recorded'; end if;
  v_rq2 := submit_guest_refund_request(store_a, v_order, v_sess, 'wrong_item', 'Different colour', jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)));
  raise notice 'RR5 ok: only the owning guest withdraws; the order can be requested again';

  -- RR6: a guest cannot approve. Approval and execution are server-only.
  v_msg := null;
  begin perform pg_temp.act_as(owner_a); perform approve_refund_request(v_rq2, owner_a, null); exception when sqlstate '42501' then v_msg := 'refused'; end;
  perform pg_temp.reset_session();
  if v_msg is distinct from 'refused' then raise exception 'RR6 FAILED: an authenticated caller approved a request'; end if;
  raise notice 'RR6 ok: approval is refused outside the server path';

  -- RR7: a manager of another store cannot decide this request.
  v_msg := null;
  begin perform begin_refund_request_review(v_rq2, owner_b); exception when sqlstate '42501' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'RR7 FAILED: another store could review the request'; end if;
  raise notice 'RR7 ok: another store cannot review the request';

  -- RR8: an approval creates the refund through create_refund, keyed by the request id, and links it. Cash restocks at once.
  if (begin_refund_request_review(v_rq2, owner_a)) ->> 'status' <> 'submitted' then raise exception 'RR8 FAILED: review not open'; end if;
  v_before := pg_temp.onhand(v1);
  v_ref := create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1, 'condition', 'restock')),
                         'Guest request: wrong item', v_rq2::text, owner_a);
  v_refund := (v_ref ->> 'refund_id')::uuid;
  if approve_refund_request(v_rq2, owner_a, v_refund, 'Approved after review') <> 'approved' then raise exception 'RR8 FAILED: approval not recorded'; end if;
  if approve_refund_request(v_rq2, owner_a, v_refund, 'retry') <> 'approved' then raise exception 'RR8 FAILED: approval retry not idempotent'; end if;
  -- A retry of the refund itself, with the same request key, returns the same refund and creates nothing new.
  v_ref := create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1, 'condition', 'restock')),
                         'Guest request: wrong item', v_rq2::text, owner_a);
  if (v_ref ->> 'replayed')::boolean is not true or (v_ref ->> 'refund_id')::uuid <> v_refund then
    raise exception 'RR8 FAILED: retried approval created another refund';
  end if;
  if pg_temp.onhand(v1) <> v_before + 1 then raise exception 'RR8 FAILED: stock not returned once'; end if;
  if (select status from refund_requests where id = v_rq2) <> 'approved' then raise exception 'RR8 FAILED: request not approved'; end if;
  if (select count(*) from audit_logs where action = 'refund_request.approved' and entity_id = v_rq2) <> 1 then
    raise exception 'RR8 FAILED: approvals not audited';
  end if;
  raise notice 'RR8 ok: approval links one refund, retries change nothing, stock returned once, audited';

  -- RR9: an approved request cannot be approved with a different refund, rejected, or withdrawn.
  v_msg := null;
  begin perform approve_refund_request(v_rq2, owner_a, (select id from refunds where order_id = v_order and id <> v_refund limit 1)); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'RR9 FAILED: approved request re-linked'; end if;
  v_msg := null;
  begin perform reject_refund_request(v_rq2, owner_a, 'too late to reject'); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'RR9 FAILED: approved request rejected'; end if;
  v_msg := null;
  begin perform withdraw_guest_refund_request(v_rq2, v_sess); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'RR9 FAILED: approved request withdrawn'; end if;
  raise notice 'RR9 ok: decided requests cannot be changed';

  -- RR10: a rejection needs a reason from a manager, and frees the quantity.
  v_rq3 := submit_guest_refund_request(store_a, v_order, v_sess, 'not_as_described', 'Not what the photo showed', jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)));
  v_msg := null;
  begin perform reject_refund_request(v_rq3, owner_a, ' '); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'RR10 FAILED: rejection without a reason accepted'; end if;
  if reject_refund_request(v_rq3, owner_a, 'Checked the item; it matches the listing') <> 'rejected' then
    raise exception 'RR10 FAILED: rejection not recorded';
  end if;
  select pending_requests into v_pending from app.refund_remaining(v_order) where order_item_id = v_item;
  if v_pending <> 0 then raise exception 'RR10 FAILED: rejected request still holds quantity (%)', v_pending; end if;
  raise notice 'RR10 ok: rejection needs a reason and releases the quantity';

  -- RR11: the 7-day window closes requests on older orders.
  update orders set paid_at = now() - interval '8 days' where id = v_order;
  v_msg := null;
  begin
    perform submit_guest_refund_request(store_a, v_order, v_sess, 'other', 'Late request', jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)));
  exception when sqlstate 'P0001' then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%7-day%' then raise exception 'RR11 FAILED: request accepted after the window (%)', coalesce(v_msg, 'accepted'); end if;
  raise notice 'RR11 ok: request refused after the 7-day window';

  raise notice 'Guest refund request tests: all groups passed';
end $$;

rollback;
