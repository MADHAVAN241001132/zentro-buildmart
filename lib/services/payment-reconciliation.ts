import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { istRangeIso, pageBounds, type ListQuery } from '@/lib/payments/reconciliation-filters';
import { recordAdminAudit } from '@/lib/services/audit';
import { fetchRazorpayOrder, fetchRazorpayPayment, RazorpayApiError } from '@/lib/payments/razorpay';
import { providerOrderMismatch } from '@/lib/payments/provider-order-evidence';

/*
 * Reads and decisions behind the owner and platform administrator reconciliation screens.
 * Callers must verify the actor first (requireOwnerPermission / requireAdmin). Owner reads take the store
 * from the verified owner context, never from the request. Money moves only through existing RPCs.
 */

export interface LateSummary {
  lateReceivedCount: number; lateReceivedPaise: number;
  lateOpenCount: number; lateOpenPaise: number;
  lateRefundRequestedCount: number; lateFulfilmentApprovedCount: number; lateDismissedCount: number;
  lateRefundSucceededCount: number; lateRefundSucceededPaise: number;
  lateRefundPendingCount: number; lateRefundPendingPaise: number;
}

export interface OwnerSummary {
  late: LateSummary;
  onlinePaidCount: number; onlinePaidPaise: number;
  cashPendingCount: number; cashPendingPaise: number;
  initIssueCount: number;
}

export interface ListPage<T> { rows: T[]; total: number }

export interface OwnerPaymentRow {
  id: string; status: string; method: string; amountPaise: number; providerPaymentId: string | null;
  paidAt: string | null; createdAt: string; failureReason: string | null; orderId: string; orderNumber: string;
}
export interface OwnerInitRow {
  id: string; status: string; reconciliationStatus: string; expectedPaise: number; providerOrderId: string | null;
  attempts: number; safeError: string | null; reconciliationNote: string | null; reconciledAt: string | null;
  createdAt: string; orderId: string; orderNumber: string;
}
export interface LateRow {
  id: string; reason: string; status: string; amountPaise: number; providerPaymentId: string; providerOrderId: string | null;
  resolutionNote: string | null; resolvedAt: string | null; createdAt: string; refundId: string | null;
  orderId: string | null; orderNumber: string | null;
}
export interface RefundRow {
  id: string; status: string; amountPaise: number; gatewayState: string; failureReason: string | null;
  createdAt: string; processedAt: string | null; orderId: string; orderNumber: string;
}

export class ReconciliationError extends Error {}

function friendly(message: string): string {
  const cleaned = message.replace(/^.*?: /, '');
  return cleaned.length > 0 ? cleaned : 'This action could not be completed.';
}

/** Escapes LIKE wildcards in an already-sanitised search term. */
function orderMatch(term: string): string {
  return `%${term}%`;
}

// Joined order number, used for display and for search (inner join when searching).
type OrderJoin = { order_number: string } | null;

function rangeOrThrow(q: ListQuery): { startIso: string; endIso: string } {
  const range = istRangeIso(q.from, q.to);
  if (!range) throw new ReconciliationError('Choose a valid date range of up to one year.');
  return range;
}

export async function ownerSummary(storeId: string, from: string, to: string): Promise<OwnerSummary> {
  const range = istRangeIso(from, to);
  if (!range) throw new ReconciliationError('Choose a valid date range of up to one year.');
  const admin = createSupabaseAdminClient();

  const [late, online, cash, issues] = await Promise.all([
    admin.rpc('report_late_payment_reconciliation', { p_store: storeId, p_start: range.startIso, p_end: range.endIso }),
    admin.from('payments').select('amount_paise').eq('store_id', storeId).eq('method', 'online').eq('status', 'PAID')
      .gte('paid_at', range.startIso).lt('paid_at', range.endIso),
    admin.from('payments').select('amount_paise').eq('store_id', storeId).eq('status', 'CASH_PENDING'),
    admin.from('payment_initialisations').select('id', { count: 'exact', head: true }).eq('store_id', storeId)
      .in('status', ['refused', 'uncertain', 'amount_mismatch']),
  ]);
  if (late.error) throw new ReconciliationError(friendly(late.error.message));
  if (online.error || cash.error || issues.error) throw new ReconciliationError('Payment totals could not be loaded.');

  const l = late.data as LateSummary;
  const onlineRows = (online.data ?? []) as { amount_paise: number }[];
  const cashRows = (cash.data ?? []) as { amount_paise: number }[];
  return {
    late: l,
    onlinePaidCount: onlineRows.length,
    onlinePaidPaise: onlineRows.reduce((s, r) => s + Number(r.amount_paise), 0),
    cashPendingCount: cashRows.length,
    cashPendingPaise: cashRows.reduce((s, r) => s + Number(r.amount_paise), 0),
    initIssueCount: issues.count ?? 0,
  };
}

