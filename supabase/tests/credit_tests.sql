-- ZENTRO BuildMart: tests for migration 0009 (customer credit access and limits).
-- Run after migrations 0001-0009 and the dev seed. Rolled back at the end.

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
  owner_b constant uuid := '00000000-0000-4000-8000-0000000000a3';
  store_a constant uuid := '11111111-1111-4111-8111-111111111111';
  v_cust uuid;
  v_cust_b uuid;
  v_msg text;
  v_bal bigint;
begin
  -- A credit-approved customer with a 10,000 limit, and an unapproved one, in store A.
  insert into customers (store_id, full_name, mobile, is_credit_approved, credit_limit_paise)
  values (store_a, 'Credit Test Contractor', '9800000001', true, 1000000) returning id into v_cust;
  insert into customers (store_id, full_name, mobile, is_credit_approved, credit_limit_paise)
  values (store_a, 'No Credit Test', '9800000002', false, 1000000) returning id into v_cust_b;

  -- C1: owner A records a credit sale with a due date; balance rises.
  perform pg_temp.act_as(owner_a);
  perform record_credit_entry(v_cust, 'sale', 600000, current_date + 30, 'Tile order T-1');
  v_bal := customer_balance(v_cust);
  perform pg_temp.reset_session();
  if v_bal <> 600000 then raise exception 'C1 failed: balance %', v_bal; end if;
  raise notice 'PASS C1 credit sale raises balance to %', v_bal;

  -- C2: a sale over the credit limit is refused.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$select record_credit_entry(%L, 'sale', 500000, null, 'over limit')$q$, v_cust));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'C2 failed: sale over limit accepted'; end if;
  raise notice 'PASS C2 credit limit enforced (%)', v_msg;

  -- C3: an unapproved customer cannot take credit.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$select record_credit_entry(%L, 'sale', 1000, null, 'x')$q$, v_cust_b));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'C3 failed: unapproved customer took credit'; end if;
  raise notice 'PASS C3 unapproved customer refused (%)', v_msg;

  -- C4: a payment larger than the outstanding balance is refused; a partial payment is accepted.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$select record_credit_entry(%L, 'payment', 700000, null, 'too much')$q$, v_cust));
  perform record_credit_entry(v_cust, 'payment', 250000, null, 'part payment');
  v_bal := customer_balance(v_cust);
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'C4 failed: overpayment accepted'; end if;
  if v_bal <> 350000 then raise exception 'C4 failed: balance after partial payment %', v_bal; end if;
  raise notice 'PASS C4 overpayment refused; partial payment leaves balance %', v_bal;

  -- C5: owner B cannot read store A's customer balance.
  perform pg_temp.act_as(owner_b);
  v_msg := pg_temp.try(format($q$select customer_balance(%L)$q$, v_cust));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'C5 failed: cross-store balance readable'; end if;
  raise notice 'PASS C5 cross-store customer balance refused (%)', v_msg;

  -- C6: credit entries cannot be written directly by owners.
  perform pg_temp.act_as(owner_a);
  v_msg := pg_temp.try(format($q$insert into credit_ledger (store_id, customer_id, entry_type, amount_paise) values (%L, %L, 'adjustment', 1)$q$, store_a, v_cust));
  perform pg_temp.reset_session();
  if v_msg = 'ok' then raise exception 'C6 failed: direct credit ledger write accepted'; end if;
  raise notice 'PASS C6 direct credit ledger write refused (%)', v_msg;

  raise notice 'Credit tests finished. All assertions passed; changes will be rolled back.';
end $$;

rollback;
