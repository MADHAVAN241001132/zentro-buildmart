import 'server-only';
import { assertFeature, assertSubscriptionActive } from '@/lib/services/entitlements';
import { paymentMode } from '@/lib/env';
import { hashGuestToken, generateGuestToken } from '@/lib/guest/token';
import { createRazorpayOrder } from '@/lib/payments/razorpay';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCartView } from '@/lib/services/cart';

/**
 * Quotation workflow. Every write is a server-only database function that checks the acting user or guest
 * and the state of the quotation. This module maps results and errors, issues share tokens and creates
 * payment gateway orders. The database is the authority for money, stock and status.
 */

export class QuotationError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 500 = 400) {
    super(message);
  }
}

type RpcError = { code?: string; message: string };

function mapRpcError(error: RpcError): QuotationError {
  if (error.code === '42501') return new QuotationError('You are not allowed to do this.', 403);
  if (error.code === 'P0002') return new QuotationError('Quotation not found.', 404);
  if (error.code === 'P0001') {
    const message = error.message.replace(/^insufficient_stock: /, 'Stock is no longer enough: ');
    return new QuotationError(message.slice(0, 300), 409);
  }
  if (error.message.includes('duplicate key')) return new QuotationError('That was already done. Refresh the page.', 409);
  return new QuotationError('Something went wrong. Please try again.', 500);
}

function shareHash(token: string): string {
  return hashGuestToken(token);
}

export interface SkuResolution {
  [sku: string]: string;
}

/** Maps SKUs typed by the owner to variant ids inside one store. Unknown SKUs are listed in the error. */
export async function resolveSkus(storeId: string, skus: string[]): Promise<SkuResolution> {
  const unique = [...new Set(skus)];
  if (unique.length === 0) return {};
  const { data, error } = await createSupabaseAdminClient()
    .from('product_variants')
    .select('id, sku')
    .eq('store_id', storeId)
    .in('sku', unique);
  if (error) throw new QuotationError('Could not look up products.', 500);
  const found: SkuResolution = {};
  for (const row of (data ?? []) as { id: string; sku: string }[]) found[row.sku] = row.id;
  const missing = unique.filter((sku) => !found[sku]);
  if (missing.length > 0) throw new QuotationError(`Unknown SKU: ${missing.slice(0, 5).join(', ')}`, 400);
  return found;
}

export interface OwnerLineInput {
  variantId: string;
  quantity: number;
  unitPricePaise: number | null;
  discountPaise: number;
}

export interface OwnerQuotationInput {
  customerId: string | null;
  customerName: string;
  customerMobile: string | null;
  customerEmail: string | null;
  projectName: string | null;
  requirements: string | null;
  deliveryExpectation: string | null;
  deliveryAddress: string | null;
  deliveryPaise: number;
  validUntil: string | null;
  terms: string | null;
  lines: OwnerLineInput[];
}

function ownerPayload(input: OwnerQuotationInput): Record<string, unknown> {
  return {
    customer_id: input.customerId,
    customer_name: input.customerName,
    customer_mobile: input.customerMobile,
    customer_email: input.customerEmail,
    project_name: input.projectName,
    requirements: input.requirements,
    delivery_expectation: input.deliveryExpectation,
    delivery_address: input.deliveryAddress,
    delivery_paise: input.deliveryPaise,
    valid_until: input.validUntil,
    terms: input.terms,
    lines: input.lines.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
      unit_price_paise: line.unitPricePaise,
      discount_paise: line.discountPaise,
    })),
  };
}

