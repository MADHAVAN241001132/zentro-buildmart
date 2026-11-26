-- 0008: tile batches, purchase orders, supplier invoices and payments.
-- Writes go through security definer functions that check the store, quantities and money.
-- Direct writes to purchase and supplier-ledger tables are revoked from authenticated users.

-- ---------------------------------------------------------------------------
-- Tile batches. Batch quantities are a breakdown of variant inventory:
-- the sum of batch on_hand must never exceed inventory.on_hand.
-- ---------------------------------------------------------------------------

create or replace function create_inventory_batch(
  p_variant uuid, p_batch_number text, p_shade text, p_calibre text,
  p_manufacturing_date date, p_supplier uuid, p_opening_quantity bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_batch uuid;
  v_number text := btrim(coalesce(p_batch_number, ''));
begin
  select store_id into v_store from product_variants where id = p_variant;
  if v_store is null then raise exception 'unknown variant' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager']);
  if length(v_number) < 1 or length(v_number) > 60 then
    raise exception 'batch number must be 1 to 60 characters' using errcode = 'P0001';
  end if;
  if p_opening_quantity is null or p_opening_quantity < 0 or p_opening_quantity > 1000000000 then
    raise exception 'opening quantity must be between 0 and 1000000000' using errcode = 'P0001';
  end if;
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and store_id = v_store) then
    raise exception 'supplier does not belong to this store' using errcode = 'P0001';
  end if;

  insert into inventory_batches (store_id, variant_id, supplier_id, batch_number, shade_code, calibre, manufacturing_date, on_hand)
  values (v_store, p_variant, p_supplier, v_number,
          nullif(btrim(coalesce(p_shade, '')), ''), nullif(btrim(coalesce(p_calibre, '')), ''),
          p_manufacturing_date, p_opening_quantity)
  returning id into v_batch;

  if p_opening_quantity > 0 then
    update inventory set on_hand = on_hand + p_opening_quantity, updated_at = now()
    where variant_id = p_variant and store_id = v_store;
    if not found then
      insert into inventory (store_id, variant_id, on_hand) values (v_store, p_variant, p_opening_quantity);
    end if;
    insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, actor_id, note)
    values (v_store, p_variant, v_batch, 'opening', p_opening_quantity, auth.uid(), 'batch ' || v_number);
  end if;

  perform app.audit(v_store, 'batch.created', 'inventory_batches', v_batch, null,
    jsonb_build_object('batch', v_number, 'opening', p_opening_quantity));
  return v_batch;
end $$;

create or replace function update_inventory_batch(
  p_batch uuid, p_shade text, p_calibre text, p_manufacturing_date date, p_supplier uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
begin
  select store_id into v_store from inventory_batches where id = p_batch;
  if v_store is null then raise exception 'batch not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager']);
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and store_id = v_store) then
    raise exception 'supplier does not belong to this store' using errcode = 'P0001';
  end if;

  update inventory_batches set
    shade_code = nullif(btrim(coalesce(p_shade, '')), ''),
    calibre = nullif(btrim(coalesce(p_calibre, '')), ''),
    manufacturing_date = p_manufacturing_date,
    supplier_id = p_supplier,
    updated_at = now()
  where id = p_batch;
  perform app.audit(v_store, 'batch.updated', 'inventory_batches', p_batch, null,
    jsonb_build_object('shade', p_shade, 'calibre', p_calibre, 'supplier', p_supplier));
end $$;

