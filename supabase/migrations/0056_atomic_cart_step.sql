-- 0056: one cart-mutation path, and an atomic cart step for request-keyed additions.
--
-- guest_cart_add_line: the only place that mutates a guest cart line. It locks the variant's inventory row and the
-- cart row, so concurrent adds of the same variant serialise and never lose a quantity update.
-- guest_cart_add_step: runs the same mutation and records the request step in ONE transaction. If anything fails,
-- neither the cart change nor the step completion is kept, so a cart mutation can never exist without its step.
-- guest_request_progress_set: records what a multi-stage request has already created (for example a project id),
-- so a retry resumes instead of creating it again.
-- Migrations 0001–0055 are not modified.

alter table guest_request_keys add column if not exists progress jsonb not null default '{}'::jsonb;

create or replace function public.guest_cart_add_line(
  p_store uuid, p_session uuid, p_variant uuid, p_quantity integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_expires timestamptz;
  v_active boolean;
  v_public boolean;
  v_on_hand bigint;
  v_reserved bigint;
  v_avail bigint := 0;
  v_cart uuid;
  v_line_id uuid;
  v_line_qty numeric := 0;
  v_new numeric;
  v_found boolean;
  v_msg text;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'quantity must be a whole number from 1 to 999' using errcode = '22023';
  end if;
  select expires_at into v_expires from guest_sessions where id = p_session and store_id = p_store;
  if not found or v_expires <= now() then
    raise exception 'guest session is not valid for this store' using errcode = '42501';
  end if;

  select pv.is_active, (p.status = 'active' and p.visibility = 'public')
    into v_active, v_public
    from product_variants pv join products p on p.id = pv.product_id
    where pv.id = p_variant and pv.store_id = p_store;
  if not found then
    v_msg := 'This product is not available in this store';
  elsif not v_active or not v_public then
    v_msg := 'This product is no longer available';
  end if;

  if v_msg is null then
    select on_hand, reserved into v_on_hand, v_reserved from inventory where variant_id = p_variant for update;
    if found then v_avail := greatest(0, v_on_hand - v_reserved); end if;
  end if;

  if v_msg is null then
    select id into v_cart from carts where guest_session_id = p_session and status = 'active' and store_id = p_store for update;
    if not found then
      insert into carts (store_id, guest_session_id, status) values (p_store, p_session, 'active')
        on conflict do nothing returning id into v_cart;
      if v_cart is null then
        select id into v_cart from carts where guest_session_id = p_session and status = 'active' and store_id = p_store for update;
      end if;
    end if;
  end if;

  if v_msg is null then
    select id, quantity into v_line_id, v_line_qty from cart_items where cart_id = v_cart and variant_id = p_variant for update;
    v_new := coalesce(v_line_qty, 0) + p_quantity;
    if v_new > 999 then
      v_msg := 'You can add at most 999 of one item';
    elsif ceil(v_new) > v_avail then
      v_msg := case when v_avail > 0 then 'Only ' || v_avail || ' left in stock' else 'This item is out of stock' end;
    end if;
  end if;

  if v_msg is not null then
    return jsonb_build_object('outcome', 'refused', 'message', v_msg);
  end if;

  if v_line_id is not null then
    update cart_items set quantity = v_new where id = v_line_id;
  else
    insert into cart_items (cart_id, store_id, variant_id, quantity) values (v_cart, p_store, p_variant, v_new);
  end if;
  return jsonb_build_object('outcome', 'added', 'quantity', v_new);
end $$;

create or replace function public.guest_cart_add_step(
  p_store uuid, p_session uuid, p_request uuid, p_attempt integer, p_index integer,
  p_variant uuid, p_quantity integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r guest_request_keys%rowtype;
  st guest_request_steps%rowtype;
  v_inserted integer;
  v_result jsonb;
begin
  if p_index is null or p_index < 0 or p_index >= 200 then
    raise exception 'step index out of range' using errcode = '22023';
  end if;

  -- The request row is locked for the whole transaction: only the current attempt can write steps.
  select * into r from guest_request_keys where id = p_request for update;
  if not found or r.store_id <> p_store or r.guest_session_id <> p_session then
    raise exception 'request not found' using errcode = '42501';
  end if;
  if r.status <> 'pending' or r.attempt <> p_attempt or r.lease_expires_at is null or r.lease_expires_at <= now() then
    raise exception 'request attempt is no longer current' using errcode = 'P0003';
  end if;

  insert into guest_request_steps (request_id, step_index, status, variant_id, quantity)
    values (p_request, p_index, 'started', p_variant, p_quantity)
    on conflict (request_id, step_index) do nothing;
  get diagnostics v_inserted = row_count;
  select * into st from guest_request_steps where request_id = p_request and step_index = p_index for update;

  if v_inserted = 0 then
    if st.status = 'done' then
      return jsonb_build_object('outcome', 'done');
    end if;
    -- A 'started' row without a completed outcome can only come from the pre-0056 code path. It is reported,
    -- never replayed, because whether its cart change happened is unknown.
    if st.status = 'started' then
      return jsonb_build_object('outcome', 'uncertain');
    end if;
    update guest_request_steps set status = 'started', variant_id = p_variant, quantity = p_quantity, updated_at = now()
      where request_id = p_request and step_index = p_index;
  end if;

  v_result := public.guest_cart_add_line(p_store, p_session, p_variant, p_quantity);

  update guest_request_steps
    set status = case when v_result ->> 'outcome' = 'added' then 'done' else 'failed' end, updated_at = now()
    where request_id = p_request and step_index = p_index;
  return v_result;
end $$;

create or replace function public.guest_request_progress_set(
  p_request uuid, p_attempt integer, p_progress jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update guest_request_keys set progress = progress || coalesce(p_progress, '{}'::jsonb)
    where id = p_request and attempt = p_attempt and status = 'pending' and lease_expires_at > now()
    returning id into v_id;
  return v_id is not null;
end $$;

revoke execute on function public.guest_cart_add_line(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.guest_cart_add_step(uuid, uuid, uuid, integer, integer, uuid, integer) from public, anon, authenticated;
revoke execute on function public.guest_request_progress_set(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.guest_cart_add_line(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.guest_cart_add_step(uuid, uuid, uuid, integer, integer, uuid, integer) to service_role;
grant execute on function public.guest_request_progress_set(uuid, integer, jsonb) to service_role;
