import { createHash } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Status snapshots for live-status polling. Every read is limited to one store, and guest reads are
 * limited to one guest session. The guest snapshot carries status fields only: no customer details,
 * payment identifiers, contact information or amounts. Payment state is read from the database records written
 * by verified webhooks and payment confirmations, never from the browser.
 */

const LIMIT = 50;

export interface GuestStatusSnapshot {
  orders: { orderNumber: string; paymentStatus: string; orderStatus: string; paidAt: string | null }[];
  quotations: { number: string; status: string }[];
  refunds: { requestId: string; orderNumber: string | null; requestStatus: string; refundStatus: string | null }[];
  fingerprint: string;
}

/** A null count means the caller does not hold the permission for that record type. */
export interface OwnerStatusCounts {
  incomingOrders: number | null;
  cashPending: number | null;
  onlinePending: number | null;
  newQuotations: number | null;
  refundRequests: number | null;
  fingerprint: string;
}

function fingerprintOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

export async function guestStatusSnapshot(storeId: string, sessionId: string): Promise<GuestStatusSnapshot> {
  const admin = createSupabaseAdminClient();
  const [ordersRes, quotesRes, refundReqRes] = await Promise.all([
    admin
      .from('orders')
      .select('id, order_number, payment_status, order_status, paid_at')
      .eq('store_id', storeId)
      .eq('guest_session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    admin
      .from('quotations')
      .select('quotation_number, status')
      .eq('store_id', storeId)
      .eq('guest_session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    admin
      .from('refund_requests')
      .select('id, status, refund_id, orders(order_number)')
      .eq('store_id', storeId)
      .eq('guest_session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ]);
  if (ordersRes.error || quotesRes.error || refundReqRes.error) throw new Error('Could not load status');

  const refundRows = (refundReqRes.data ?? []) as {
    id: string;
    status: string;
    refund_id: string | null;
    orders: { order_number: string } | null;
  }[];
  const refundIds = refundRows.map((r) => r.refund_id).filter((id): id is string => !!id);
  const { data: refundStatuses, error: refundError } = refundIds.length
    ? await admin.from('refunds').select('id, status').in('id', refundIds)
    : { data: [] as { id: string; status: string }[], error: null };
  if (refundError) throw new Error('Could not load status');
  const refundStatusById = new Map((refundStatuses ?? []).map((r) => [r.id as string, r.status as string]));

  const orders = ((ordersRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    orderNumber: row.order_number as string,
    paymentStatus: row.payment_status as string,
    orderStatus: row.order_status as string,
    paidAt: (row.paid_at as string | null) ?? null,
  }));
  const quotations = ((quotesRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    number: row.quotation_number as string,
    status: row.status as string,
  }));
  const refunds = refundRows.map((row) => ({
    requestId: row.id,
    orderNumber: row.orders?.order_number ?? null,
    requestStatus: row.status,
    refundStatus: row.refund_id ? (refundStatusById.get(row.refund_id) ?? null) : null,
  }));

  return { orders, quotations, refunds, fingerprint: fingerprintOf({ orders, quotations, refunds }) };
}

async function countWhere(build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await build();
  if (error) throw new Error('Could not load counts');
  return count ?? 0;
}

/**
 * Notification counts for the owner portal. Counts are exact database counts for one store. Estimates
 * are not shown here: each figure is a count of records in a stated status.
 */
export async function ownerStatusCounts(storeId: string, held: readonly string[]): Promise<OwnerStatusCounts> {
  const admin = createSupabaseAdminClient();
  const has = (key: string) => held.includes(key);
  const [incomingOrders, cashPending, onlinePending, newQuotations, refundRequests] = await Promise.all([
    has('order_management')
      ? countWhere(() => admin.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('order_status', 'PLACED'))
      : null,
    has('cash_confirmation')
      ? countWhere(() =>
          admin.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('payment_status', 'CASH_PENDING'),
        )
      : null,
    has('order_management')
      ? countWhere(() =>
          admin
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', storeId)
            .eq('payment_method', 'online')
            .in('payment_status', ['PENDING', 'PROCESSING']),
        )
      : null,
    has('quotations')
      ? countWhere(() => admin.from('quotations').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'REQUESTED'))
      : null,
    has('refund_management')
      ? countWhere(() => admin.from('refund_requests').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'submitted'))
      : null,
  ]);
  const counts = { incomingOrders, cashPending, onlinePending, newQuotations, refundRequests };
  return { ...counts, fingerprint: fingerprintOf(counts) };
}
