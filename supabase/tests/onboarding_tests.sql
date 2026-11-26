-- Store onboarding tests (rolled back). O1-O5.
\set ON_ERROR_STOP on
begin;
do $$
declare
  s uuid; s2 uuid; p uuid; ob uuid; n int;
begin
  -- O1: a draft onboarding can be created and resumed
  insert into store_onboardings (step_data, current_step) values ('{"info":{"name":"Test"}}', 2) returning id into ob;
  select current_step into n from store_onboardings where id = ob;
  if n <> 2 then raise exception 'O1 failed: step not stored'; end if;
  raise notice 'O1 ok: drafts persist and resume at the stored step';

  -- O2: passwords cannot be stored in a draft
  begin
    insert into store_onboardings (step_data) values ('{"owner":{"password":"secret-value"}}');
    raise exception 'O2 failed: password stored';
  exception when check_violation then
    null;
  end;
  raise notice 'O2 ok: drafts refuse password data';

  -- O3: a completed onboarding must have a store, an owner and a completion time
  begin
    insert into store_onboardings (status) values ('completed');
    raise exception 'O3 failed: completed without store';
  exception when check_violation then
    null;
  end;
  raise notice 'O3 ok: completion requires store, owner and timestamp';

  -- O4: the store link cannot be moved once set
  insert into stores (slug, name, status) values ('onboard-a-' || substr(gen_random_uuid()::text, 1, 6), 'A', 'draft') returning id into s;
  insert into stores (slug, name, status) values ('onboard-b-' || substr(gen_random_uuid()::text, 1, 6), 'B', 'draft') returning id into s2;
  update store_onboardings set store_id = s where id = ob;
  begin
    update store_onboardings set store_id = s2 where id = ob;
    raise exception 'O4 failed: store link moved';
  exception when sqlstate '42501' then
    null;
  end;
  raise notice 'O4 ok: store link is fixed once set';

  -- O5: a store cannot be linked to two onboardings
  begin
    insert into store_onboardings (store_id) values (s);
    raise exception 'O5 failed: duplicate store link accepted';
  exception when unique_violation then
    null;
  end;
  raise notice 'O5 ok: one onboarding per store';
end $$;
rollback;
