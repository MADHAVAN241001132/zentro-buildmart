/**
 * Derives the one payment state a Guest should see for an order, from database facts.
 * Pure: no I/O. Rules are ordered so the most advanced fact wins (refunds, then receipt, then cancellation and expiry,
 * then the payment start). Pay is offered only for a provider order that is attached and still inside the reservation.
 * Retry is offered only after a definite provider refusal (the database permits a user retry only in that state).
 */

export type GuestPaymentStateKey =
  | 'cash_awaiting' | 'paid' | 'payment_starting' | 'payment_ready' | 'payment_pending' | 'payment_failed'
  | 'payment_refused' | 'payment_uncertain' | 'payment_under_review' | 'reservation_expired' | 'cancelled'
  | 'late_receipt' | 'refund_requested' | 'refund_processing' | 'refund_completed' | 'refund_review';

export interface GuestRefundFact {
  refundType: string | null;
  status: string;
  gatewayState: string;
}

export interface GuestPaymentFacts {
  method: 'online' | 'cash' | 'credit';
  orderStatus: string;
  paymentStatus: string;
  /** payment_initialisations.status for this order, or null when no start has been recorded. */
  initStatus: string | null;
  /** True when a payments row for this order has a provider order attached. */
  providerOrderAttached: boolean;
  reservationExpiresAt: string | null;
  lateStatuses: string[];
  refunds: GuestRefundFact[];
}

export interface GuestPaymentState {
  key: GuestPaymentStateKey;
  canPay: boolean;
  canRetry: boolean;
}

function reservationOpen(facts: GuestPaymentFacts, now: Date): boolean {
  if (!facts.reservationExpiresAt) return false;
  return new Date(facts.reservationExpiresAt).getTime() > now.getTime();
}

function refundState(refunds: GuestRefundFact[]): GuestPaymentStateKey | null {
  if (refunds.length === 0) return null;
  const review = refunds.some((r) => r.status === 'failed' || r.gatewayState === 'ambiguous');
  if (review) return 'refund_review';
  if (refunds.some((r) => r.status === 'processing' || r.gatewayState === 'sending')) return 'refund_processing';
  if (refunds.some((r) => r.status === 'requested')) return 'refund_requested';
  if (refunds.some((r) => r.status === 'succeeded')) return 'refund_completed';
  return null;
}

export function guestPaymentState(facts: GuestPaymentFacts, now: Date = new Date()): GuestPaymentState {
  const none = { canPay: false, canRetry: false };

  const refund = refundState(facts.refunds);
  if (refund) return { key: refund, ...none };

  if (facts.paymentStatus === 'PAID') return { key: 'paid', ...none };
  if (facts.lateStatuses.length > 0) return { key: 'late_receipt', ...none };
  if (facts.paymentStatus === 'EXPIRED') return { key: 'reservation_expired', ...none };
  if (facts.orderStatus === 'CANCELLED') return { key: 'cancelled', ...none };

  if (facts.method === 'cash') return { key: 'cash_awaiting', ...none };

  if (facts.initStatus === 'uncertain') return { key: 'payment_uncertain', ...none };
  if (facts.initStatus === 'amount_mismatch') return { key: 'payment_under_review', ...none };
  if (facts.initStatus === 'refused') {
    return { key: 'payment_refused', canPay: false, canRetry: reservationOpen(facts, now) };
  }
  if (facts.initStatus === 'calling') return { key: 'payment_starting', ...none };

  if (facts.paymentStatus === 'FAILED') return { key: 'payment_failed', ...none };
  if (facts.paymentStatus === 'PROCESSING') return { key: 'payment_pending', ...none };

  if (facts.paymentStatus === 'PENDING' && facts.providerOrderAttached) {
    return { key: 'payment_ready', canPay: reservationOpen(facts, now), canRetry: false };
  }
  return { key: 'payment_starting', ...none };
}

export const GUEST_PAYMENT_TERMINAL: ReadonlySet<GuestPaymentStateKey> = new Set([
  'paid', 'cancelled', 'reservation_expired', 'refund_completed',
]);

export interface OrderViewRows {
  order: { payment_method: string; order_status: string; payment_status: string; reservation_expires_at: string | null };
  payment: { provider_order_id: string | null } | null;
  init: { status: string } | null;
  lates: { status: string }[];
  refunds: { refund_type: string | null; status: string; gateway_state: string }[];
}

/**
 * Builds the mapper's facts from the rows the Guest order view reads. Pure, so the real conversion is unit tested
 * with row-shaped data rather than a copy of it.
 */
export function paymentFactsFromRows(rows: OrderViewRows): GuestPaymentFacts {
  return {
    method: rows.order.payment_method as GuestPaymentFacts['method'],
    orderStatus: rows.order.order_status,
    paymentStatus: rows.order.payment_status,
    initStatus: rows.init?.status ?? null,
    providerOrderAttached: Boolean(rows.payment?.provider_order_id),
    reservationExpiresAt: rows.order.reservation_expires_at,
    lateStatuses: rows.lates.map((l) => l.status),
    refunds: rows.refunds.map((r) => ({ refundType: r.refund_type, status: r.status, gatewayState: r.gateway_state })),
  };
}
