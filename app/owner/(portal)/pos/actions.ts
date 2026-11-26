'use server';

import { redirect } from 'next/navigation';
import { checkCommerce, checkFeature } from '@/lib/services/entitlements';
import { revalidatePath } from 'next/cache';
import { createRazorpayOrder } from '@/lib/payments/razorpay';
import { parseRupeesToPaise } from '@/lib/money';
import { friendly } from '@/lib/errors';
import { requireOwnerPermission, type OwnerContext } from '@/lib/services/owner';
import { findVariantBySku } from '@/lib/services/pos';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { billIdSchema, posMethodSchema, quantityFromText, uuidSchema } from '@/lib/validation/pos';
import { GST_STATE_CODES } from '@/lib/gst/policy';

export interface PosState {
  ok: boolean;
  message?: string;
  checkout?: { keyId: string; providerOrderId: string; amountPaise: number; orderNumber: string };
}

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

function fail(message: string): PosState {
  return { ok: false, message };
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/**
 * Adds one unit of a variant to a held bill (or starts a new one) by rewriting the bill through
 * pos_save_bill. The database re-checks the variant, store and stock rules; nothing is trusted from here.
 */
async function addLine(billRef: string, variantId: string, storeId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const isNew = billRef === 'new';
  const items: Array<{ variant_id: string; quantity: number; line_discount_paise: number }> = [];
  let customerId: string | null = null;
  let note: string | null = null;

  if (!isNew) {
    const { data: bill } = await supabase
      .from('pos_bills')
      .select('status, customer_id, note')
      .eq('id', billRef)
      .maybeSingle();
    if (!bill || bill.status !== 'HELD') throw new Error('This bill can no longer be edited');
    customerId = bill.customer_id ?? null;
    note = bill.note ?? null;
    const { data: rows } = await supabase
      .from('pos_bill_items')
      .select('variant_id, quantity, line_discount_paise')
      .eq('bill_id', billRef)
      .order('sort_order');
    for (const row of rows ?? []) {
      items.push({
        variant_id: row.variant_id,
        quantity: Number(row.quantity),
        line_discount_paise: Number(row.line_discount_paise),
      });
    }
  }

  const existing = items.find((item) => item.variant_id === variantId);
  if (existing) existing.quantity = Math.min(999, existing.quantity + 1);
  else items.push({ variant_id: variantId, quantity: 1, line_discount_paise: 0 });

  const { data, error } = await supabase.rpc('pos_save_bill', {
    p_bill: isNew ? null : billRef,
    p_store: storeId,
    p_customer: customerId,
    p_items: items,
    p_note: note,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

/** Holds a bill with the quantities, discounts, customer and note the owner entered. Nothing is sold. */
export async function saveBillAction(_prev: PosState, fd: FormData): Promise<PosState> {
  const owner = await requireOwnerPermission('pos_billing');
  const blocked = await checkFeature(owner.storeId, 'pos_billing');
  if (blocked) return fail(blocked);
  const billId = uuidSchema.safeParse(text(fd, 'billId'));
  if (!billId.success) return fail('This bill could not be found');
  const customerRaw = text(fd, 'customerId');
  const customer = customerRaw === '' ? null : uuidSchema.safeParse(customerRaw);
  if (customer && !customer.success) return fail('Choose a valid customer');
  const note = text(fd, 'note').trim().slice(0, 300) || null;

  const items: Array<{ variant_id: string; quantity: number; line_discount_paise: number }> = [];
  for (const key of fd.keys()) {
    if (!key.startsWith('qty:')) continue;
    const variantId = key.slice(4);
    if (!uuidSchema.safeParse(variantId).success) return fail('A line in the bill is invalid. Reload the page.');
    if (text(fd, `remove:${variantId}`) === 'on') continue;
    const quantity = quantityFromText(text(fd, key));
    if (quantity === null) return fail('Quantity must be more than 0, at most 999, with up to 3 decimals');
    const discount = parseRupeesToPaise(text(fd, `disc:${variantId}`) || '0');
    if (discount === null || discount < 0) return fail('Enter each discount as an amount in rupees');
    items.push({ variant_id: variantId, quantity, line_discount_paise: discount });
  }
  if (items.length === 0) return fail('Keep at least one item in the bill, or cancel it');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('pos_save_bill', {
    p_bill: billId.data,
    p_store: owner.storeId,
    p_customer: customer?.success ? customer.data : null,
    p_items: items,
    p_note: note,
  });
  if (error) return fail(friendly(error.message));
  revalidatePath(`/owner/pos/${billId.data}`);
  return { ok: true, message: 'Bill held. No stock has moved and nothing is recorded as a sale.' };
}

/** Barcode or typed SKU: adds one unit of the matching variant and opens the bill. */
export async function scanSkuAction(_prev: PosState, fd: FormData): Promise<PosState> {
  const scanOwner = await requireOwnerPermission('pos_billing');
  const scanBlocked = await checkFeature(scanOwner.storeId, 'pos_billing');
  if (scanBlocked) return fail(scanBlocked);
  const owner = await requireOwnerPermission('pos_billing');
  const billRef = billIdSchema.safeParse(text(fd, 'billId'));
  if (!billRef.success) return fail('This bill could not be found');
  const sku = text(fd, 'sku').trim();
  if (!sku) return fail('Scan or type a SKU first');
  const hit = await findVariantBySku(sku);
  if (!hit) return fail(`No active product has the SKU "${sku}"`);
  let id: string;
  try {
    id = await addLine(billRef.data, hit.id, owner.storeId);
  } catch (cause) {
    return fail(messageOf(cause, 'Could not add the item'));
  }
  redirect(`/owner/pos/${id}`);
}

/** Search-result button: adds one unit of a variant and opens the bill. */
export async function addVariantAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('pos_billing');
  const billRef = billIdSchema.safeParse(text(fd, 'billId'));
  const variant = uuidSchema.safeParse(text(fd, 'variantId'));
  if (!billRef.success || !variant.success) {
    redirect(`/owner/pos/new?error=${encodeURIComponent('Choose the product again')}`);
  }
  let id: string;
  try {
    id = await addLine(billRef.data, variant.data, owner.storeId);
  } catch (cause) {
    redirect(`/owner/pos/new?error=${encodeURIComponent(messageOf(cause, 'Could not add the item'))}`);
  }
  redirect(`/owner/pos/${id}`);
}

/**
 * Applies a coupon to a held bill, or removes it when the code is blank. The database checks the code, its dates,
 * usage limit and minimum order, and reprices the bill; nothing about the discount is computed here.
 */
export async function setCouponAction(_prev: PosState, fd: FormData): Promise<PosState> {
  const owner = await requireOwnerPermission('pos_billing');
  const couponBlocked = await checkFeature(owner.storeId, 'pos_billing');
  if (couponBlocked) return fail(couponBlocked);
  // Applying an existing coupon needs pos_billing only; coupon administration needs store_settings (database policy).
  const billId = uuidSchema.safeParse(text(fd, 'billId'));
  if (!billId.success) return fail('This bill could not be found');
  const raw = text(fd, 'code').trim();
  if (raw.length > 40) return fail('Coupon codes are at most 40 characters');
  if (raw !== '' && !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return fail('Coupon codes use letters, numbers, dashes and underscores only');
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('pos_set_coupon', { p_bill: billId.data, p_code: raw === '' ? null : raw });
  if (error) return fail(friendly(error.message));
  revalidatePath(`/owner/pos/${billId.data}`);
  return {
    ok: true,
    message: raw === '' ? 'Coupon removed. Totals are recalculated.' : `Coupon ${raw.toUpperCase()} applied. Totals are recalculated.`,
  };
}

/**
 * Sets how a held bill is supplied: in-store sale or delivery, the delivery state (place of supply) and the buyer's
 * GSTIN. The database validates the GSTIN format and the place of supply, and reprices the bill. Nothing tax-related
 * is computed here, and the client never sends a tax amount.
 */
export async function setTaxDetailsAction(_prev: PosState, fd: FormData): Promise<PosState> {
  await requireOwnerPermission('pos_billing');
  const billId = uuidSchema.safeParse(text(fd, 'billId'));
  if (!billId.success) return fail('This bill could not be found');
  const fulfilment = text(fd, 'fulfilment');
  if (fulfilment !== 'in_store' && fulfilment !== 'delivery') return fail('Choose in-store sale or delivery');
  const deliveryState = text(fd, 'deliveryState').trim();
  if (fulfilment === 'delivery' && !GST_STATE_CODES.some((s) => s.code === deliveryState)) {
    return fail('Choose the state where the order will be delivered');
  }
  const gstin = text(fd, 'buyerGstin').trim().toUpperCase();
  if (gstin.length > 15) return fail('A GSTIN has 15 characters');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('pos_set_tax_details', {
    p_bill: billId.data,
    p_fulfilment: fulfilment,
    p_delivery_state: fulfilment === 'delivery' ? deliveryState : null,
    p_buyer_gstin: gstin === '' ? null : gstin,
  });
  if (error) return fail(friendly(error.message));
  revalidatePath(`/owner/pos/${billId.data}`);
  return { ok: true, message: 'Tax details saved. Totals are recalculated.' };
}

export async function cancelBillAction(_prev: PosState, fd: FormData): Promise<PosState> {
  await requireOwnerPermission('pos_billing');
  const billId = uuidSchema.safeParse(text(fd, 'billId'));
  if (!billId.success) return fail('This bill could not be found');
  const reason = text(fd, 'reason').trim();
  if (reason.length < 3) return fail('Give a reason of at least 3 characters');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('pos_cancel_bill', { p_bill: billId.data, p_reason: reason.slice(0, 200) });
  if (error) return fail(friendly(error.message));
  revalidatePath('/owner/pos');
  redirect('/owner/pos');
}

/**
 * Online POS payment: the total is re-quoted from the database, a Razorpay order is created for it,
 * and the bill is linked to that order through the server-only placement function. The browser then
 * pays through Razorpay Checkout; the verify route and webhook settle the payment.
 */
async function startOnlinePayment(owner: OwnerContext, billId: string): Promise<PosState> {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!keyId) return fail('Online payment is not configured for this store yet');
  const supabase = await createSupabaseServerClient();
  const { data: bill } = await supabase
    .from('pos_bills')
    .select('bill_reference, status')
    .eq('id', billId)
    .maybeSingle();
  if (!bill || bill.status !== 'HELD') return fail('This bill is no longer open for payment');
  const { data: quote, error: quoteError } = await supabase.rpc('pos_quote_bill', { p_bill: billId });
  if (quoteError) return fail(friendly(quoteError.message));
  const amountPaise = Number((quote as { total_paise: number }).total_paise);
  if (!(amountPaise > 0)) return fail('The bill total must be more than zero');

  const order = await createRazorpayOrder({
    amountPaise,
    receipt: bill.bill_reference,
    notes: { pos_bill: billId, store_id: owner.storeId },
  }).catch(() => null);
  if (!order) return fail('Could not start the online payment. Try again, or take another method.');

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('pos_place_bill', {
    p_bill: billId,
    p_actor: owner.userId,
    p_method: 'online',
    p_provider_order_id: order.id,
    p_expires_at: null,
  });
  if (error) return fail(friendly(error.message));
  if ((data as { replayed: boolean }).replayed) {
    return fail('This bill is already waiting for payment. Refresh the page.');
  }
  revalidatePath('/owner/pos');
  return {
    ok: true,
    message: 'Payment window ready',
    checkout: { keyId, providerOrderId: order.id, amountPaise, orderNumber: bill.bill_reference },
  };
}

/** Takes payment for a held bill. Cash and credit complete immediately and are redirected to the invoice. */
export async function placeBillAction(_prev: PosState, fd: FormData): Promise<PosState> {
  const owner = await requireOwnerPermission('pos_billing');
  const placeBlocked = await checkFeature(owner.storeId, 'pos_billing');
  if (placeBlocked) return fail(placeBlocked);
  const commerceBlocked = await checkCommerce(owner.storeId);
  if (commerceBlocked) return fail(commerceBlocked);
  const billId = uuidSchema.safeParse(text(fd, 'billId'));
  const method = posMethodSchema.safeParse(text(fd, 'method'));
  if (!billId.success || !method.success) return fail('Choose a payment method');

  if (method.data === 'online') return startOnlinePayment(owner, billId.data);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('pos_place_bill', {
    p_bill: billId.data,
    p_actor: owner.userId,
    p_method: method.data,
    p_provider_order_id: null,
    p_expires_at: null,
  });
  if (error) return fail(friendly(error.message));
  revalidatePath('/owner/pos');
  redirect(`/owner/pos/sales/${(data as { order_id: string }).order_id}`);
}
