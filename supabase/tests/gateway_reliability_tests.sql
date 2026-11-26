-- ZENTRO BuildMart: tests for migration 0017 (webhook event lifecycle, gateway refund send state, ambiguous
-- outcomes, reconciliation and receipt linking). Run after migrations 0001-0017 and the dev seed. Rolled back.

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

-- Places a paid online order for one variant and returns its id.
create or replace function pg_temp.gw_order(p_store uuid, p_owner uuid, p_variant uuid, p_qty integer, p_ref text) returns uuid
language plpgsql as $$
declare
  v_bill uuid; v_res jsonb; v_oid uuid; v_total bigint;
begin
  perform pg_temp.act_as(p_owner);
  v_bill := pos_save_bill(null, p_store, null,
    jsonb_build_array(jsonb_build_object('variant_id', p_variant, 'quantity', p_qty, 'line_discount_paise', 0)), 'gateway ' || p_ref);
  perform pg_temp.reset_session();
  v_res := pos_place_bill(v_bill, p_owner, 'online', 'order_' || p_ref, null);
  v_oid := (v_res ->> 'order_id')::uuid;
  select total_paise into v_total from orders where id = v_oid;
  perform settle_online_payment('razorpay', 'order_' || p_ref, 'pay_' || p_ref, v_total, true, null);
  return v_oid;
end $$;

-- Requests a refund of every unit on an order, as the owner, and returns the create_refund result.
create or replace function pg_temp.full_refund(p_order uuid, p_owner uuid, p_key text) returns jsonb
language plpgsql as $$
declare v_ref jsonb;
begin
  v_ref := create_refund(p_order, (select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity, 'condition', 'restock'))
                                   from order_items where order_id = p_order),
                         'Gateway test', p_key, p_owner);
  return v_ref;
end $$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-0000000000a2';
  owner_b constant uuid := '00000000-0000-4000-8000-0000000000a3';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v1 uuid;
  v_ev jsonb; v_ev_id uuid;
  v_order uuid; v_ref jsonb; v_refund uuid; v_amt bigint;
  v_order2 uuid; v_ref2 jsonb; v_refund2 uuid; v_amt2 bigint; v_before bigint;
  v_order3 uuid; v_ref3 jsonb; v_refund3 uuid;
  v_order4 uuid; v_ref4 jsonb; v_refund4 uuid; v_amt4 bigint;
  v_order5 uuid; v_ref5 jsonb; v_refund5 uuid;
  v_order6 uuid; v_ref6 jsonb; v_refund6 uuid;
  v_msg text; v_state text; v_status text; v_text text;