-- Adjusts one batch. Variant inventory moves by the same amount so the totals stay consistent.
create or replace function adjust_batch_stock(p_batch uuid, p_delta bigint, p_reason text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_batch inventory_batches%rowtype;
  v_inv inventory%rowtype;
begin
  select * into v_batch from inventory_batches where id = p_batch for update;
  if not found then raise exception 'batch not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_batch.store_id, array['owner','manager']);
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000000000 then
    raise exception 'adjustment must be a non-zero whole number' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason of at least 3 characters' using errcode = 'P0001';
  end if;
  if v_batch.on_hand + p_delta < v_batch.reserved then
    raise exception 'adjustment would drop batch on-hand (%) below reserved (%)', v_batch.on_hand + p_delta, v_batch.reserved
      using errcode = 'P0001';
  end if;

  select * into v_inv from inventory where variant_id = v_batch.variant_id and store_id = v_batch.store_id for update;
  if not found then raise exception 'inventory row missing for variant' using errcode = 'P0001'; end if;
  if v_inv.on_hand + p_delta < v_inv.reserved then
    raise exception 'adjustment would drop variant on-hand (%) below reserved (%)', v_inv.on_hand + p_delta, v_inv.reserved
      using errcode = 'P0001';
  end if;
  if v_inv.on_hand + p_delta < 0 then
    raise exception 'inventory cannot become negative' using errcode = 'P0001';
  end if;

  update inventory_batches set on_hand = on_hand + p_delta, updated_at = now() where id = p_batch;
  update inventory set on_hand = on_hand + p_delta, updated_at = now() where id = v_inv.id;
  insert into stock_movements (store_id, variant_id, batch_id, movement_type, quantity, actor_id, note)
  values (v_batch.store_id, v_batch.variant_id, p_batch, 'adjustment', p_delta, auth.uid(), p_reason);
  perform app.audit(v_batch.store_id, 'batch.adjusted', 'inventory_batches', p_batch,
    jsonb_build_object('on_hand', v_batch.on_hand), jsonb_build_object('on_hand', v_batch.on_hand + p_delta, 'reason', p_reason));
  return v_batch.on_hand + p_delta;
end $$;

-- Reports how batch quantities compare with variant inventory.
create or replace function batch_consistency(p_variant uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_on bigint;
  v_batch_on bigint;
begin
  select store_id into v_store from product_variants where id = p_variant;
  if v_store is null then raise exception 'unknown variant' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager','staff']);
  select coalesce(on_hand, 0) into v_on from inventory where variant_id = p_variant;
  select coalesce(sum(on_hand), 0) into v_batch_on from inventory_batches where variant_id = p_variant;
  return jsonb_build_object(
    'variant_on_hand', coalesce(v_on, 0),
    'batch_on_hand', v_batch_on,
    'untracked_on_hand', coalesce(v_on, 0) - v_batch_on,
    'consistent', v_batch_on <= coalesce(v_on, 0));
end $$;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------

create or replace function create_purchase_order(p_supplier uuid, p_expected date, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_po uuid;
  v_number text;
  v_line jsonb;
  v_variant uuid;
  v_qty bigint;
  v_cost bigint;
  v_total bigint := 0;
begin
  select store_id into v_store from suppliers where id = p_supplier and is_active;
  if v_store is null then raise exception 'supplier not found or inactive' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager']);
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a purchase order needs at least one line' using errcode = 'P0001';
  end if;

  v_number := app.next_number(v_store, 'po', 'PO');
  insert into purchase_orders (store_id, supplier_id, po_number, status, expected_on, total_paise, created_by)
  values (v_store, p_supplier, v_number, 'draft', p_expected, 0, auth.uid())
  returning id into v_po;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant := (v_line ->> 'variant_id')::uuid;
    v_qty := (v_line ->> 'quantity')::bigint;
    v_cost := (v_line ->> 'unit_cost_paise')::bigint;
    if not exists (select 1 from product_variants where id = v_variant and store_id = v_store) then
      raise exception 'variant does not belong to this store' using errcode = 'P0001';
    end if;
    if v_qty <= 0 or v_qty > 1000000000 then raise exception 'quantity must be between 1 and 1000000000' using errcode = 'P0001'; end if;
    if v_cost < 0 then raise exception 'unit cost cannot be negative' using errcode = 'P0001'; end if;
    insert into purchase_order_items (purchase_order_id, store_id, variant_id, quantity_ordered, unit_cost_paise)
    values (v_po, v_store, v_variant, v_qty, v_cost);
    v_total := v_total + v_qty * v_cost;
  end loop;

  update purchase_orders set total_paise = v_total, updated_at = now() where id = v_po;
  perform app.audit(v_store, 'purchase_order.created', 'purchase_orders', v_po, null,
    jsonb_build_object('po', v_number, 'total_paise', v_total));
  return v_po;
end $$;

-- draft -> sent adds the outstanding quantity to incoming stock.
-- sent or draft -> cancelled releases it, and is refused once goods have been received.
create or replace function set_purchase_order_status(p_po uuid, p_to text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_po purchase_orders%rowtype;
  v_item purchase_order_items%rowtype;
  v_received bigint;
begin
  select * into v_po from purchase_orders where id = p_po for update;
  if not found then raise exception 'purchase order not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_po.store_id, array['owner','manager']);

  if v_po.status = 'draft' and p_to = 'sent' then
    for v_item in select * from purchase_order_items where purchase_order_id = p_po loop
      update inventory set incoming = incoming + (v_item.quantity_ordered - v_item.quantity_received), updated_at = now()
      where variant_id = v_item.variant_id and store_id = v_po.store_id;
    end loop;
  elsif v_po.status in ('draft', 'sent') and p_to = 'cancelled' then
    select coalesce(sum(quantity_received), 0) into v_received from purchase_order_items where purchase_order_id = p_po;
    if v_received > 0 then
      raise exception 'cannot cancel a purchase order after goods were received' using errcode = 'P0001';
    end if;
    if v_po.status = 'sent' then
      for v_item in select * from purchase_order_items where purchase_order_id = p_po loop
        update inventory set incoming = greatest(incoming - (v_item.quantity_ordered - v_item.quantity_received), 0), updated_at = now()
        where variant_id = v_item.variant_id and store_id = v_po.store_id;
      end loop;
    end if;
  else
    raise exception 'cannot move a % purchase order to %', v_po.status, p_to using errcode = 'P0001';
  end if;

  update purchase_orders set status = p_to, updated_at = now() where id = p_po;
  perform app.audit(v_po.store_id, 'purchase_order.status', 'purchase_orders', p_po,
    jsonb_build_object('status', v_po.status), jsonb_build_object('status', p_to));
  return p_to;
end $$;

-- ---------------------------------------------------------------------------
-- Supplier invoices and payments
-- ---------------------------------------------------------------------------

create or replace function record_supplier_invoice(
  p_supplier uuid, p_po uuid, p_invoice_number text, p_invoice_date date, p_amount bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_id uuid;
begin
  select store_id into v_store from suppliers where id = p_supplier;
  if v_store is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager']);
  if p_amount is null or p_amount <= 0 then raise exception 'invoice amount must be positive' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_invoice_number, ''))) < 1 then raise exception 'invoice number is required' using errcode = 'P0001'; end if;
  if p_po is not null and not exists (select 1 from purchase_orders where id = p_po and store_id = v_store and supplier_id = p_supplier) then
    raise exception 'purchase order does not match this supplier' using errcode = 'P0001';
  end if;

  insert into supplier_invoices (store_id, supplier_id, purchase_order_id, invoice_number, invoice_date, amount_paise)
  values (v_store, p_supplier, p_po, btrim(p_invoice_number), p_invoice_date, p_amount)
  returning id into v_id;
  perform app.audit(v_store, 'supplier_invoice.recorded', 'supplier_invoices', v_id, null,
    jsonb_build_object('invoice', p_invoice_number, 'amount_paise', p_amount));
  return v_id;
end $$;

-- Outstanding payable to a supplier: invoices minus payments.
create or replace function supplier_balance(p_supplier uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_invoiced bigint;
  v_paid bigint;
begin
  select store_id into v_store from suppliers where id = p_supplier;
  if v_store is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager','staff']);
  select coalesce(sum(amount_paise), 0) into v_invoiced from supplier_invoices where supplier_id = p_supplier;
  select coalesce(sum(amount_paise), 0) into v_paid from supplier_payments where supplier_id = p_supplier;
  return v_invoiced - v_paid;
end $$;

create or replace function record_supplier_payment(
  p_supplier uuid, p_invoice uuid, p_amount bigint, p_method text, p_reference text, p_paid_on date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_balance bigint;
  v_invoice_due bigint;
  v_id uuid;
begin
  select store_id into v_store from suppliers where id = p_supplier for update;
  if v_store is null then raise exception 'supplier not found' using errcode = 'P0002'; end if;
  perform app.assert_store_access(v_store, array['owner','manager']);
  if p_amount is null or p_amount <= 0 then raise exception 'payment must be positive' using errcode = 'P0001'; end if;
  if p_method not in ('cash','bank','upi','cheque') then raise exception 'unknown payment method' using errcode = 'P0001'; end if;

  v_balance := supplier_balance(p_supplier);
  if p_amount > v_balance then
    raise exception 'payment (%) exceeds the outstanding balance (%)', p_amount, v_balance using errcode = 'P0001';
  end if;

  if p_invoice is not null then
    select amount_paise - coalesce((select sum(amount_paise) from supplier_payments where supplier_invoice_id = p_invoice), 0)
      into v_invoice_due
    from supplier_invoices where id = p_invoice and supplier_id = p_supplier and store_id = v_store;
    if v_invoice_due is null then raise exception 'invoice does not belong to this supplier' using errcode = 'P0001'; end if;
    if p_amount > v_invoice_due then
      raise exception 'payment (%) exceeds the invoice balance (%)', p_amount, v_invoice_due using errcode = 'P0001';
    end if;
  end if;

  insert into supplier_payments (store_id, supplier_id, supplier_invoice_id, amount_paise, paid_on, method, reference)
  values (v_store, p_supplier, p_invoice, p_amount, coalesce(p_paid_on, current_date), p_method, nullif(btrim(coalesce(p_reference, '')), ''))
  returning id into v_id;
  perform app.audit(v_store, 'supplier_payment.recorded', 'supplier_payments', v_id, null,
    jsonb_build_object('amount_paise', p_amount, 'method', p_method));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: direct writes to purchase and supplier-ledger tables are revoked.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on purchase_orders, purchase_order_items, supplier_invoices, supplier_payments from authenticated;
revoke insert, update, delete on purchase_orders, purchase_order_items, supplier_invoices, supplier_payments from anon;

revoke execute on function
  create_inventory_batch(uuid, text, text, text, date, uuid, bigint),
  update_inventory_batch(uuid, text, text, date, uuid),
  adjust_batch_stock(uuid, bigint, text),
  batch_consistency(uuid),
  create_purchase_order(uuid, date, jsonb),
  set_purchase_order_status(uuid, text),
  record_supplier_invoice(uuid, uuid, text, date, bigint),
  supplier_balance(uuid),
  record_supplier_payment(uuid, uuid, bigint, text, text, date)
from public, anon;

grant execute on function
  create_inventory_batch(uuid, text, text, text, date, uuid, bigint),
  update_inventory_batch(uuid, text, text, date, uuid),
  adjust_batch_stock(uuid, bigint, text),
  batch_consistency(uuid),
  create_purchase_order(uuid, date, jsonb),
  set_purchase_order_status(uuid, text),
  record_supplier_invoice(uuid, uuid, text, date, bigint),
  supplier_balance(uuid),
  record_supplier_payment(uuid, uuid, bigint, text, text, date)
to authenticated;
