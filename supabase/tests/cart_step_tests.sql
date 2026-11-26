-- ZENTRO BuildMart: atomic cart steps (migration 0056). C1-C10. Simulated; rolled back.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.step(p_store uuid, p_sess uuid, p_req uuid, p_attempt integer, p_index integer,
  p_variant uuid, p_qty integer)
returns jsonb language plpgsql as $$
begin
  return public.guest_cart_add_step(p_store, p_sess, p_req, p_attempt, p_index, p_variant, p_qty);
end $$;

create or replace function pg_temp.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

do $$
declare
  s uuid; v uuid; sess uuid; req uuid; other_sess uuid; res jsonb; qty numeric; n integer; msg text;
begin
  select pv.store_id, pv.id into s, v from product_variants pv where pv.is_active order by pv.id limit 1;
  if s is null then raise exception 'C0 needs a seeded active variant'; end if;
  update inventory set on_hand = 10, reserved = 0 where variant_id = v;

  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('e', 64), now() + interval '1 day') returning id into sess;
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('f', 64), now() + interval '1 day') returning id into other_sess;
  insert into guest_request_keys (store_id, guest_session_id, kind, request_key, attempt, lease_expires_at)
    values (s, sess, 'planner_cart', 'cart-step-key-001', 1, now() + interval '5 minutes') returning id into req;

  -- C1: first step adds the line and records the step; the replayed step is 'done' and changes nothing.
  res := pg_temp.step(s, sess, req, 1, 0, v, 2);
  select quantity into qty from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = sess and ci.variant_id = v;
  if res ->> 'outcome' <> 'added' or qty <> 2 then raise exception 'C1 failed: %, qty %', res, qty; end if;
  res := pg_temp.step(s, sess, req, 1, 0, v, 2);
  select quantity into qty from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = sess and ci.variant_id = v;
  if res ->> 'outcome' <> 'done' or qty <> 2 then raise exception 'C1 replay failed: %, qty %', res, qty; end if;
  raise notice 'C1 ok: step adds once; replay reports done and leaves quantity 2';

  -- C2: a line that would exceed stock is refused, the step is recorded as failed, and the cart is unchanged.
  res := pg_temp.step(s, sess, req, 1, 1, v, 9);
  select quantity into qty from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = sess and ci.variant_id = v;
  select status into msg from guest_request_steps where request_id = req and step_index = 1;
  if res ->> 'outcome' <> 'refused' or qty <> 2 or msg <> 'failed' then raise exception 'C2 failed: %, qty %, step %', res, qty, msg; end if;
  raise notice 'C2 ok: over-stock line refused (%), cart still 2, step failed', res ->> 'message';

  -- C3: a retry of a failed step is allowed and adds once.
  res := pg_temp.step(s, sess, req, 1, 1, v, 1);
  select quantity into qty from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = sess and ci.variant_id = v;
  if res ->> 'outcome' <> 'added' or qty <> 3 then raise exception 'C3 failed: %, qty %', res, qty; end if;
  raise notice 'C3 ok: failed step retried once; quantity 3';

  -- C4: a stale attempt (an older claim) is refused with P0003 and writes nothing.
  if pg_temp.sqlstate_of(format('select public.guest_cart_add_step(%L,%L,%L,%s,%s,%L,%s)', s, sess, req, 0, 2, v, 1)) not like 'P0003%' then
    raise exception 'C4 failed: stale attempt was not refused';
  end if;
  select count(*) into n from guest_request_steps where request_id = req and step_index = 2;
  if n <> 0 then raise exception 'C4 failed: stale attempt left a step'; end if;
  raise notice 'C4 ok: stale attempt refused, no step written';

  -- C5: a 'started' step from the pre-0056 code is reported as uncertain and never replayed.
  insert into guest_request_steps (request_id, step_index, status, variant_id, quantity) values (req, 3, 'started', v, 1);
  res := pg_temp.step(s, sess, req, 1, 3, v, 1);
  select quantity into qty from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = sess and ci.variant_id = v;
  if res ->> 'outcome' <> 'uncertain' or qty <> 3 then raise exception 'C5 failed: %, qty %', res, qty; end if;
  raise notice 'C5 ok: legacy started step reported uncertain, not replayed';

  -- C6: a failure after the cart change rolls back the change AND the step (no mutation without its step).
  create or replace function public.cart_step_test_boom() returns trigger language plpgsql as $f$
  begin
    if new.step_index = 9 and new.status = 'done' then raise exception 'injected failure' using errcode = 'XX000'; end if;
    return new;
  end $f$;
  create trigger cart_step_test_boom before update on guest_request_steps
    for each row execute function public.cart_step_test_boom();
  begin
    perform pg_temp.step(s, sess, req, 1, 9, v, 4);
    raise exception 'C6 failed: injected failure did not occur';
  exception when sqlstate 'XX000' then
    null;
  end;
  select quantity into qty from cart_items ci join carts c on c.id = ci.cart_id where c.guest_session_id = sess and ci.variant_id = v;
  select count(*) into n from guest_request_steps where request_id = req and step_index = 9;
  if qty <> 3 or n <> 0 then raise exception 'C6 failed: quantity %, step rows %', qty, n; end if;
  raise notice 'C6 ok: injected failure rolled back the cart change and its step together';

  -- C7: a request owned by another session is refused.
  if pg_temp.sqlstate_of(format('select public.guest_cart_add_step(%L,%L,%L,%s,%s,%L,%s)', s, other_sess, req, 1, 5, v, 1)) not like '42501%' then
    raise exception 'C7 failed: another session used this request';
  end if;
  raise notice 'C7 ok: another session cannot use this request';

  -- C8: a session that belongs to another store is refused.
  if pg_temp.sqlstate_of(format('select public.guest_cart_add_line(%L,%L,%L,%s)', '00000000-0000-4000-8000-00000000dead', sess, v, 1)) not like '42501%' then
    raise exception 'C8 failed: session accepted for a different store';
  end if;
  raise notice 'C8 ok: session is bound to its store';

  -- C9: the 999-unit line limit is enforced by the database.
  update inventory set on_hand = 5000, reserved = 0 where variant_id = v;
  res := public.guest_cart_add_line(s, other_sess, v, 999);
  if res ->> 'outcome' <> 'added' then raise exception 'C9 failed: 999 units not added: %', res; end if;
  res := public.guest_cart_add_line(s, other_sess, v, 1);
  if res ->> 'outcome' <> 'refused' or (res ->> 'message') not like 'You can add at most 999%' then
    raise exception 'C9 failed: %', res;
  end if;
  raise notice 'C9 ok: quantity limit enforced by the database';

  -- C10: progress is saved only by the current attempt.
  if not public.guest_request_progress_set(req, 1, '{"projectId":"p-1"}'::jsonb) then raise exception 'C10 failed: current attempt could not save'; end if;
  if public.guest_request_progress_set(req, 0, '{"projectId":"p-2"}'::jsonb) then raise exception 'C10 failed: stale attempt saved progress'; end if;
  raise notice 'C10 ok: progress saved by the current attempt only';
end $$;

rollback;