begin
  select pv.id into v1 from product_variants pv where pv.sku = 'AMB-V001';
  update inventory set on_hand = 50, reserved = 0, damaged = 0 where variant_id = v1;

  -- ---------------------------------------------------------------- webhook lifecycle
  -- W1: a new delivery is processed once; a concurrent delivery is busy; a processed event is not reprocessed.
  v_ev := begin_payment_event('razorpay', 'evt_w1', 'payment.captured', '{"e":"w1"}', true);
  if v_ev ->> 'action' <> 'process' then raise exception 'W1 FAILED: new event not processed (%)', v_ev; end if;
  v_ev_id := (v_ev ->> 'event_id')::uuid;
  if (begin_payment_event('razorpay', 'evt_w1', 'payment.captured', '{"e":"w1"}', true)) ->> 'action' <> 'busy' then
    raise exception 'W1 FAILED: concurrent delivery was not blocked';
  end if;
  if not complete_payment_event(v_ev_id) then raise exception 'W1 FAILED: event not completed'; end if;
  if (begin_payment_event('razorpay', 'evt_w1', 'payment.captured', '{"e":"w1"}', true)) ->> 'action' <> 'processed' then
    raise exception 'W1 FAILED: processed event would run again';
  end if;
  raise notice 'W1 ok: event processed once, concurrent delivery blocked, processed event not repeated';

  -- W2: a failed settlement is retryable, and the attempt count rises.
  v_ev := begin_payment_event('razorpay', 'evt_w2', 'payment.captured', '{"e":"w2"}', true);
  v_ev_id := (v_ev ->> 'event_id')::uuid;
  if not fail_payment_event(v_ev_id, 'database unavailable') then raise exception 'W2 FAILED: failure not recorded'; end if;
  if (select status from payment_events where id = v_ev_id) <> 'failed' then raise exception 'W2 FAILED: status not failed'; end if;
  v_ev := begin_payment_event('razorpay', 'evt_w2', 'payment.captured', '{"e":"w2"}', true);
  if v_ev ->> 'action' <> 'process' or (v_ev ->> 'attempts')::int <> 2 then
    raise exception 'W2 FAILED: failed event not retried as attempt 2 (%)', v_ev;
  end if;
  if not complete_payment_event(v_ev_id) then raise exception 'W2 FAILED: retry not completed'; end if;
  raise notice 'W2 ok: failed event retried as attempt 2 and completed';

  -- W3: a worker that stopped mid-way releases its lease; the event is taken again after the lease expires.
  v_ev := begin_payment_event('razorpay', 'evt_w3', 'payment.captured', '{"e":"w3"}', true);
  update payment_events set lease_until = now() - interval '1 second' where provider_event_id = 'evt_w3';
  v_ev := begin_payment_event('razorpay', 'evt_w3', 'payment.captured', '{"e":"w3"}', true);
  if v_ev ->> 'action' <> 'process' then raise exception 'W3 FAILED: expired lease not reclaimed (%)', v_ev; end if;
  raise notice 'W3 ok: expired lease reclaimed, event processed again';

  -- ---------------------------------------------------------------- gateway send state
  -- G1: one worker is granted the send; a second is refused while the first is in progress.
  v_order := pg_temp.gw_order(store_a, owner_a, v1, 2, 'gw_g1');
  v_ref := pg_temp.full_refund(v_order, owner_a, 'refund-key-gw-g1');
  v_refund := (v_ref ->> 'refund_id')::uuid;
  v_amt := (v_ref ->> 'amount_paise')::bigint;
  if (v_ref ->> 'gateway_refund_needed')::boolean is not true then raise exception 'GW1 FAILED: gateway refund not flagged'; end if;
  v_ev := begin_gateway_refund(v_refund);
  if v_ev ->> 'action' <> 'send' or (v_ev ->> 'attempt')::int <> 1 then raise exception 'GW1 FAILED: first send not granted (%)', v_ev; end if;
  if (begin_gateway_refund(v_refund)) ->> 'action' <> 'busy' then raise exception 'GW1 FAILED: second send not blocked'; end if;
  raise notice 'GW1 ok: one send granted, a concurrent send blocked';

  -- G2: a send that stopped before its outcome was recorded becomes ambiguous and is never sent again automatically.
  update refunds set gateway_lease_until = now() - interval '1 second' where id = v_refund;
  v_ev := begin_gateway_refund(v_refund);
  if v_ev ->> 'action' <> 'blocked' or v_ev ->> 'gateway_state' <> 'ambiguous' then
    raise exception 'GW2 FAILED: interrupted send not marked ambiguous (%)', v_ev;
  end if;
  if (begin_gateway_refund(v_refund)) ->> 'action' <> 'blocked' then raise exception 'GW2 FAILED: ambiguous refund sent again'; end if;
  if (select status from refunds where id = v_refund) <> 'requested' then raise exception 'GW2 FAILED: status changed by ambiguity'; end if;
  -- The units stay reserved while the outcome is unknown.
  v_msg := null;
  begin
    perform create_refund(v_order, jsonb_build_array(jsonb_build_object('order_item_id', (select id from order_items where order_id = v_order limit 1), 'quantity', 1, 'condition', 'restock')),
                          'Second try', 'refund-key-gw-g2b', owner_a);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like 'only % unit(s)%' then raise exception 'GW2 FAILED: units released while the refund is ambiguous (%)', coalesce(v_msg, 'accepted'); end if;
  raise notice 'GW2 ok: interrupted send is ambiguous, never resent, units stay reserved (%)', v_msg;

  -- G3: the reconciled refund is linked to the gateway id; the webhook settles it once and stock returns once.
  if mark_refund_processing(v_refund, 'rfnd_gw_g3') <> 'processing' then raise exception 'GW3 FAILED: link not recorded'; end if;
  if (select gateway_state from refunds where id = v_refund) <> 'sent' then raise exception 'GW3 FAILED: gateway state not sent'; end if;
  v_before := pg_temp.onhand(v1);
  if settle_refund_gateway_event('rfnd_gw_g3', v_refund::text, true, null, v_amt) <> 'succeeded' then
    raise exception 'GW3 FAILED: gateway success not settled';
  end if;
  if pg_temp.onhand(v1) <> v_before + 2 then raise exception 'GW3 FAILED: stock not returned once (% -> %)', v_before, pg_temp.onhand(v1); end if;
  if settle_refund_gateway_event('rfnd_gw_g3', v_refund::text, true, null, v_amt) <> 'duplicate' then
    raise exception 'GW3 FAILED: repeated gateway event applied again';
  end if;
  if pg_temp.onhand(v1) <> v_before + 2 then raise exception 'GW3 FAILED: repeated event moved stock'; end if;
  raise notice 'GW3 ok: reconciled refund linked, settled once, repeat event ignored';

  -- G4: a lost send response. The webhook carries our receipt, so the event links to the refund and settles it.
  v_order2 := pg_temp.gw_order(store_a, owner_a, v1, 1, 'gw_g4');
  v_ref2 := pg_temp.full_refund(v_order2, owner_a, 'refund-key-gw-g4');
  v_refund2 := (v_ref2 ->> 'refund_id')::uuid;
  v_amt2 := (v_ref2 ->> 'amount_paise')::bigint;
  if (begin_gateway_refund(v_refund2)) ->> 'action' <> 'send' then raise exception 'GW4 FAILED: send not granted'; end if;
  if mark_refund_ambiguous(v_refund2, 'connection reset while waiting for response') <> 'ambiguous' then
    raise exception 'GW4 FAILED: ambiguity not recorded';
  end if;
  v_before := pg_temp.onhand(v1);
  if settle_refund_gateway_event('rfnd_gw_g4', v_refund2::text, true, null, v_amt2) <> 'succeeded' then
    raise exception 'GW4 FAILED: receipt-linked event not settled';
  end if;
  if (select provider_refund_id from refunds where id = v_refund2) <> 'rfnd_gw_g4' then
    raise exception 'GW4 FAILED: gateway id not stored from the event';
  end if;
  if pg_temp.onhand(v1) <> v_before + 1 then raise exception 'GW4 FAILED: stock not returned exactly once'; end if;
  if settle_refund_gateway_event('rfnd_gw_unknown', 'not-a-refund', true, null, v_amt2) <> 'unknown' then
    raise exception 'GW4 FAILED: unmatched event was not reported as unknown';
  end if;
  raise notice 'GW4 ok: lost-response refund linked by receipt, settled once, unmatched event changes nothing';

  -- G5: a refund that is ambiguous cannot be failed directly.
  v_order3 := pg_temp.gw_order(store_a, owner_a, v1, 1, 'gw_g5');
  v_ref3 := pg_temp.full_refund(v_order3, owner_a, 'refund-key-gw-g5');
  v_refund3 := (v_ref3 ->> 'refund_id')::uuid;
  perform mark_refund_ambiguous(v_refund3, 'timeout');
  v_msg := null;
  begin perform fail_refund(v_refund3, 'refused'); exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like '%must be reconciled first%' then
    raise exception 'GW5 FAILED: ambiguous refund failed without reconciliation (%)', coalesce(v_msg, 'accepted');
  end if;
  raise notice 'GW5 ok: ambiguous refund cannot be failed without reconciliation';

  -- G6: authorised recovery. Only a store manager can confirm that the gateway holds no refund; units are then released.
  v_msg := null;
  begin perform reconcile_refund_not_sent(v_refund3, owner_b, 'checked the list, nothing there', true); exception when sqlstate '42501' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'GW6 FAILED: another store could reconcile this refund'; end if;
  v_msg := null;
  begin perform reconcile_refund_not_sent(v_refund3, owner_a, ' ', true); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'GW6 FAILED: confirmation without a reason accepted'; end if;
  v_msg := null;
  begin perform reconcile_refund_not_sent(v_refund3, owner_a, 'checked too early', true); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'GW6 FAILED: confirmation accepted before the waiting period'; end if;
  perform log_refund_reconciliation(v_refund3, owner_a, 'not_found', '{}'::jsonb);
  if (select count(*) from audit_logs where action = 'refund.reconciled' and entity_id = v_refund3) <> 1 then
    raise exception 'GW6 FAILED: reconciliation check not audited';
  end if;
  v_msg := null;
  begin perform reconcile_refund_not_sent(v_refund3, owner_a, 'no attestation given', false); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'GW6 FAILED: confirmation accepted without the dashboard attestation'; end if;
  update refunds set gateway_ambiguous_at = now() - interval '20 minutes' where id = v_refund3;
  if reconcile_refund_not_sent(v_refund3, owner_a, 'gateway list has no refund for this request', true) <> 'failed' then
    raise exception 'GW6 FAILED: confirmation not recorded';
  end if;
  if (select status from refunds where id = v_refund3) <> 'failed' then raise exception 'GW6 FAILED: refund not failed'; end if;
  if (select count(*) from audit_logs where action = 'refund.confirmed_not_sent' and entity_id = v_refund3) <> 1 then
    raise exception 'GW6 FAILED: confirmation not audited';
  end if;
  v_ref5 := pg_temp.full_refund(v_order3, owner_a, 'refund-key-gw-g6b');
  if (v_ref5 ->> 'status') <> 'requested' then raise exception 'GW6 FAILED: units not released after confirmation (%)', v_ref5; end if;
  raise notice 'GW6 ok: only a store manager can confirm; early and unreasoned confirmations refused; checks and confirmation audited; units released';

  -- G7: a refund that Razorpay has accepted cannot be confirmed as not sent.
  v_order4 := pg_temp.gw_order(store_a, owner_a, v1, 1, 'gw_g7');
  v_ref4 := pg_temp.full_refund(v_order4, owner_a, 'refund-key-gw-g7');
  v_refund4 := (v_ref4 ->> 'refund_id')::uuid;
  perform begin_gateway_refund(v_refund4);
  perform mark_refund_processing(v_refund4, 'rfnd_gw_g7');
  v_msg := null;
  begin perform reconcile_refund_not_sent(v_refund4, owner_a, 'should not be allowed', true); exception when sqlstate 'P0001' then v_msg := 'refused'; end;
  if v_msg is distinct from 'refused' then raise exception 'GW7 FAILED: accepted refund confirmed as not sent'; end if;
  raise notice 'GW7 ok: a refund accepted by the gateway cannot be confirmed as not sent';

  raise notice 'Gateway reliability tests: all groups passed';
end $$;

rollback;
