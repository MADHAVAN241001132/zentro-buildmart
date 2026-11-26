-- Idempotency and lease tests (rolled back). IK1-IK6.
-- Covers migration 0028: keyed quotation requests, per-line step records and fenced claim takeover.
\set ON_ERROR_STOP on
begin;
do $$
declare
  s uuid; v1 uuid; other_store uuid; other_variant uuid;
  sess uuid; other_sess uuid; q1 uuid; q2 uuid; q3 uuid; req uuid; n int; upd int;
  payload jsonb;
begin
  select pv.store_id, pv.id into s, v1 from product_variants pv where pv.is_active order by pv.id limit 1;
  if s is null then raise exception 'IK0 needs a seeded active variant'; end if;
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('e', 64), now() + interval '1 day') returning id into sess;
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('f', 64), now() + interval '1 day') returning id into other_sess;

  payload := jsonb_build_object(
    'customer_name', 'Ravi Kumar', 'customer_mobile', '9000000011',
    'project_name', 'Idempotency check',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', v1, 'quantity', 2)));

  -- K1: the same key returns the same quotation; only one is created.
  q1 := planner_quotation_request(s, sess, payload, 'key-k1-0001');
  q2 := planner_quotation_request(s, sess, payload, 'key-k1-0001');
  if q1 is distinct from q2 then raise exception 'IK1 failed: retry created a second quotation'; end if;
  select count(*) into n from quotations where store_id = s and guest_request_key = 'key-k1-0001';
  if n <> 1 then raise exception 'IK1 failed: expected one quotation for the key, found %', n; end if;
  raise notice 'IK1 ok: keyed quotation request is created once';

  -- K2: a different key creates a different quotation.
  q3 := planner_quotation_request(s, sess, payload, 'key-k2-0002');
  if q3 = q1 then raise exception 'IK2 failed: a new key reused an old quotation'; end if;
  raise notice 'IK2 ok: distinct keys create distinct quotations';

  -- K3: a key used by another guest session is refused, and nothing is written for it.
  begin
    perform planner_quotation_request(s, other_sess, payload, 'key-k1-0001');
    raise exception 'IK3 failed: another session reused the key';
  exception when sqlstate '42501' then
    null;
  end;
  raise notice 'IK3 ok: keys are scoped to the guest session';

  -- K4: a key shorter than 8 characters is refused.
  begin
    perform planner_quotation_request(s, sess, payload, 'short');
    raise exception 'IK4 failed: short key accepted';
  exception when sqlstate '22023' then
    null;
  end;
  raise notice 'IK4 ok: request key length enforced';

  -- K5: one step record per request and line index; a second record for the same index is refused.
  insert into guest_request_keys (store_id, guest_session_id, kind, request_key, status, attempt, lease_expires_at)
    values (s, sess, 'planner_cart', 'key-k5-0005', 'pending', 1, now() + interval '3 minutes') returning id into req;
  insert into guest_request_steps (request_id, step_index, status, variant_id, quantity)
    values (req, 0, 'started', v1, 1);
  begin
    insert into guest_request_steps (request_id, step_index, status, variant_id, quantity)
      values (req, 0, 'started', v1, 1);
    raise exception 'IK5 failed: duplicate step accepted';
  exception when unique_violation then
    null;
  end;
  raise notice 'IK5 ok: each cart line has one step record per request';

  -- K6: reclaiming a claim is a compare-and-swap on the attempt number. The first reclaim wins;
  -- a second attempt based on the old attempt number changes nothing.
  update guest_request_keys set attempt = 2 where id = req and attempt = 1;
  get diagnostics upd = row_count;
  if upd <> 1 then raise exception 'IK6 failed: first reclaim did not apply'; end if;
  update guest_request_keys set attempt = 2 where id = req and attempt = 1;
  get diagnostics upd = row_count;
  if upd <> 0 then raise exception 'IK6 failed: stale reclaim applied'; end if;
  raise notice 'IK6 ok: stale reclaim cannot overwrite a newer attempt';
end $$;
rollback;
