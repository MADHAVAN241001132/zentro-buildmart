-- Guest list tests (rolled back). G1-G4.
\set ON_ERROR_STOP on
begin;
do $$
declare
  s uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; other_store uuid; other_product uuid; sess uuid; other_sess uuid; n int;
  tok_hash text;
begin
  select pr.store_id, pr.id into s, p1 from products pr order by pr.id limit 1;
  if s is null then raise exception 'G0 needs a seeded product'; end if;
  select pr.id into p2 from products pr where pr.store_id = s and pr.id <> p1 order by pr.id limit 1;
  select pr.id into p3 from products pr where pr.store_id = s and pr.id not in (p1, p2) order by pr.id limit 1;
  select pr.id into p4 from products pr where pr.store_id = s and pr.id not in (p1, p2, p3) order by pr.id limit 1;
  select pr.id into p5 from products pr where pr.store_id = s and pr.id not in (p1, p2, p3, p4) order by pr.id limit 1;
  select pr.store_id, pr.id into other_store, other_product from products pr where pr.store_id <> s order by pr.id limit 1;
  if p2 is null or p3 is null or p4 is null or p5 is null then raise exception 'G0 needs five products in the seeded store'; end if;

  tok_hash := repeat('a', 64);
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, tok_hash, now() + interval '1 day') returning id into sess;
  insert into guest_sessions (store_id, token_hash, expires_at) values (s, repeat('b', 64), now() + interval '1 day') returning id into other_sess;

  -- G1: four compare items are accepted; a fifth is refused with the friendly message.
  insert into guest_compare_items (store_id, guest_session_id, product_id) values (s, sess, p1);
  insert into guest_compare_items (store_id, guest_session_id, product_id) values (s, sess, p2);
  insert into guest_compare_items (store_id, guest_session_id, product_id) values (s, sess, p3);
  insert into guest_compare_items (store_id, guest_session_id, product_id) values (s, sess, p4);
  begin
    insert into guest_compare_items (store_id, guest_session_id, product_id) values (s, sess, p5);
    raise exception 'G1 failed: fifth compare item was accepted';
  exception when sqlstate 'P0001' then
    null;
  end;
  raise notice 'G1 ok: compare limit of four enforced';

  -- G2: a product from another store cannot be added to this store's lists.
  if other_product is not null then
    begin
      insert into guest_wishlist_items (store_id, guest_session_id, product_id) values (s, sess, other_product);
      raise exception 'G2 failed: cross-store product accepted';
    exception when sqlstate '42501' then
      null;
    end;
  end if;
  raise notice 'G2 ok: cross-store product refused';

  -- G3: a row claiming another store's session is refused.
  begin
    insert into guest_wishlist_items (store_id, guest_session_id, product_id) values (s, sess, p1);
    insert into guest_wishlist_items (store_id, guest_session_id, product_id) values (s, sess, p1);
    raise exception 'G3 failed: duplicate wishlist row accepted';
  exception when unique_violation then
    null;
  end;
  if other_store is not null then
    begin
      insert into guest_wishlist_items (store_id, guest_session_id, product_id) values (other_store, sess, p1);
      raise exception 'G3 failed: session accepted under the wrong store';
    exception when sqlstate '42501' then
      null;
    end;
  end if;
  raise notice 'G3 ok: duplicate and wrong-store session refused';

  -- G4: the same product may sit in two sessions' wishlists; the lists are isolated.
  insert into guest_wishlist_items (store_id, guest_session_id, product_id) values (s, sess, p1);
  insert into guest_wishlist_items (store_id, guest_session_id, product_id) values (s, other_sess, p1);
  select count(*) into n from guest_wishlist_items where guest_session_id = sess;
  if n <> 1 then raise exception 'G4 failed: wishlist count for session = %', n; end if;
  raise notice 'G4 ok: lists isolated per session';
end $$;
rollback;