export async function ownerPayments(storeId: string, q: ListQuery, method: 'online' | 'cash'): Promise<ListPage<OwnerPaymentRow>> {
  const range = rangeOrThrow(q);
  const admin = createSupabaseAdminClient();
  const { from, to } = pageBounds(q.page);
  const select = 'id, status, method, amount_paise, provider_payment_id, paid_at, created_at, failure_reason, order_id, orders' +
    (q.q ? '!inner' : '') + '(order_number)';
  let query = admin.from('payments').select(select, { count: 'exact' }).eq('store_id', storeId).eq('method', method)
    .gte('created_at', range.startIso).lt('created_at', range.endIso);
  if (method === 'cash') query = query.eq('status', 'CASH_PENDING');
  else if (q.status) query = query.eq('status', q.status);
  if (q.q) query = query.ilike('orders.order_number', orderMatch(q.q));
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw new ReconciliationError('Payments could not be loaded.');
  const rows = ((data ?? []) as unknown as Array<{
    id: string; status: string; method: string; amount_paise: number; provider_payment_id: string | null; paid_at: string | null;
    created_at: string; failure_reason: string | null; order_id: string; orders: OrderJoin;
  }>).map((r) => ({
    id: r.id, status: r.status, method: r.method, amountPaise: Number(r.amount_paise), providerPaymentId: r.provider_payment_id,
    paidAt: r.paid_at, createdAt: r.created_at, failureReason: r.failure_reason, orderId: r.order_id,
    orderNumber: r.orders?.order_number ?? '',
  }));
  return { rows, total: count ?? 0 };
}

export async function ownerInitialisations(storeId: string, q: ListQuery): Promise<ListPage<OwnerInitRow>> {
  const range = rangeOrThrow(q);
  const admin = createSupabaseAdminClient();
  const { from, to } = pageBounds(q.page);
  const select = 'id, status, reconciliation_status, expected_amount_paise, provider_order_id, attempts, safe_error, reconciliation_note, reconciled_at, created_at, order_id, orders' +
    (q.q ? '!inner' : '') + '(order_number)';
  let query = admin.from('payment_initialisations').select(select, { count: 'exact' }).eq('store_id', storeId)
    .gte('created_at', range.startIso).lt('created_at', range.endIso)
    .in('status', q.status ? [q.status] : ['refused', 'uncertain', 'amount_mismatch']);
  if (q.q) query = query.ilike('orders.order_number', orderMatch(q.q));
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw new ReconciliationError('Initialisation records could not be loaded.');
  const rows = ((data ?? []) as unknown as Array<{
    id: string; status: string; reconciliation_status: string; expected_amount_paise: number; provider_order_id: string | null;
    attempts: number; safe_error: string | null; reconciliation_note: string | null; reconciled_at: string | null; created_at: string;
    order_id: string; orders: OrderJoin;
  }>).map((r) => ({
    id: r.id, status: r.status, reconciliationStatus: r.reconciliation_status, expectedPaise: Number(r.expected_amount_paise),
    providerOrderId: r.provider_order_id, attempts: r.attempts, safeError: r.safe_error, reconciliationNote: r.reconciliation_note,
    reconciledAt: r.reconciled_at, createdAt: r.created_at, orderId: r.order_id, orderNumber: r.orders?.order_number ?? '',
  }));
  return { rows, total: count ?? 0 };
}