/** Creates a draft (quotationId null) or re-prices a REQUESTED or DRAFT quotation. Returns the quotation id. */
export async function ownerSaveQuotation(storeId: string, actorId: string, quotationId: string | null, input: OwnerQuotationInput): Promise<string> {
  await assertFeature(storeId, 'quotations');
  await assertSubscriptionActive(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('quotation_save', {
    p_store: storeId,
    p_actor: actorId,
    p_quotation: quotationId,
    p_payload: ownerPayload(input),
  });
  if (error) throw mapRpcError(error);
  return data as string;
}

export interface ShareLink {
  token: string;
}

/** Sends a DRAFT. Returns the raw share token once; only its hash is stored. */
export async function ownerSendQuotation(storeId: string, actorId: string, quotationId: string): Promise<ShareLink> {
  await assertFeature(storeId, 'quotations');
  const token = generateGuestToken();
  const { error } = await createSupabaseAdminClient().rpc('quotation_send', {
    p_store: storeId,
    p_actor: actorId,
    p_quotation: quotationId,
    p_token_hash: shareHash(token),
  });
  if (error) throw mapRpcError(error);
  return { token };
}

/** Issues a new link for a SENT quotation. The previous link stops working. */
export async function ownerRotateShareLink(storeId: string, actorId: string, quotationId: string): Promise<ShareLink> {
  const token = generateGuestToken();
  const { error } = await createSupabaseAdminClient().rpc('quotation_rotate_share', {
    p_store: storeId,
    p_actor: actorId,
    p_quotation: quotationId,
    p_token_hash: shareHash(token),
  });
  if (error) throw mapRpcError(error);
  return { token };
}

export async function ownerReviseQuotation(storeId: string, actorId: string, quotationId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc('quotation_revise', { p_store: storeId, p_actor: actorId, p_quotation: quotationId });
  if (error) throw mapRpcError(error);
}

export async function ownerCancelQuotation(storeId: string, actorId: string, quotationId: string, reason: string): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc('quotation_cancel', {
    p_store: storeId,
    p_actor: actorId,
    p_quotation: quotationId,
    p_reason: reason,
  });
  if (error) throw mapRpcError(error);
}

async function paymentExpiry(storeId: string): Promise<string> {
  const { data } = await createSupabaseAdminClient()
    .from('store_settings').select('payment_expiry_minutes').eq('store_id', storeId).maybeSingle();
  const minutes = Number((data as { payment_expiry_minutes?: number } | null)?.payment_expiry_minutes ?? 15);
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

interface ConvertInput {
  storeId: string;
  quotationId: string;
  method: 'online' | 'cash' | 'credit';
  actorId: string | null;
  sessionId: string | null;
  token: string | null;
}

export interface ConvertResult {
  orderId: string;
  orderNumber: string;
  method: string;
  replayed: boolean;
}

/**
 * Converts an ACCEPTED quotation into an order. Owners may use cash or credit. Customers may use online or cash.
 * An online conversion creates the gateway order before the database call; a refused conversion leaves that
 * gateway order unused, which is harmless, and a repeated conversion returns the existing order.
 */
export async function convertQuotation(input: ConvertInput): Promise<ConvertResult> {
  const admin = createSupabaseAdminClient();
  const { data: row, error: readError } = await admin
    .from('quotations')
    .select('id, quotation_number, status, total_paise, store_id, converted_order_id')
    .eq('id', input.quotationId)
    .eq('store_id', input.storeId)
    .maybeSingle();
  if (readError) throw new QuotationError('Something went wrong. Please try again.', 500);
  if (!row) throw new QuotationError('Quotation not found.', 404);

  if (row.status === 'CONVERTED' && row.converted_order_id) {
    const { data: order } = await admin.from('orders').select('order_number').eq('id', row.converted_order_id as string).maybeSingle();
    return { orderId: row.converted_order_id as string, orderNumber: (order?.order_number as string) ?? '', method: input.method, replayed: true };
  }
  if (row.status !== 'ACCEPTED') throw new QuotationError(`Only an accepted quotation can be converted (this one is ${row.status}).`, 409);

  let provider: string | null = null;
  let providerOrderId: string | null = null;
  const expiresAt = input.method === 'online' ? await paymentExpiry(input.storeId) : null;
  if (input.method === 'online') {
    if (paymentMode() === 'razorpay') {
      const order = await createRazorpayOrder({
        amountPaise: Number(row.total_paise),
        receipt: `QT-${row.quotation_number as string}`,
        notes: { store_id: input.storeId, quotation_id: input.quotationId },
      });
      provider = 'razorpay';
      providerOrderId = order.id;
    }
  }

  const { data, error } = await admin.rpc('quotation_convert', {
    p_quotation: input.quotationId,
    p_actor: input.actorId,
    p_guest_session: input.sessionId,
    p_token_hash: input.token ? shareHash(input.token) : null,
    p_method: input.method,
    p_provider: provider,
    p_provider_order_id: providerOrderId,
    p_expires_at: expiresAt,
  });
  if (error) throw mapRpcError(error);
  const result = data as { order_id: string; order_number: string; method: string; replayed: boolean };
  return { orderId: result.order_id, orderNumber: result.order_number, method: result.method, replayed: result.replayed };
}

export async function ownerConvertQuotation(storeId: string, actorId: string, quotationId: string, method: 'cash' | 'credit'): Promise<ConvertResult> {
  return convertQuotation({ storeId, quotationId, method, actorId, sessionId: null, token: null });
}

export interface GuestRequestInput {
  customerName: string;
  customerMobile: string;
  customerEmail: string | null;
  projectName: string | null;
  requirements: string | null;
  deliveryAddress: string | null;
  deliveryExpectation: string | null;
  lines: { variantId: string; quantity: number }[];
}

/** A guest enquiry. Quantities only; the store prices it. Returns the new quotation id. */
export async function guestRequestQuotation(storeId: string, sessionId: string, input: GuestRequestInput): Promise<string> {
  const { data, error } = await createSupabaseAdminClient().rpc('quotation_guest_request', {
    p_store: storeId,
    p_guest_session: sessionId,
    p_payload: {
      customer_name: input.customerName,
      customer_mobile: input.customerMobile,
      customer_email: input.customerEmail,
      project_name: input.projectName,
      requirements: input.requirements,
      delivery_address: input.deliveryAddress,
      delivery_expectation: input.deliveryExpectation,
      lines: input.lines.map((line) => ({ variant_id: line.variantId, quantity: line.quantity })),
    },
  });
  if (error) throw mapRpcError(error);
  return data as string;
}

/**
 * Same as guestRequestQuotation, but the store creates at most one quotation per request key. A retried
 * or reclaimed planner request returns the quotation that was already made instead of a second one.
 */
export async function guestRequestQuotationOnce(storeId: string, sessionId: string, input: GuestRequestInput, requestKey: string): Promise<string> {
  const { data, error } = await createSupabaseAdminClient().rpc('planner_quotation_request', {
    p_store: storeId,
    p_guest_session: sessionId,
    p_payload: {
      customer_name: input.customerName,
      customer_mobile: input.customerMobile,
      customer_email: input.customerEmail,
      project_name: input.projectName,
      requirements: input.requirements,
      delivery_address: input.deliveryAddress,
      delivery_expectation: input.deliveryExpectation,
      lines: input.lines.map((line) => ({ variant_id: line.variantId, quantity: line.quantity })),
    },
    p_request_key: requestKey,
  });
  if (error) throw mapRpcError(error);
  return data as string;
}

/** The lines of the guest's active cart, for "request a quotation for my cart". */
export async function cartLinesForQuotation(storeId: string, sessionId: string): Promise<{ variantId: string; quantity: number; sku: string; name: string }[]> {
  const view = await getCartView(storeId, sessionId);
  return view.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, sku: line.sku, name: line.productName }));
}

