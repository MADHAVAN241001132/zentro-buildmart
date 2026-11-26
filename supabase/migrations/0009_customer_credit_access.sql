-- 0009: customer credit. customer_balance() previously returned any customer's balance to any
-- authenticated caller (security definer, no store check). It now requires access to the customer's store.
-- record_credit_entry() already enforces approval, credit limit and no overpayment; it calls this function.

create or replace function customer_balance(p_customer uuid) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare
  v_store uuid;
begin
  select store_id into v_store from customers where id = p_customer;
  if v_store is null then raise exception 'customer not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager','staff']);
  return (select coalesce(sum(amount_paise), 0) from credit_ledger where customer_id = p_customer);
end $$;

revoke execute on function customer_balance(uuid) from public, anon;
grant execute on function customer_balance(uuid) to authenticated;