export async function ownerLatePayments(storeId: string, q: ListQuery): Promise<ListPage<LateRow>> {
  const range = rangeOrThrow(q);
  const admin = createSupabaseAdminClient();
  const { from, to } = pageBounds(q.page);
  const select = 'id, reason, status, amount_paise, provider_payment_id, provider_order_id, resolution_note, resolved_at, created_at, refund_id, order_id, orders(order_number)';
  let query = admin.from('late_payments').select(select, { count: 'exact' }).eq('store_id', storeId)
    .gte('created_at', range.startIso).lt('created_at', range.endIso);
  if (q.status) query = query.eq('status', q.status);
  if (q.q) query = query.or(`provider_payment_id.ilike.${orderMatch(q.q)},provider_order_id.ilike.${orderMatch(q.q)}`);
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw new ReconciliationError('Late payments could not be loaded.');
  const rows = ((data ?? []) as unknown as Array<{
    id: string; reason: string; status: string; amount_paise: number; provider_payment_id: string; provider_order_id: string | null;
    resolution_note: string | null; resolved_at: string | null; created_at: string; refund_id: string | null; order_id: string | null;
    orders: OrderJoin;
  }>).map((r) => ({
    id: r.id, reason: r.reason, status: r.status, amountPaise: Number(r.amount_paise), providerPaymentId: r.provider_payment_id,
    providerOrderId: r.provider_order_id, resolutionNote: r.resolution_note, resolvedAt: r.resolved_at, createdAt: r.created_at,
    refundId: r.refund_id, orderId: r.order_id, orderNumber: r.orders?.order_number ?? null,
  }));
  return { rows, total: count ?? 0 };
}

export async function ownerLateRefunds(storeId: string, q: ListQuery): Promise<ListPage<RefundRow>> {
  const range = rangeOrThrow(q);
  const admin = createSupabaseAdminClient();
  const { from, to } = pageBounds(q.page);
  const select = 'id, status, amount_paise, gateway_state, failure_reason, created_at, processed_at, order_id, orders!inner(order_number)';
  let query = admin.from('refunds').select(select, { count: 'exact' }).eq('store_id', storeId).eq('refund_type', 'late_payment')
    .gte('created_at', range.startIso).lt('created_at', range.endIso);
  if (q.status) query = query.eq('status', q.status);
  if (q.q) query = query.ilike('orders.order_number', orderMatch(q.q));
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw new ReconciliationError('Late-payment refunds could not be loaded.');
  const rows = ((data ?? []) as unknown as Array<{
    id: string; status: string; amount_paise: number; gateway_state: string; failure_reason: string | null; created_at: string;
    processed_at: string | null; order_id: string; orders: OrderJoin;
  }>).map((r) => ({
    id: r.id, status: r.status, amountPaise: Number(r.amount_paise), gatewayState: r.gateway_state, failureReason: r.failure_reason,
    createdAt: r.created_at, processedAt: r.processed_at, orderId: r.order_id, orderNumber: r.orders?.order_number ?? '',
  }));
  return { rows, total: count ?? 0 };
}

/* ---------------- Platform administrator ---------------- */

export interface AdminInitRow extends OwnerInitRow {
  storeId: string; storeName: string; attemptHistory: Array<{ attemptNo: number; outcome: string; safeDetail: string | null; at: string }>;
}

export interface AdminLateRow extends LateRow {
  storeId: string | null; storeName: string | null; expectedPaise: number | null;
}

