import 'server-only';
import { friendly } from '@/lib/errors';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createOrderRefund, RefundError, type RefundLineInput } from '@/lib/services/refunds';

export const REFUND_REASON_CODES = ['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'other'] as const;
export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];

export const REFUND_REASON_LABEL: Record<RefundReasonCode, string> = {
  damaged: 'Damaged or faulty',
  wrong_item: 'Wrong item received',
  not_as_described: 'Not as described',
  changed_mind: 'Changed my mind',
  other: 'Other',
};

/** What a guest sees for the refund status. Internal gateway detail is never shown to guests. */
export const GUEST_REFUND_STATUS_LABEL: Record<string, string> = {
  requested: 'Refund requested',
  processing: 'Sent to your bank by the payment provider',
  succeeded: 'Refunded',
  failed: 'Not completed. The store will contact you',
};

export interface RequestLine {
  orderItemId: string;
  quantity: number;
}

export interface RemainingLine {
  orderItemId: string;
  name: string;
  variantLabel: string;
  quantity: number;
  remaining: number;
  lineTotalPaise: number;
}

export interface GuestRequestView {
  id: string;
  status: 'submitted' | 'approved' | 'rejected' | 'withdrawn';
  reasonCode: string;
  reason: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  lines: { name: string; variantLabel: string; quantity: number }[];
  refundStatus: string | null;
  refundAmountPaise: number | null;
}

/** Guest submission. The database checks the session, the order, the window and each quantity. */
export async function guestSubmitRefundRequest(input: {
  storeId: string;
  sessionId: string;
  orderId: string;
  reasonCode: RefundReasonCode;
  reason: string;
  lines: RequestLine[];
}): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('submit_guest_refund_request', {
    p_store: input.storeId,
    p_order: input.orderId,
    p_guest_session: input.sessionId,
    p_reason_code: input.reasonCode,
    p_reason: input.reason,
    p_lines: input.lines.map((line) => ({ order_item_id: line.orderItemId, quantity: line.quantity })),
  });
  if (error) throw new RefundError(friendly(error.message));
  return String(data);
}

export async function guestWithdrawRefundRequest(input: { sessionId: string; requestId: string }): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc('withdraw_guest_refund_request', {
    p_request: input.requestId,
    p_guest_session: input.sessionId,
  });
  if (error) throw new RefundError(friendly(error.message));
}

/** Remaining quantities for each item of an order that belongs to this guest session. Empty if it does not. */
export async function guestRemainingLines(input: { storeId: string; sessionId: string; orderId: string }): Promise<RemainingLine[]> {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id')
    .eq('id', input.orderId)
    .eq('store_id', input.storeId)
    .eq('guest_session_id', input.sessionId)
    .maybeSingle();
  if (!order) return [];

  const { data: remaining, error } = await admin.rpc('refund_remaining_for_order', { p_order: input.orderId });
  if (error) throw new Error('Could not load refund quantities');
  const { data: items } = await admin
    .from('order_items')
    .select('id, product_name_snapshot, variant_label_snapshot, quantity, line_total_paise')
    .eq('order_id', input.orderId);
  const byId = new Map((items ?? []).map((item) => [item.id as string, item]));

  return ((remaining ?? []) as { order_item_id: string; remaining: number }[]).map((row) => {
    const item = byId.get(row.order_item_id);
    return {
      orderItemId: row.order_item_id,
      name: (item?.product_name_snapshot as string) ?? 'Item',
      variantLabel: (item?.variant_label_snapshot as string) ?? '',
      quantity: Number(item?.quantity ?? 0),
      remaining: Number(row.remaining),
      lineTotalPaise: Number(item?.line_total_paise ?? 0),
    };
  });
}

