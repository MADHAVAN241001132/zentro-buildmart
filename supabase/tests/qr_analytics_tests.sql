-- QR entry tracking, attribution and analytics authorisation (rolled back). Q1-Q12.
\set ON_ERROR_STOP on
begin;
do $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  tag text := substr(gen_random_uuid()::text, 1, 6);
  store_a uuid; store_b uuid; sess_a uuid; sess_b uuid; sess_c uuid; sess_d uuid;
  qr_a uuid; tok_a text; tok_b text; ev_a uuid; ev_c uuid; cat uuid; cat_tok text; cat_tok2 text;
  o1 uuid; o2 uuid; o3 uuid; n int; res text; v_bps integer; v_entries bigint; v_unique bigint; v_conv bigint; v_att bigint; v_paid bigint;
  owner_p uuid := gen_random_uuid(); admin_p uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (owner_p, 'qr-own-' || tag || '@example.test'), (admin_p, 'qr-adm-' || tag || '@example.test'), (stranger, 'qr-str-' || tag || '@example.test');
  insert into profiles (id, full_name) values (owner_p, 'Owner'), (admin_p, 'Admin'), (stranger, 'Stranger') on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (admin_p);

  insert into stores (slug, name, status) values ('qr-a-' || tag, 'QR A', 'active') returning id into store_a;
  insert into stores (slug, name, status) values ('qr-b-' || tag, 'QR B', 'active') returning id into store_b;
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (store_a, today + 5, 'QR test'), (store_b, today + 5, 'QR test');
  insert into store_owners (store_id, profile_id, role) values (store_a, owner_p, 'owner');

  insert into qr_codes (store_id, target_type, target_id, public_url) values (store_a, 'showroom', null, 'https://x.test/a') returning id, entry_token into qr_a, tok_a;
  insert into qr_codes (store_id, target_type, target_id, public_url) values (store_b, 'showroom', null, 'https://x.test/b') returning entry_token into tok_b;
  insert into categories (store_id, slug, name) values (store_a, 'qr-cat-' || tag, 'Cat') returning id into cat;

  insert into guest_sessions (store_id, token_hash, expires_at) values (store_a, md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), now() + interval '7 days') returning id into sess_a;
  insert into guest_sessions (store_id, token_hash, expires_at) values (store_b, md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), now() + interval '7 days') returning id into sess_b;
  insert into guest_sessions (store_id, token_hash, expires_at) values (store_a, md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), now() + interval '7 days') returning id into sess_c;
  insert into guest_sessions (store_id, token_hash, expires_at) values (store_a, md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), now() + interval '7 days') returning id into sess_d;

  -- Q1: a valid token records one entry.
  res := zb_record_qr_entry(tok_a, sess_a);
  if res <> 'recorded' then raise exception 'Q1 failed: %', res; end if;
  select id into ev_a from qr_entry_events where qr_code_id = qr_a and guest_session_id = sess_a;
  if ev_a is null then raise exception 'Q1 failed: no event row'; end if;
  raise notice 'Q1 ok: a valid tracked entry is recorded against its store';

  -- Q2: malformed and unknown identifiers record nothing.
  if zb_record_qr_entry('not-a-token', sess_a) <> 'invalid' then raise exception 'Q2 failed: malformed token accepted'; end if;
  if zb_record_qr_entry(repeat('0', 32), sess_a) <> 'invalid' then raise exception 'Q2 failed: unknown token accepted'; end if;
  raise notice 'Q2 ok: malformed and unknown identifiers are refused';

  -- Q3: an inactive QR code records nothing and is not resolved for the entry route.
  update qr_codes set is_active = false where id = qr_a;
  if zb_record_qr_entry(tok_a, sess_c) <> 'invalid' then raise exception 'Q3 failed: inactive QR recorded'; end if;
  if exists (select 1 from zb_qr_entry_target(tok_a)) then raise exception 'Q3 failed: inactive QR resolved'; end if;
  update qr_codes set is_active = true where id = qr_a;
  raise notice 'Q3 ok: inactive QR codes do not record or resolve';

  -- Q4: store isolation. A guest session from store B cannot record against store A.
  if zb_record_qr_entry(tok_a, sess_b) <> 'invalid' then raise exception 'Q4 failed: session of another store accepted'; end if;
  raise notice 'Q4 ok: a session from another store cannot record an entry';

  -- Q5: refresh deduplication. The same session and QR within the window is a duplicate.
  res := zb_record_qr_entry(tok_a, sess_a);
  if res <> 'duplicate' then raise exception 'Q5 failed: refresh recorded again (%)', res; end if;
  select count(*) into n from qr_entry_events where qr_code_id = qr_a and guest_session_id = sess_a;
  if n <> 1 then raise exception 'Q5 failed: % events stored', n; end if;
  raise notice 'Q5 ok: a refresh within the window is not counted twice';

  -- Q6: order attribution. A guest order after a tracked entry attributes to that entry.
  insert into orders (store_id, order_number, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise, guest_session_id, payment_status)
  values (store_a, 'QR-O1-' || tag, 'Customer', 'cash', 1000, 1000, 0, 1000, sess_a, 'PAID') returning id into o1;
  if not exists (select 1 from qr_order_attributions where order_id = o1 and entry_event_id = ev_a) then
    raise exception 'Q6 failed: order not attributed to the preceding entry';
  end if;
  raise notice 'Q6 ok: an order after a tracked entry is attributed to that entry';

  -- Q7: duplicate attribution prevention. An order can be attributed only once.
  begin
    insert into qr_order_attributions (order_id, store_id, qr_code_id, entry_event_id, guest_session_id, entered_at)
    values (o1, store_a, qr_a, ev_a, sess_a, now());
    raise exception 'Q7 failed: second attribution accepted';
  exception when unique_violation then null;
  end;
  raise notice 'Q7 ok: an order cannot be attributed twice';

  -- Q8: cancelled orders stay recorded but are excluded from attributed and paid counts.
  insert into orders (store_id, order_number, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise, guest_session_id, payment_status, order_status)
  values (store_a, 'QR-O2-' || tag, 'Customer', 'cash', 500, 500, 0, 500, sess_a, 'PAID', 'CANCELLED') returning id into o2;
  perform set_config('request.jwt.claim.sub', admin_p::text, true);
  select attributed_orders, paid_orders, paid_value_paise into v_att, v_paid, v_entries from zb_qr_summary(store_a, today, today);
  if v_att <> 1 or v_paid <> 1 or v_entries <> 1000 then
    raise exception 'Q8 failed: attributed %, paid %, value %', v_att, v_paid, v_entries;
  end if;
  raise notice 'Q8 ok: cancelled orders are excluded from attributed and paid analytics';

  -- Q9: date-range filtering and conversion. An entry from ten days ago falls outside today's range.
  res := zb_record_qr_entry(tok_a, sess_c);
  if res <> 'recorded' then raise exception 'Q9 setup failed: %', res; end if;
  select id into ev_c from qr_entry_events where guest_session_id = sess_c;
  update qr_entry_events set entered_at = now() - interval '10 days' where id = ev_c;
  select entries, unique_sessions, conversion_bps into v_entries, v_unique, v_bps from zb_qr_summary(store_a, today, today);
  if v_entries <> 1 or v_unique <> 1 then raise exception 'Q9 failed: range included an old entry (entries %, sessions %)', v_entries, v_unique; end if;
  if v_bps <> 10000 then raise exception 'Q9 failed: conversion % bps, expected 10000', v_bps; end if;
  if (select count(*) from zb_qr_daily(store_a, today - 10, today)) <> 11 then raise exception 'Q9 failed: daily series length'; end if;
  if (select entries from zb_qr_daily(store_a, today - 10, today) where day = today - 10) <> 1 then raise exception 'Q9 failed: old entry not on its day'; end if;
  raise notice 'Q9 ok: date ranges filter entries and conversion is computed from sessions in range';

  -- Q10: authorisation. A stranger and a non-admin owner are refused platform-wide analytics; an owner can read their store only.
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    perform * from zb_qr_summary(store_a, today, today);
    raise exception 'Q10 failed: non-member read store analytics';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claim.sub', owner_p::text, true);
  perform * from zb_qr_summary(store_a, today, today);
  begin
    perform * from zb_qr_summary(store_b, today, today);
    raise exception 'Q10 failed: owner read another store';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform * from zb_qr_summary(null, today, today);
    raise exception 'Q10 failed: owner read platform-wide analytics';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform * from zb_qr_store_comparison(today, today, null);
    raise exception 'Q10 failed: owner compared stores';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'Q10 ok: analytics are limited to members of the store and to platform administrators';

  -- Q11: administrators read the store comparison, which excludes stores with no activity.
  perform set_config('request.jwt.claim.sub', admin_p::text, true);
  if not exists (select 1 from zb_qr_store_comparison(today, today, null) c where c.store_id = store_a and c.entries = 1) then
    raise exception 'Q11 failed: comparison missing the active store';
  end if;
  if exists (select 1 from zb_qr_store_comparison(today, today, null) c where c.store_id = store_b) then
    raise exception 'Q11 failed: inactive store listed';
  end if;
  raise notice 'Q11 ok: administrators see the store comparison with activity only';

  -- Q12: tracked codes for categories are created once and only for visible targets.
  cat_tok := zb_ensure_qr_code(store_a, 'category', cat, 'https://x.test/cat');
  cat_tok2 := zb_ensure_qr_code(store_a, 'category', cat, 'https://x.test/cat');
  if cat_tok is null or cat_tok <> cat_tok2 then raise exception 'Q12 failed: category code not stable'; end if;
  if (select count(*) from qr_codes where store_id = store_a and target_type = 'category' and target_id = cat) <> 1 then
    raise exception 'Q12 failed: duplicate category code rows';
  end if;
  if zb_record_qr_entry(cat_tok, sess_d) <> 'recorded' then raise exception 'Q12 failed: category entry not recorded'; end if;
  update categories set is_active = false where id = cat;
  if exists (select 1 from zb_qr_entry_target(cat_tok)) then raise exception 'Q12 failed: hidden category resolved'; end if;
  begin
    perform zb_ensure_qr_code(store_a, 'category', gen_random_uuid(), 'https://x.test/none');
    raise exception 'Q12 failed: code created for a missing category';
  exception when sqlstate 'P0002' then null;
  end;
  raise notice 'Q12 ok: category codes are stable, record entries and stop resolving when hidden';
end $$;
rollback;