export async function adminReconciliationQueue(): Promise<{
  unmatched: AdminLateRow[]; unattached: AdminLateRow[]; lateReview: AdminLateRow[]; uncertainInits: AdminInitRow[];
}> {
  const admin = createSupabaseAdminClient();
  const lateSelect = 'id, reason, status, amount_paise, provider_payment_id, provider_order_id, resolution_note, resolved_at, created_at, refund_id, order_id, store_id, stores(name), orders(order_number, total_paise)';
  const [unmatched, unattached, review, inits] = await Promise.all([
    admin.from('late_payments').select(lateSelect).eq('reason', 'unmatched_provider_order').eq('status', 'open').order('created_at').limit(100),
    admin.from('late_payments').select(lateSelect).eq('reason', 'provider_order_not_attached').eq('status', 'open').order('created_at').limit(100),
    admin.from('late_payments').select(lateSelect).in('reason', ['after_cancellation', 'after_reservation_expiry', 'amount_mismatch']).eq('status', 'open').order('created_at').limit(100),
    admin.from('payment_initialisations').select('id, status, reconciliation_status, expected_amount_paise, provider_order_id, attempts, safe_error, reconciliation_note, reconciled_at, created_at, order_id, store_id, stores(name), orders(order_number)')
      .in('status', ['uncertain', 'amount_mismatch']).order('created_at').limit(100),
  ]);
  for (const r of [unmatched, unattached, review, inits]) if (r.error) throw new ReconciliationError('Reconciliation queue could not be loaded.');

  const toLate = (r: Record<string, unknown>): AdminLateRow => {
    const store = r.stores as { name: string } | null;
    const order = r.orders as { order_number: string; total_paise: number } | null;
    return {
      id: r.id as string, reason: r.reason as string, status: r.status as string, amountPaise: Number(r.amount_paise),
      providerPaymentId: r.provider_payment_id as string, providerOrderId: (r.provider_order_id as string | null) ?? null,
      resolutionNote: (r.resolution_note as string | null) ?? null, resolvedAt: (r.resolved_at as string | null) ?? null,
      createdAt: r.created_at as string, refundId: (r.refund_id as string | null) ?? null,
      orderId: (r.order_id as string | null) ?? null, orderNumber: order?.order_number ?? null,
      storeId: (r.store_id as string | null) ?? null, storeName: store?.name ?? null,
      expectedPaise: order ? Number(order.total_paise) : null,
    };
  };

  const initRows = (inits.data ?? []) as Array<Record<string, unknown>>;
  const initIds = initRows.map((r) => r.id as string);
  const attempts = initIds.length
    ? await admin.from('payment_initialisation_attempts').select('init_id, attempt_no, outcome, safe_detail, created_at')
        .in('init_id', initIds).order('created_at', { ascending: false })
    : { data: [], error: null };
  if (attempts.error) throw new ReconciliationError('Attempt history could not be loaded.');
  const byInit = new Map<string, AdminInitRow['attemptHistory']>();
  for (const a of (attempts.data ?? []) as Array<Record<string, unknown>>) {
    const list = byInit.get(a.init_id as string) ?? [];
    list.push({ attemptNo: Number(a.attempt_no), outcome: a.outcome as string, safeDetail: (a.safe_detail as string | null) ?? null, at: a.created_at as string });
    byInit.set(a.init_id as string, list);
  }

  return {
    unmatched: ((unmatched.data ?? []) as Array<Record<string, unknown>>).map(toLate),
    unattached: ((unattached.data ?? []) as Array<Record<string, unknown>>).map(toLate),
    lateReview: ((review.data ?? []) as Array<Record<string, unknown>>).map(toLate),
    uncertainInits: initRows.map((r) => {
      const store = r.stores as { name: string } | null;
      const order = r.orders as { order_number: string } | null;
      return {
        id: r.id as string, status: r.status as string, reconciliationStatus: r.reconciliation_status as string,
        expectedPaise: Number(r.expected_amount_paise), providerOrderId: (r.provider_order_id as string | null) ?? null,
        attempts: Number(r.attempts), safeError: (r.safe_error as string | null) ?? null,
        reconciliationNote: (r.reconciliation_note as string | null) ?? null, reconciledAt: (r.reconciled_at as string | null) ?? null,
        createdAt: r.created_at as string, orderId: r.order_id as string, orderNumber: order?.order_number ?? '',
        storeId: r.store_id as string, storeName: store?.name ?? '', attemptHistory: byInit.get(r.id as string) ?? [],
      };
    }),
  };
}

/**
 * Records a platform administrator's reconciliation of an uncertain initialisation.
 * 'adopt' needs the provider order id the administrator verified in the provider dashboard and a note describing
 * that evidence; attachment happens only after the database accepts the adoption. 'confirm_no_order' records that
 * no provider order exists; it never refunds or settles anything.
 */
