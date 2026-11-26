-- Store legal profile, seller snapshots and atomic onboarding store creation (rolled back). B1-B7.
\set ON_ERROR_STOP on
begin;
do $$
declare
  tag text := substr(gen_random_uuid()::text, 1, 6);
  admin_profile uuid := gen_random_uuid();
  owner_profile uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  ob1 uuid; ob2 uuid; ob3 uuid; new_store uuid; st uuid; ord uuid; inv uuid; q uuid; n int;
  store_slug text := 'lp-' || tag;
  store_gst text;
begin
  insert into auth.users (id, email) values
    (admin_profile, 'lp-adm-' || tag || '@example.test'),
    (owner_profile, 'lp-own-' || tag || '@example.test'),
    (stranger, 'lp-str-' || tag || '@example.test');
  insert into profiles (id, full_name) values (admin_profile, 'Admin'), (owner_profile, 'Owner'), (stranger, 'Stranger')
  on conflict (id) do nothing;
  insert into platform_admins (profile_id) values (admin_profile);

  insert into store_onboardings (created_by, step_data, current_step) values (admin_profile, '{"info":{"name":"Legal Test"}}', 1) returning id into ob1;
  insert into store_onboardings (created_by) values (admin_profile) returning id into ob2;
  insert into store_onboardings (created_by) values (admin_profile) returning id into ob3;

  -- B1: a non-admin cannot create a store through onboarding.
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    perform onboarding_create_store(ob1, jsonb_build_object('slug', store_slug, 'name', 'Legal Test', 'category', 'Tiles'), '{"info":{}}', 2);
    raise exception 'B1 failed: non-admin created a store';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'B1 ok: only platform administrators create stores through onboarding';

  -- B2: an administrator creates the store and links it in one step.
  perform set_config('request.jwt.claim.sub', admin_profile::text, true);
  new_store := onboarding_create_store(ob1, jsonb_build_object('slug', store_slug, 'name', 'Legal Test', 'category', 'Tiles', 'description', 'Showroom'), '{"info":{"name":"Legal Test"}}', 2);
  select store_id into st from store_onboardings where id = ob1;
  if st is distinct from new_store then raise exception 'B2 failed: onboarding not linked'; end if;
  select business_category into store_gst from stores where id = new_store;
  if store_gst <> 'Tiles' then raise exception 'B2 failed: category not stored'; end if;
  raise notice 'B2 ok: store and onboarding link are created in one step with the category stored';

  -- B3: a second creation for the same onboarding is refused and creates nothing.
  select count(*) into n from stores where slug = store_slug;
  begin
    perform onboarding_create_store(ob1, jsonb_build_object('slug', 'lp-other-' || tag, 'name', 'Other'), '{}', 2);
    raise exception 'B3 failed: second store created for one onboarding';
  exception when sqlstate 'P0001' then null;
  end;
  if (select count(*) from stores where slug = 'lp-other-' || tag) <> 0 then raise exception 'B3 failed: orphan store left'; end if;
  raise notice 'B3 ok: an onboarding cannot create a second store';

  -- B4: a duplicate slug leaves the onboarding unlinked and creates no store.
  begin
    perform onboarding_create_store(ob2, jsonb_build_object('slug', store_slug, 'name', 'Clash'), '{}', 2);
    raise exception 'B4 failed: duplicate slug accepted';
  exception when unique_violation then null;
  end;
  if (select store_id from store_onboardings where id = ob2) is not null then raise exception 'B4 failed: onboarding linked after failure'; end if;
  raise notice 'B4 ok: a failed creation leaves the onboarding unlinked and no store behind';

  -- B5: a closed onboarding cannot create a store.
  insert into stores (slug, name, status) values ('lp-c-' || tag, 'Closed store', 'draft') returning id into st;
  update store_onboardings set store_id = st, owner_profile_id = owner_profile, status = 'completed', completed_at = now() where id = ob3;
  begin
    perform onboarding_create_store(ob3, jsonb_build_object('slug', 'lp-closed-' || tag, 'name', 'Closed'), '{}', 2);
    raise exception 'B5 failed: closed onboarding created a store';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'B5 ok: a closed onboarding cannot create a store';

  -- B6: invoices and quotations capture the seller details at issue and keep them afterwards.
  insert into store_owners (store_id, profile_id, role) values (new_store, owner_profile, 'owner');
  update stores set legal_name = 'Legal Test Private Limited', gstin = '29ABCDE1234F1Z5', gst_registration = 'regular', state = 'Karnataka' where id = new_store;
  insert into subscription_migration_allowances (store_id, expires_on, reason) values (new_store, app.ist_today() + 5, 'B6 allowance');
  insert into orders (store_id, order_number, customer_name, payment_method, subtotal_paise, taxable_paise, tax_paise, total_paise)
  values (new_store, 'LP-O-' || tag, 'Customer', 'cash', 100, 100, 0, 100) returning id into ord;
  insert into invoices (store_id, order_id, invoice_number, taxable_paise, tax_paise, total_paise)
  values (new_store, ord, 'LP-I-' || tag, 100, 0, 100) returning id into inv;
  insert into quotations (store_id, quotation_number, customer_name) values (new_store, 'LP-Q-' || tag, 'Customer') returning id into q;
  if (select seller_gstin from invoices where id = inv) <> '29ABCDE1234F1Z5' then raise exception 'B6 failed: invoice seller GSTIN not captured'; end if;
  if (select seller_legal_name from quotations where id = q) <> 'Legal Test Private Limited' then raise exception 'B6 failed: quotation seller name not captured'; end if;

  perform set_config('request.jwt.claim.sub', admin_profile::text, true);
  update stores set gstin = '27ABCDE1234F1Z5' where id = new_store;
  begin
    update invoices set seller_gstin = '27ABCDE1234F1Z5' where id = inv;
    raise exception 'B6 failed: issued invoice seller details changed';
  exception when sqlstate '42501' then null;
  end;
  if (select seller_gstin from invoices where id = inv) <> '29ABCDE1234F1Z5' then raise exception 'B6 failed: snapshot moved'; end if;
  raise notice 'B6 ok: invoices and quotations keep the seller details in force when issued';

  -- B7: an owner cannot change the legal and tax profile, but can still change ordinary store details.
  perform set_config('request.jwt.claim.sub', owner_profile::text, true);
  begin
    update stores set gstin = '99ABCDE1234F1Z5' where id = new_store;
    raise exception 'B7 failed: owner changed the GSTIN';
  exception when sqlstate '42501' then null;
  end;
  update stores set phone = '9999999999' where id = new_store;
  raise notice 'B7 ok: owners cannot change legal or tax fields, and ordinary fields still update';
end $$;
rollback;
