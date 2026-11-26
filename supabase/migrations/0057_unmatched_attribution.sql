-- 0057: controlled attribution of unmatched provider payments, and closure of the unsafe "confirm no order" action.
--
-- 1. guest_payment_init_reconcile no longer accepts 'confirm_no_order'. Marking an attempt refused re-opens checkout,
--    so a guest could pay again while the first provider payment might already exist. Absence cannot be proven from
--    the provider (an empty search is not proof), so such attempts stay under investigation instead.
-- 2. late_payments may record 'attributed': an unmatched payment that was verified and settled to its order.
-- 3. unmatched_payment_attribute: ownership comes from the local order row, never from a caller-chosen store. The
--    provider evidence (payment id, order id, amount) must equal what was recorded. The payment is then routed through
--    the existing settle_online_payment when it can still be paid, or into the owner's late-payment queue otherwise.
-- Migrations 0001–0056 are not modified.

create or replace function public.guest_payment_init_reconcile(
  p_init uuid, p_actor uuid, p_action text, p_provider_order_id text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i payment_initialisations%rowtype;
begin
  if not app.is_server() then raise exception 'reconciliation is server-only' using errcode = '42501'; end if;
  if not exists (select 1 from platform_admins where profile_id = p_actor) then
    raise exception 'forbidden: platform administrator required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'a reconciliation note is required' using errcode = '22023';
  end if;
  select * into i from payment_initialisations where id = p_init for update;
  if not found then raise exception 'initialisation not found' using errcode = 'P0002'; end if;
  if i.status not in ('uncertain','amount_mismatch') then
    raise exception 'only uncertain or mismatched outcomes are reconciled here' using errcode = 'P0001';
  end if;
  if p_action <> 'adopt' then
    raise exception 'an attempt can only be reconciled against a verified provider order; without one it stays under investigation'
      using errcode = '0A000';
  end if;
  if nullif(btrim(coalesce(p_provider_order_id, '')), '') is null then
    raise exception 'provider order id required' using errcode = '22023';
  end if;
  update payment_initialisations
     set status = 'created', provider_order_id = p_provider_order_id, lease_until = null,
         reconciliation_status = 'resolved', reconciled_by = p_actor, reconciled_at = now(),
         reconciliation_note = left(p_note, 500), updated_at = now()
   where id = i.id;
  return jsonb_build_object('initId', i.id, 'status', 'created');
end $$;

alter table late_payments drop constraint if exists late_payments_status_check;
alter table late_payments add constraint late_payments_status_check check (status in
  ('open','refund_requested','fulfilment_approved','dismissed','attributed'));

create or replace function public.unmatched_payment_attribute(
  p_actor uuid, p_provider text, p_provider_payment_id text, p_provider_order_id text,
  p_amount_paise bigint, p_order uuid, p_note text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  l late_payments%rowtype;
  o orders%rowtype;
  pay payments%rowtype;
  i payment_initialisations%rowtype;
  v_result text;
  v_reason text;
  v_has_init boolean;
begin
  if not app.is_server() then raise exception 'attribution is server-only' using errcode = '42501'; end if;
  if not exists (select 1 from platform_admins where profile_id = p_actor) then
    raise exception 'forbidden: platform administrator required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'an evidence note is required' using errcode = '22023';
  end if;

  select * into l from late_payments
   where provider = p_provider and provider_payment_id = p_provider_payment_id for update;
  if not found then raise exception 'unmatched payment not found' using errcode = 'P0002'; end if;
  if l.store_id is not null or l.reason <> 'unmatched_provider_order' or l.status <> 'open' then
    raise exception 'this payment is not awaiting attribution' using errcode = 'P0001';
  end if;
  if l.provider_order_id is distinct from p_provider_order_id or l.amount_paise <> p_amount_paise then
    raise exception 'the provider evidence does not match the recorded payment' using errcode = '22023';
  end if;

  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;

  if exists (select 1 from payments where order_id = o.id and status = 'PAID') then
    raise exception 'this order already has a paid payment; manual investigation required' using errcode = 'P0001';
  end if;
  if exists (select 1 from payments where provider_payment_id = p_provider_payment_id and order_id <> o.id) then
    raise exception 'this provider payment belongs to another order' using errcode = 'P0001';
  end if;
  if exists (select 1 from payments where provider_order_id = p_provider_order_id and order_id <> o.id) then
    raise exception 'this provider order belongs to another order' using errcode = 'P0001';
  end if;
  if exists (select 1 from refunds where order_id = o.id) then
    raise exception 'this order has refunds; manual investigation required' using errcode = 'P0001';
  end if;

  select * into i from payment_initialisations where order_id = o.id for update;
  v_has_init := found;
  if v_has_init then
    if i.status = 'calling' then raise exception 'a payment attempt is in progress; try again later' using errcode = 'P0001'; end if;
    if i.provider_order_id is not null and i.provider_order_id <> p_provider_order_id then
      raise exception 'this order is attached to a different provider order' using errcode = 'P0001';
    end if;
  end if;

  select * into pay from payments where order_id = o.id and provider = p_provider order by created_at desc limit 1 for update;
  if not found then raise exception 'this order has no online payment to attribute to' using errcode = 'P0001'; end if;
  if pay.provider_order_id is not null and pay.provider_order_id <> p_provider_order_id then
    raise exception 'this order payment is attached to a different provider order' using errcode = 'P0001';
  end if;

  if pay.status in ('PENDING','PROCESSING') and o.order_status <> 'CANCELLED'
     and o.reservation_expires_at > now() and pay.amount_paise = p_amount_paise then
    -- Still payable: link the verified provider order and settle through the existing settlement function.
    update late_payments
       set store_id = o.store_id, order_id = o.id, status = 'attributed', resolved_by = p_actor, resolved_at = now(),
           resolution_note = left('Attributed and settled: ' || p_note, 500)
     where id = l.id;
    update payments set provider_order_id = p_provider_order_id, updated_at = now() where id = pay.id;
    if v_has_init and i.provider_order_id is null then
      update payment_initialisations set provider_order_id = p_provider_order_id, updated_at = now() where id = i.id;
    end if;
    v_result := public.settle_online_payment(p_provider, p_provider_order_id, p_provider_payment_id, p_amount_paise, true, null);
    if v_result <> 'paid' then
      raise exception 'settlement did not record the payment (%); nothing was changed', v_result using errcode = 'P0001';
    end if;
    v_result := 'attributed_and_paid';
  else
    -- The order can no longer take this payment: it goes to the owner's late-payment queue for a decision.
    v_reason := case when o.order_status = 'CANCELLED' then 'after_cancellation' else 'after_reservation_expiry' end;
    update late_payments
       set store_id = o.store_id, order_id = o.id, reason = v_reason, status = 'open',
           resolution_note = left('Attributed for owner review: ' || p_note, 500)
     where id = l.id;
    v_result := 'attributed_for_owner_review';
  end if;

  insert into payment_events (store_id, provider, provider_event_id, event_type, payload, signature_valid, processed_at)
  values (o.store_id, p_provider, 'attribution:' || p_provider_payment_id, 'unmatched_attributed',
          jsonb_build_object('actor', p_actor, 'orderId', o.id, 'outcome', v_result, 'note', left(p_note, 500)), true, now())
  on conflict (provider, provider_event_id) do nothing;
  return v_result;
end $$;

revoke execute on function public.guest_payment_init_reconcile(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.unmatched_payment_attribute(uuid, text, text, text, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.guest_payment_init_reconcile(uuid, uuid, text, text, text) to service_role;
grant execute on function public.unmatched_payment_attribute(uuid, text, text, text, bigint, uuid, text) to service_role;