/** The guest's own requests for one order, with the customer-safe refund status. */
export async function guestRefundRequests(input: { storeId: string; sessionId: string; orderId: string }): Promise<GuestRequestView[]> {
  const admin = createSupabaseAdminClient();
  const { data: requests, error } = await admin
    .from('refund_requests')
    .select('id, status, reason_code, reason, decision_note, created_at, decided_at, refund_id')
    .eq('store_id', input.storeId)
    .eq('guest_session_id', input.sessionId)
    .eq('order_id', input.orderId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load refund requests');
  const rows = requests ?? [];
  if (rows.length === 0) return [];

  const refundIds = rows.map((r) => r.refund_id as string | null).filter((id): id is string => !!id);
  const { data: refunds } = refundIds.length
    ? await admin.from('refunds').select('id, status, amount_paise').in('id', refundIds)
    : { data: [] as { id: string; status: string; amount_paise: number }[] };
  const refundById = new Map((refunds ?? []).map((r) => [r.id as string, r]));

  const { data: itemRows } = await admin
    .from('refund_request_items')
    .select('request_id, quantity, order_items(product_name_snapshot, variant_label_snapshot)')
    .in('request_id', rows.map((r) => r.id as string));
  const linesByRequest = new Map<string, { name: string; variantLabel: string; quantity: number }[]>();
  for (const row of (itemRows ?? []) as unknown as {
    request_id: string;
    quantity: number;
    order_items: { product_name_snapshot: string; variant_label_snapshot: string } | null;
  }[]) {
    const list = linesByRequest.get(row.request_id) ?? [];
    list.push({
      name: row.order_items?.product_name_snapshot ?? 'Item',
      variantLabel: row.order_items?.variant_label_snapshot ?? '',
      quantity: Number(row.quantity),
    });
    linesByRequest.set(row.request_id, list);
  }

  return rows.map((r) => {
    const refund = r.refund_id ? refundById.get(r.refund_id as string) : undefined;
    return {
      id: r.id as string,
      status: r.status as GuestRequestView['status'],
      reasonCode: r.reason_code as string,
      reason: r.reason as string,
      decisionNote: (r.decision_note as string | null) ?? null,
      createdAt: r.created_at as string,
      decidedAt: (r.decided_at as string | null) ?? null,
      lines: linesByRequest.get(r.id as string) ?? [],
      refundStatus: refund ? (refund.status as string) : null,
      refundAmountPaise: refund ? Number(refund.amount_paise) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Owner and manager review
// ---------------------------------------------------------------------------

export interface OwnerRequestRow {
  id: string;
  status: string;
  reasonCode: string;
  createdAt: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  orderTotalPaise: number;
}

export async function ownerListRefundRequests(storeId: string, status: string): Promise<OwnerRequestRow[]> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('refund_requests')
    .select('id, status, reason_code, created_at, order_id, orders(order_number, customer_name, total_paise)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'ALL') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Could not load refund requests');
  return ((data ?? []) as unknown as {
    id: string;
    status: string;
    reason_code: string;
    created_at: string;
    order_id: string;
    orders: { order_number: string; customer_name: string; total_paise: number } | null;
  }[]).map((row) => ({
    id: row.id,
    status: row.status,
    reasonCode: row.reason_code,
    createdAt: row.created_at,
    orderId: row.order_id,
    orderNumber: row.orders?.order_number ?? '',
    customerName: row.orders?.customer_name ?? '',
    orderTotalPaise: Number(row.orders?.total_paise ?? 0),
  }));
}

export interface OwnerRequestDetail {
  id: string;
  status: string;
  reasonCode: string;
  reason: string;
  decisionNote: string | null;
  createdAt: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string | null;
  paymentMethod: string;
  paymentStatus: string;
  refundId: string | null;
  lines: { orderItemId: string; name: string; variantLabel: string; quantity: number; lineTotalPaise: number }[];
}

export async function ownerRefundRequestDetail(storeId: string, requestId: string): Promise<OwnerRequestDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data: rq } = await admin
    .from('refund_requests')
    .select('id, store_id, status, reason_code, reason, decision_note, created_at, order_id, refund_id, orders(order_number, customer_name, customer_mobile, payment_method, payment_status)')
    .eq('id', requestId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (!rq) return null;
  const order = rq.orders as unknown as {
    order_number: string;
    customer_name: string;
    customer_mobile: string | null;
    payment_method: string;
    payment_status: string;
  };
  const { data: items } = await admin
    .from('refund_request_items')
    .select('quantity, order_items(id, product_name_snapshot, variant_label_snapshot, line_total_paise, quantity)')
    .eq('request_id', requestId);
  return {
    id: rq.id as string,
    status: rq.status as string,
    reasonCode: rq.reason_code as string,
    reason: rq.reason as string,
    decisionNote: (rq.decision_note as string | null) ?? null,
    createdAt: rq.created_at as string,
    orderId: rq.order_id as string,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerMobile: order.customer_mobile,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    refundId: (rq.refund_id as string | null) ?? null,
    lines: ((items ?? []) as unknown as {
      quantity: number;
      order_items: { id: string; product_name_snapshot: string; variant_label_snapshot: string; line_total_paise: number };
    }[]).map((row) => ({
      orderItemId: row.order_items.id,
      name: row.order_items.product_name_snapshot,
      variantLabel: row.order_items.variant_label_snapshot,
      quantity: Number(row.quantity),
      lineTotalPaise: Number(row.order_items.line_total_paise),
    })),
  };
}

/**
 * Approves a request. The owner's condition per item is applied, and the refund is created through the existing
 * create_refund path with the request id as its key. A retry or a double approval therefore cannot create a second
 * refund. The request is linked to the refund only after create_refund succeeds.
 */
export async function ownerApproveRefundRequest(input: {
  storeId: string;
  actorId: string;
  requestId: string;
  conditions: Record<string, 'restock' | 'damaged'>;
  note: string | null;
}): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data: review, error: reviewError } = await admin.rpc('begin_refund_request_review', {
    p_request: input.requestId,
    p_actor: input.actorId,
  });
  if (reviewError) throw new RefundError(friendly(reviewError.message));
  const state = review as { status: string; store_id: string; order_id: string; refund_id: string | null };
  if (state.store_id !== input.storeId) throw new RefundError('That request could not be found');
  if (state.status === 'approved' && state.refund_id) return 'This request was already approved.';

  const { data: rows, error } = await admin
    .from('refund_request_items')
    .select('order_item_id, quantity')
    .eq('request_id', input.requestId);
  if (error || !rows || rows.length === 0) throw new RefundError('This request has no items');
  const lines: RefundLineInput[] = rows.map((row) => ({
    orderItemId: row.order_item_id as string,
    quantity: Number(row.quantity),
    condition: input.conditions[row.order_item_id as string] === 'damaged' ? 'damaged' : 'restock',
  }));

  const outcome = await createOrderRefund({
    actorId: input.actorId,
    orderId: state.order_id,
    lines,
    reason: 'Guest refund request',
    requestKey: input.requestId,
  });

  const { error: linkError } = await admin.rpc('approve_refund_request', {
    p_request: input.requestId,
    p_actor: input.actorId,
    p_refund: outcome.refundId,
    p_note: input.note,
  });
  if (linkError) throw new RefundError(friendly(linkError.message));
  return outcome.ambiguous
    ? 'Approved. The gateway outcome is unknown, so check this refund with Razorpay from the refund page.'
    : outcome.message;
}

export async function ownerRejectRefundRequest(input: {
  storeId: string;
  actorId: string;
  requestId: string;
  note: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: rq } = await admin.from('refund_requests').select('store_id').eq('id', input.requestId).maybeSingle();
  if (!rq || rq.store_id !== input.storeId) throw new RefundError('That request could not be found');
  const { error } = await admin.rpc('reject_refund_request', {
    p_request: input.requestId,
    p_actor: input.actorId,
    p_note: input.note,
  });
  if (error) throw new RefundError(friendly(error.message));
}