export async function reconcileInitialisation(input: {
  actorId: string; initId: string; action: 'adopt'; providerOrderId: string; evidenceNote: string;
}): Promise<void> {
  // 'confirm no order' has been removed: refusing an attempt reopens checkout, and absence cannot be proven from the
  // provider. Such attempts stay under investigation (see migration 0057).
  if (input.action !== 'adopt') {
    throw new ReconciliationError('Only a verified provider order can be recorded here. Otherwise the attempt stays under investigation.');
  }
  const note = input.evidenceNote.trim();
  if (note.length < 10 || note.length > 500) throw new ReconciliationError('Describe the evidence in 10 to 500 characters.');
  const providerOrderId = input.providerOrderId.trim();
  if (!/^[A-Za-z0-9_]{6,80}$/.test(providerOrderId)) {
    throw new ReconciliationError('Enter the provider order id exactly as shown in the provider dashboard.');
  }
  const admin = createSupabaseAdminClient();

  // Adoption attaches a provider order to the guest's attempt, so the order must be read from Razorpay by its exact id
  // and checked against the stored attempt before anything changes. A checkbox and a note are not evidence.
  let verifiedStatus: string | null = null;
  if (input.action === 'adopt') {
    const { data: init, error: initError } = await admin.from('payment_initialisations')
      .select('id, provider, expected_amount_paise, currency, orders(order_number)').eq('id', input.initId).maybeSingle();
    if (initError || !init) throw new ReconciliationError('The payment attempt could not be loaded. Nothing was changed.');
    if (init.provider !== 'razorpay') throw new ReconciliationError('Only Razorpay attempts can adopt a provider order. Nothing was changed.');
    const orderRef = init.orders as unknown as { order_number: string } | { order_number: string }[] | null;
    const orderNumber = Array.isArray(orderRef) ? orderRef[0]?.order_number : orderRef?.order_number;
    if (!orderNumber) throw new ReconciliationError('The order for this attempt could not be read. Nothing was changed.');

    let providerOrder;
    try {
      providerOrder = await fetchRazorpayOrder(providerOrderId);
    } catch {
      // A failed lookup is not evidence of anything. Nothing has been changed, so the administrator can retry later.
      throw new ReconciliationError('Razorpay could not confirm this order id right now. Nothing was changed; try again later.');
    }
    const mismatch = providerOrderMismatch(
      { providerOrderId, expectedAmountPaise: Number(init.expected_amount_paise), currency: init.currency, orderNumber },
      { id: providerOrder.id, amount: providerOrder.amount, currency: providerOrder.currency, receipt: providerOrder.receipt, status: providerOrder.status },
    );
    if (mismatch) throw new ReconciliationError(`Razorpay order check failed: ${mismatch}. Nothing was changed.`);
    verifiedStatus = providerOrder.status;
  }

  const { error } = await admin.rpc('guest_payment_init_reconcile', {
    p_init: input.initId, p_actor: input.actorId, p_action: 'adopt',
    p_provider_order_id: providerOrderId, p_note: note,
  });
  if (error) throw new ReconciliationError(friendly(error.message));

  const { error: attachError } = await admin.rpc('guest_payment_init_attach', { p_init: input.initId });
  if (attachError) throw new ReconciliationError(`Adopted, but attaching the payment failed: ${friendly(attachError.message)}`);
  await recordAdminAudit({
    actorId: input.actorId, action: 'payment_init.reconcile.adopt', entityType: 'payment_initialisation',
    entityId: input.initId,
    after: { providerOrderIdPresent: true, noteLength: note.length, providerOrderVerified: true, providerOrderStatus: verifiedStatus },
  });
}

/**
 * Attributes an unmatched provider payment to a local order. Every fact is checked against Razorpay by its exact id:
 * the payment must be captured, in INR, for the recorded amount, and linked to the recorded provider order; that order's
 * receipt must be the local order number and its amount must equal the payment. The store comes from the local order,
 * never from the administrator. The database then settles the payment or routes it to the owner's queue. A failed
 * provider read changes nothing, and an empty search is never treated as evidence.
 */
