-- House project tests (rolled back). H1-H5.
\set ON_ERROR_STOP on
begin;
do $$
declare
  s uuid; other_store uuid; v1 uuid; v2 uuid; v_inactive uuid; other_variant uuid;
  sess uuid; other_sess uuid; proj uuid; proj2 uuid; room uuid; room2 uuid; n int;
begin
  select pv.store_id, pv.id into s, v1 from product_variants pv where pv.is_active order by pv.id limit 1;
  if s is null then raise exception 'H0 needs a seeded active variant'; end if;
  select pv.id into v2 from product_variants pv where pv.store_id = s and pv.is_active and pv.id <> v1 order by pv.id limit 1;
  select pv.id into v_inactive from product_variants pv where pv.store_id = s and not pv.is_active order by pv.id limit 1;
  select pv.store_id, pv.id into other_store, other_variant from product_variants pv where pv.store_id <> s and pv.is_active order by pv.id limit 1;
  if v2 is null then raise exception 'H0 needs two active variants in the seeded store'; end if;

  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('c', 64), now() + interval '1 day') returning id into sess;
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('d', 64), now() + interval '1 day') returning id into other_sess;

  -- H1: a project is created and the scope trigger accepts it for the session's own store.
  insert into house_projects (store_id, guest_session_id, name, project_type) values (s, sess, 'Test house', 'renovation') returning id into proj;
  insert into house_project_rooms (store_id, project_id, room_type, name, length_value, width_value, measure_unit)
    values (s, proj, 'kitchen', 'Kitchen', 10, 12, 'ft') returning id into room;
  raise notice 'H1 ok: project and room created in the session store';

  -- H2: a project claiming another store's session is refused.
  if other_store is not null then
    begin
      insert into house_projects (store_id, guest_session_id, name) values (other_store, sess, 'Wrong store');
      raise exception 'H2 failed: project accepted under the wrong store';
    exception when sqlstate '42501' then
      null;
    end;
  end if;
  raise notice 'H2 ok: cross-store session refused';

  -- H3: an item with a positive quantity is accepted; a zero quantity is refused.
  insert into house_project_items (store_id, project_id, room_id, variant_id, quantity) values (s, proj, room, v1, 3);
  begin
    insert into house_project_items (store_id, project_id, room_id, variant_id, quantity) values (s, proj, room, v2, 0);
    raise exception 'H3 failed: zero quantity accepted';
  exception when check_violation then
    null;
  end;
  raise notice 'H3 ok: positive quantity enforced';

  -- H4: the same variant cannot appear twice in one room.
  begin
    insert into house_project_items (store_id, project_id, room_id, variant_id, quantity) values (s, proj, room, v1, 2);
    raise exception 'H4 failed: duplicate room line accepted';
  exception when unique_violation then
    null;
  end;
  raise notice 'H4 ok: one line per variant per room';

  -- H5: a room of one project cannot hold items of another project; an inactive
  -- or foreign variant is refused.
  insert into house_projects (store_id, guest_session_id, name) values (s, sess, 'Second') returning id into proj2;
  insert into house_project_rooms (store_id, project_id, room_type, name) values (s, proj2, 'bedroom', 'Bedroom') returning id into room2;
  begin
    insert into house_project_items (store_id, project_id, room_id, variant_id, quantity) values (s, proj, room2, v2, 1);
    raise exception 'H5 failed: item linked to a room of another project';
  exception when sqlstate '42501' then
    null;
  end;
  if v_inactive is not null then
    begin
      insert into house_project_items (store_id, project_id, room_id, variant_id, quantity) values (s, proj, room, v_inactive, 1);
      raise exception 'H5 failed: inactive variant accepted';
    exception when sqlstate '42501' then
      null;
    end;
  end if;
  if other_variant is not null then
    begin
      insert into house_project_items (store_id, project_id, room_id, variant_id, quantity) values (s, proj, null, other_variant, 1);
      raise exception 'H5 failed: foreign-store variant accepted';
    exception when sqlstate '42501' then
      null;
    end;
  end if;
  raise notice 'H5 ok: room ownership and variant scope enforced';

  -- H6: idempotency keys are unique per session and kind.
  insert into guest_request_keys (store_id, guest_session_id, kind, request_key) values (s, sess, 'planner_cart', 'key-0001-abcd');
  begin
    insert into guest_request_keys (store_id, guest_session_id, kind, request_key) values (s, sess, 'planner_cart', 'key-0001-abcd');
    raise exception 'H6 failed: duplicate idempotency key accepted';
  exception when unique_violation then
    null;
  end;
  raise notice 'H6 ok: idempotency keys are unique';
end $$;
rollback;
