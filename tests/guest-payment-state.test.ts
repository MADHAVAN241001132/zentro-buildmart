import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { guestPaymentState, type GuestPaymentFacts } from '../lib/payments/guest-payment-state';

const NOW = new Date('2026-11-26T10:00:00Z');
const OPEN = new Date('2026-11-26T10:10:00Z').toISOString();
const LAPSED = new Date('2026-11-26T09:50:00Z').toISOString();

function facts(over: Partial<GuestPaymentFacts> = {}): GuestPaymentFacts {
  return {
    method: 'online', orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING', initStatus: 'attached',
    providerOrderAttached: true, reservationExpiresAt: OPEN, lateStatuses: [], refunds: [], ...over,
  };
}

test('an attached provider order inside the reservation is payment ready and payable', () => {
  assert.deepEqual(guestPaymentState(facts(), NOW), { key: 'payment_ready', canPay: true, canRetry: false });
});

test('no pay action after the reservation has lapsed', () => {
  assert.deepEqual(guestPaymentState(facts({ reservationExpiresAt: LAPSED }), NOW), { key: 'payment_ready', canPay: false, canRetry: false });
});

test('an uncertain provider outcome never offers pay or retry', () => {
  for (const initStatus of ['uncertain', 'calling']) {
    const s = guestPaymentState(facts({ initStatus, providerOrderAttached: false }), NOW);
    assert.equal(s.canPay, false);
    assert.equal(s.canRetry, false);
  }
  assert.equal(guestPaymentState(facts({ initStatus: 'uncertain' }), NOW).key, 'payment_uncertain');
});

test('retry is offered only after a definite refusal, and only while the reservation is open', () => {
  assert.deepEqual(guestPaymentState(facts({ initStatus: 'refused', providerOrderAttached: false }), NOW),
    { key: 'payment_refused', canPay: false, canRetry: true });
  assert.deepEqual(guestPaymentState(facts({ initStatus: 'refused', providerOrderAttached: false, reservationExpiresAt: LAPSED }), NOW),
    { key: 'payment_refused', canPay: false, canRetry: false });
});

test('a payment under amount review is not payable', () => {
  assert.deepEqual(guestPaymentState(facts({ initStatus: 'amount_mismatch' }), NOW), { key: 'payment_under_review', canPay: false, canRetry: false });
});

test('verified settlement is the only route to paid; processing is not paid', () => {
  assert.equal(guestPaymentState(facts({ paymentStatus: 'PAID' }), NOW).key, 'paid');
  assert.equal(guestPaymentState(facts({ paymentStatus: 'PROCESSING' }), NOW).key, 'payment_pending');
});

test('late receipt, cancellation and expiry are shown with no pay action', () => {
  assert.equal(guestPaymentState(facts({ orderStatus: 'CANCELLED', lateStatuses: ['open'] }), NOW).key, 'late_receipt');
  assert.equal(guestPaymentState(facts({ orderStatus: 'CANCELLED' }), NOW).key, 'cancelled');
  assert.equal(guestPaymentState(facts({ paymentStatus: 'EXPIRED', orderStatus: 'CANCELLED' }), NOW).key, 'reservation_expired');
});

test('refund states follow the refund record, most serious first', () => {
  const r = (status: string, gatewayState = 'none', refundType = 'full') => ({ refundType, status, gatewayState });
  assert.equal(guestPaymentState(facts({ paymentStatus: 'REFUNDED', refunds: [r('requested')] }), NOW).key, 'refund_requested');
  assert.equal(guestPaymentState(facts({ refunds: [r('processing', 'sent')] }), NOW).key, 'refund_processing');
  assert.equal(guestPaymentState(facts({ refunds: [r('processing', 'sending')] }), NOW).key, 'refund_processing');
  assert.equal(guestPaymentState(facts({ refunds: [r('succeeded', 'sent')] }), NOW).key, 'refund_completed');
  assert.equal(guestPaymentState(facts({ refunds: [r('succeeded', 'sent'), r('failed')] }), NOW).key, 'refund_review');
  assert.equal(guestPaymentState(facts({ refunds: [r('processing', 'ambiguous', 'late_payment')] }), NOW).key, 'refund_review');
  assert.equal(guestPaymentState(facts({ refunds: [r('succeeded', 'sent', 'late_payment')] }), NOW).key, 'refund_completed');
});

test('cash orders wait at the counter until confirmed', () => {
  assert.deepEqual(guestPaymentState(facts({ method: 'cash', paymentStatus: 'CASH_PENDING', initStatus: null, providerOrderAttached: false }), NOW),
    { key: 'cash_awaiting', canPay: false, canRetry: false });
  assert.equal(guestPaymentState(facts({ method: 'cash', paymentStatus: 'PAID', initStatus: null }), NOW).key, 'paid');
});