export async function guestWithdrawQuotation(storeId: string, sessionId: string, quotationId: string): Promise<void> {
  const ref = await resolveRef({ storeId, quotationId, sessionId, token: null });
  const { error } = await createSupabaseAdminClient().rpc('quotation_guest_withdraw', { p_quotation: ref.id, p_guest_session: sessionId });
  if (error) throw mapRpcError(error);
}

export type CustomerDecision = 'accept' | 'reject';

/** Accept or reject. Authority is the owning guest session, or the share token for this store. */
export async function respondToQuotation(input: {
  storeId: string;
  quotationId: string;
  sessionId: string | null;
  token: string | null;
  decision: CustomerDecision;
  note: string | null;
}): Promise<'ACCEPTED' | 'REJECTED' | 'EXPIRED'> {
  const ref = await resolveRef(input);
  const { data, error } = await createSupabaseAdminClient().rpc('quotation_respond', {
    p_quotation: ref.id,
    p_decision: input.decision,
    p_note: input.note,
    p_guest_session: input.sessionId,
    p_token_hash: input.token ? shareHash(input.token) : null,
  });
  if (error) throw mapRpcError(error);
  return data as 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
}

/** Finds the quotation a guest or share link refers to, within the store. Anything else is "not found". */
async function resolveRef(input: { storeId: string; quotationId: string; sessionId: string | null; token: string | null }): Promise<{ id: string; status: string }> {
  const { data, error } = await createSupabaseAdminClient()
    .from('quotations')
    .select('id, status, guest_session_id, share_token_hash')
    .eq('id', input.quotationId)
    .eq('store_id', input.storeId)
    .maybeSingle();
  if (error || !data) throw new QuotationError('Quotation not found.', 404);
  const row = data as { id: string; status: string; guest_session_id: string | null; share_token_hash: string | null };
  const bySession = input.sessionId !== null && row.guest_session_id === input.sessionId;
  const byToken = input.token !== null && row.share_token_hash !== null && row.share_token_hash === shareHash(input.token);
  if (!bySession && !byToken) throw new QuotationError('Quotation not found.', 404);
  return { id: row.id, status: row.status };
}

