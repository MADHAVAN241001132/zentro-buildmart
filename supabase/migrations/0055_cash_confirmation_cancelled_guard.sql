-- 0055: Cash confirmation refuses cancelled orders.
-- confirm_cash_payment (0003) checked only the pending payment row. A cancelled order cannot normally have a pending
-- cash payment, because cancel_order voids it; this guard makes the refusal explicit and independent of that. The rest
-- of the function is unchanged. Released migrations are not modified.

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(p_order uuid, p_amount_received_paise bigint, p_note text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_payment payments%rowtype;
  v_actor uuid := coalesce(auth.uid(), p_actor);
begin
  -- The acting owner is the signed-in user; server calls must name the owner explicitly.
  if v_actor is null then
    raise exception 'an acting owner is required' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if not app.is_server() then
    perform app.assert_store_permission(v_order.store_id, 'cash_confirmation');
  elsif not exists (
    select 1 from store_owners so
    where so.store_id = v_order.store_id and so.profile_id = v_actor
      and so.is_active and so.role in ('owner','manager')
  ) then
    raise exception 'actor is not an owner or manager of this store' using errcode = '42501';
  end if;

  -- A cancelled order can no longer take a cash payment, whatever the payment row says.
  if v_order.order_status = 'CANCELLED' then
    raise exception 'order % is cancelled and cannot take a cash payment', v_order.order_number using errcode = 'P0001';
  end if;

  select * into v_payment from payments
  where order_id = p_order and method = 'cash' and status = 'CASH_PENDING'
  for update;
  if not found then raise exception 'no pending cash payment for this order' using errcode = 'P0001'; end if;

  if p_amount_received_paise <> v_payment.amount_paise then
    raise exception 'received amount % does not match amount due %', p_amount_received_paise, v_payment.amount_paise
      using errcode = 'P0001';
  end if;

  update payments set status = 'PAID', paid_at = now(), updated_at = now() where id = v_payment.id;
  update orders set payment_status = 'PAID', paid_at = now(), updated_at = now() where id = p_order;

  insert into cash_confirmations (store_id, order_id, payment_id, amount_due_paise, amount_received_paise, confirmed_by, note)
  values (v_order.store_id, p_order, v_payment.id, v_payment.amount_paise, p_amount_received_paise,
          v_actor, p_note);

  perform consume_order_stock(p_order);
  if v_order.order_status = 'PLACED' then
    perform app.set_order_status(p_order, 'CONFIRMED', 'cash collected');
  end if;

  perform app.audit(v_order.store_id, 'cash.confirmed', 'orders', p_order, null,
    jsonb_build_object('amount_paise', p_amount_received_paise, 'note', p_note));
  return 'paid';
end $function$;