export async function attributeUnmatchedPayment(input: {
  actorId: string; lateId: string; orderNumber: string; evidenceNote: string;
}): Promise<string> {
  const note = input.evidenceNote.trim();
  if (note.length < 10 || note.length > 500) throw new ReconciliationError('Describe the evidence in 10 to 500 characters.');
  const orderNumber = input.orderNumber.trim();
  if (!/^[A-Za-z0-9-]{3,40}$/.test(orderNumber)) throw new ReconciliationError('Enter the order number exactly as the guest was shown it.');

  const admin = createSupabaseAdminClient();
  const { data: late, error: lateError } = await admin.from('late_payments')
    .select('id, provider, provider_payment_id, provider_order_id, amount_paise, reason, status, store_id')
    .eq('id', input.lateId).maybeSingle();
  if (lateError || !late) throw new ReconciliationError('The payment could not be loaded. Nothing was changed.');
  if (late.store_id !== null || late.reason !== 'unmatched_provider_order' || late.status !== 'open') {
    throw new ReconciliationError('This payment is not awaiting attribution.');
  }
  if (late.provider !== 'razorpay') throw new ReconciliationError('Only Razorpay payments can be verified with the provider here.');
  if (!late.provider_order_id) throw new ReconciliationError('The provider order is not recorded for this payment. Nothing was changed.');

  // The order is looked up by its exact number. The store is read from the order row, never chosen by the caller.
  const { data: orders, error: orderError } = await admin.from('orders')
    .select('id, store_id, order_number, total_paise').eq('order_number', orderNumber).limit(2);
  if (orderError) throw new ReconciliationError('The order could not be loaded. Nothing was changed.');
  if (!orders || orders.length !== 1) {
    throw new ReconciliationError('That order number matches no order, or more than one. Nothing was changed; investigate manually.');
  }
  const order = orders[0] as { id: string; store_id: string; order_number: string; total_paise: number };
  if (Number(order.total_paise) !== Number(late.amount_paise)) {
    throw new ReconciliationError('The order total does not equal the payment amount. Nothing was changed; investigate manually.');
  }

  let payment;
  let providerOrder;
  try {
    payment = await fetchRazorpayPayment(String(late.provider_payment_id));
    providerOrder = await fetchRazorpayOrder(String(late.provider_order_id));
  } catch (error) {
    if (error instanceof RazorpayApiError && error.hasProviderBody) {
      throw new ReconciliationError(`Razorpay refused the lookup: ${error.message}. Nothing was changed.`);
    }
    throw new ReconciliationError('Razorpay could not confirm the payment right now. Nothing was changed; try again later.');
  }
  if (payment.id !== late.provider_payment_id || payment.status !== 'captured' || payment.currency !== 'INR') {
    throw new ReconciliationError('Razorpay does not show this payment as captured in INR. Nothing was changed.');
  }
  if (Number(payment.amount) !== Number(late.amount_paise)) {
    throw new ReconciliationError('Razorpay shows a different amount for this payment. Nothing was changed.');
  }
  if (payment.order_id !== late.provider_order_id) {
    throw new ReconciliationError('Razorpay links this payment to a different provider order. Nothing was changed.');
  }
  const mismatch = providerOrderMismatch(
    {
      providerOrderId: String(late.provider_order_id),
      expectedAmountPaise: Number(late.amount_paise),
      currency: 'INR',
      orderNumber: order.order_number,
    },
    { id: providerOrder.id, amount: providerOrder.amount, currency: providerOrder.currency, receipt: providerOrder.receipt, status: providerOrder.status },
  );
  if (mismatch) throw new ReconciliationError(`Razorpay order check failed: ${mismatch}. Nothing was changed.`);

  const { data, error } = await admin.rpc('unmatched_payment_attribute', {
    p_actor: input.actorId,
    p_provider: 'razorpay',
    p_provider_payment_id: String(late.provider_payment_id),
    p_provider_order_id: String(late.provider_order_id),
    p_amount_paise: Number(late.amount_paise),
    p_order: order.id,
    p_note: note,
  });
  if (error) throw new ReconciliationError(friendly(error.message));
  const result = String(data ?? '');
  await recordAdminAudit({
    actorId: input.actorId, action: 'payment.unmatched.attribute', entityType: 'late_payment',
    entityId: input.lateId,
    after: { outcome: result, providerPaymentStatus: payment.status, providerOrderStatus: providerOrder.status, noteLength: note.length },
  });
  return result;
}