export interface QuotationLineView {
  name: string;
  variantLabel: string;
  sku: string;
  hsnCode: string | null;
  quantity: number;
  unitPricePaise: number;
  discountPaise: number;
  gstRateBps: number;
  taxablePaise: number;
  taxPaise: number;
  lineTotalPaise: number;
}

export interface QuotationView {
  id: string;
  number: string;
  status: string;
  source: 'owner' | 'guest';
  revision: number;
  createdAt: string;
  sentAt: string | null;
  validUntil: string | null;
  customerName: string;
  customerMobile: string | null;
  customerEmail: string | null;
  projectName: string | null;
  requirements: string | null;
  deliveryAddress: string | null;
  deliveryExpectation: string | null;
  terms: string | null;
  deliveryPaise: number;
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
  priced: boolean;
  responseNote: string | null;
  convertedOrderNumber: string | null;
  lines: QuotationLineView[];
  canRespond: boolean;
  canConvert: boolean;
  canWithdraw: boolean;
}

const VIEW_SELECT = `id, quotation_number, source, status, revision, created_at, sent_at, valid_until, customer_name, customer_mobile,
  customer_email, project_name, requirements, delivery_address, delivery_expectation, terms, delivery_paise, subtotal_paise,
  discount_paise, taxable_paise, tax_paise, total_paise, response_note, converted_order_id,
  quotation_items(product_name_snapshot, variant_label_snapshot, sku_snapshot, hsn_code_snapshot, quantity, unit_price_paise,
  discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise, sort_order)`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Builds the view. Reads go through the service role, after the caller has checked who may see the row. */
async function buildView(row: Record<string, unknown>, forCustomer: boolean): Promise<QuotationView> {
  const admin = createSupabaseAdminClient();
  const status = row.status as string;
  const validUntil = (row.valid_until as string | null) ?? null;
  const isValid = validUntil !== null && validUntil >= todayIso();
  let convertedOrderNumber: string | null = null;
  if (row.converted_order_id) {
    const { data: order } = await admin.from('orders').select('order_number').eq('id', row.converted_order_id as string).maybeSingle();
    convertedOrderNumber = (order?.order_number as string | undefined) ?? null;
  }
  const items = ((row.quotation_items ?? []) as {
    product_name_snapshot: string | null; variant_label_snapshot: string | null; sku_snapshot: string | null; hsn_code_snapshot: string | null;
    quantity: number; unit_price_paise: number; discount_paise: number; gst_rate_bps: number; taxable_paise: number; tax_paise: number;
    line_total_paise: number; sort_order: number;
  }[]).slice().sort((a, b) => a.sort_order - b.sort_order);

  const totalPaise = Number(row.total_paise);
  return {
    id: row.id as string,
    number: row.quotation_number as string,
    status,
    source: row.source as 'owner' | 'guest',
    revision: Number(row.revision),
    createdAt: row.created_at as string,
    sentAt: (row.sent_at as string | null) ?? null,
    validUntil,
    customerName: row.customer_name as string,
    customerMobile: (row.customer_mobile as string | null) ?? null,
    customerEmail: (row.customer_email as string | null) ?? null,
    projectName: (row.project_name as string | null) ?? null,
    requirements: (row.requirements as string | null) ?? null,
    deliveryAddress: (row.delivery_address as string | null) ?? null,
    deliveryExpectation: (row.delivery_expectation as string | null) ?? null,
    terms: (row.terms as string | null) ?? null,
    deliveryPaise: Number(row.delivery_paise),
    subtotalPaise: Number(row.subtotal_paise),
    discountPaise: Number(row.discount_paise),
    taxablePaise: Number(row.taxable_paise),
    taxPaise: Number(row.tax_paise),
    totalPaise,
    priced: totalPaise > 0,
    responseNote: (row.response_note as string | null) ?? null,
    convertedOrderNumber,
    lines: items.map((item) => ({
      name: item.product_name_snapshot ?? 'Product',
      variantLabel: item.variant_label_snapshot ?? '',
      sku: item.sku_snapshot ?? '',
      hsnCode: item.hsn_code_snapshot ?? null,
      quantity: Number(item.quantity),
      unitPricePaise: Number(item.unit_price_paise),
      discountPaise: Number(item.discount_paise),
      gstRateBps: Number(item.gst_rate_bps),
      taxablePaise: Number(item.taxable_paise),
      taxPaise: Number(item.tax_paise),
      lineTotalPaise: Number(item.line_total_paise),
    })),
    canRespond: forCustomer && status === 'SENT' && isValid,
    canConvert: status === 'ACCEPTED' && isValid,
    canWithdraw: forCustomer && status === 'REQUESTED',
  };
}

export async function ownerListQuotations(storeId: string, status: string | null): Promise<{
  rows: { id: string; number: string; status: string; customerName: string; projectName: string | null; totalPaise: number; createdAt: string; validUntil: string | null; source: string }[];
  counts: Record<string, number>;
}> {
  const admin = createSupabaseAdminClient();
  const { data: all } = await admin.from('quotations').select('status').eq('store_id', storeId).limit(5000);
  const counts: Record<string, number> = {};
  for (const row of (all ?? []) as { status: string }[]) counts[row.status] = (counts[row.status] ?? 0) + 1;

  let query = admin
    .from('quotations')
    .select('id, quotation_number, status, customer_name, project_name, total_paise, created_at, valid_until, source')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new QuotationError('Could not load quotations.', 500);
  return {
    counts,
    rows: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      number: row.quotation_number as string,
      status: row.status as string,
      customerName: row.customer_name as string,
      projectName: (row.project_name as string | null) ?? null,
      totalPaise: Number(row.total_paise),
      createdAt: row.created_at as string,
      validUntil: (row.valid_until as string | null) ?? null,
      source: row.source as string,
    })),
  };
}

export async function ownerQuotationView(storeId: string, quotationId: string): Promise<QuotationView | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('quotations').select(VIEW_SELECT).eq('id', quotationId).eq('store_id', storeId).maybeSingle();
  if (error) throw new QuotationError('Could not load the quotation.', 500);
  if (!data) return null;
  return buildView(data as unknown as Record<string, unknown>, false);
}

export async function ownerQuotationHistory(storeId: string, quotationId: string): Promise<{ action: string; actor: string; at: string }[]> {
  const { data } = await createSupabaseAdminClient()
    .from('audit_logs')
    .select('action, actor_type, created_at')
    .eq('store_id', storeId)
    .eq('entity_type', 'quotations')
    .eq('entity_id', quotationId)
    .order('created_at', { ascending: false })
    .limit(50);
  return ((data ?? []) as { action: string; actor_type: string; created_at: string }[]).map((row) => ({
    action: row.action,
    actor: row.actor_type === 'shop_owner' ? 'Store team' : row.actor_type === 'guest' ? 'Customer' : 'System',
    at: row.created_at,
  }));
}

/** The guest's own quotations in this store, newest first. */
export async function guestQuotationList(storeId: string, sessionId: string): Promise<{ id: string; number: string; status: string; projectName: string | null; createdAt: string; totalPaise: number }[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('quotations')
    .select('id, quotation_number, status, project_name, created_at, total_paise')
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new QuotationError('Could not load your quotations.', 500);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    number: row.quotation_number as string,
    status: row.status as string,
    projectName: (row.project_name as string | null) ?? null,
    createdAt: row.created_at as string,
    totalPaise: Number(row.total_paise),
  }));
}

export async function guestQuotationView(storeId: string, sessionId: string, quotationId: string): Promise<QuotationView | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('quotations').select(VIEW_SELECT)
    .eq('id', quotationId).eq('store_id', storeId).eq('guest_session_id', sessionId).maybeSingle();
  if (error) throw new QuotationError('Could not load the quotation.', 500);
  if (!data) return null;
  return buildView(data as unknown as Record<string, unknown>, true);
}

/** A quotation opened through its share link. Drafts and unsent requests are not shared. */
export async function sharedQuotationView(storeId: string, token: string): Promise<QuotationView | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await createSupabaseAdminClient()
    .from('quotations').select(VIEW_SELECT)
    .eq('store_id', storeId).eq('share_token_hash', shareHash(token)).maybeSingle();
  if (error) throw new QuotationError('Could not load the quotation.', 500);
  if (!data) return null;
  const view = await buildView(data as unknown as Record<string, unknown>, true);
  if (!['SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED'].includes(view.status)) return null;
  return view;
}

/** Owner runs for the expiry route. */
export async function expireQuotations(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().rpc('expire_quotations');
  if (error) throw new QuotationError('Expiry failed.', 500);
  return Number(data ?? 0);
}

/** Records a document download without storing any token. */
export async function recordDocumentDownload(storeId: string, kind: 'invoice' | 'quotation', entityId: string, actorKind: 'owner' | 'guest' | 'share', actorId: string | null): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc('record_document_download', {
    p_store: storeId, p_kind: kind, p_entity: entityId, p_actor_kind: actorKind, p_actor: actorId,
  });
  if (error) throw mapRpcError(error);
}

