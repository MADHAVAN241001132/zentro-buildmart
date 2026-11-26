import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestPaymentState, paymentFactsFromRows, type OrderViewRows } from '../lib/payments/guest-payment-state';

// Row shapes as the Guest order view reads them (orders, payments, payment_initialisations, late_payments, refunds).
const NOW = new Date('2026-11-26T10:00:00Z');
const OPEN = '2026-11-26T10:10:00Z';   // reservation still open at NOW
const ENDED = '2026-11-26T09:50:00Z';  // reservation ended before NOW

function rows(over: Partial<Omit<OrderViewRows, 'order'>> & { order?: Partial<OrderViewRows['order']> }): OrderViewRows {
  const base: OrderViewRows = {
    order: { payment_method: 'online', order_status: 'PLACED', payment_status: 'PENDING', reservation_expires_at: OPEN },
    payment: { provider_order_id: 'order_ABC123xyz' },
    init: { status: 'created' },
    lates: [],
    refunds: [],
  };
  return { ...base, ...over, order: { ...base.order, ...(over.order ?? {}) } };
}

function stateOf(r: OrderViewRows) {
  return guestPaymentState(paymentFactsFromRows(r), NOW);
}

test('cash pending: cash awaiting, no pay or retry controls', () => {
  const s = stateOf(rows({ order: { payment_method: 'cash' }, payment: null, init: null }));
  assert.deepEqual(s, { key: 'cash_awaiting', canPay: false, canRetry: false });
});

test('verified payment: paid, no controls', () => {
  const s = stateOf(rows({ order: { payment_status: 'PAID', order_status: 'CONFIRMED' } }));
  assert.deepEqual(s, { key: 'paid', canPay: false, canRetry: false });
});

test('provider initialisation in progress: starting, cannot pay yet', () => {
  const s = stateOf(rows({ init: { status: 'calling' }, payment: { provider_order_id: null } }));
  assert.deepEqual(s, { key: 'payment_starting', canPay: false, canRetry: false });
});

test('payment ready: pay offered only while the reservation is open and the provider order is attached', () => {
  assert.deepEqual(stateOf(rows({})), { key: 'payment_ready', canPay: true, canRetry: false });
  const ended = stateOf(rows({ order: { reservation_expires_at: ENDED } }));
  assert.equal(ended.canPay, false, 'no pay after the reservation ends');
  const unattached = stateOf(rows({ payment: { provider_order_id: null } }));
  assert.equal(unattached.canPay, false, 'no pay without an attached provider order');
});

test('confirmed refusal: retry offered only while the reservation is open', () => {
  assert.deepEqual(stateOf(rows({ init: { status: 'refused' } })), { key: 'payment_refused', canPay: false, canRetry: true });
  assert.deepEqual(stateOf(rows({ init: { status: 'refused' }, order: { reservation_expires_at: ENDED } })),
    { key: 'payment_refused', canPay: false, canRetry: false });
});

test('uncertain provider outcome: no pay and no retry, however long it lasts', () => {
  assert.deepEqual(stateOf(rows({ init: { status: 'uncertain' } })), { key: 'payment_uncertain', canPay: false, canRetry: false });
});

test('reservation expiry: terminal, no controls', () => {
  const s = stateOf(rows({ order: { payment_status: 'EXPIRED', order_status: 'CANCELLED', reservation_expires_at: ENDED } }));
  assert.deepEqual(s, { key: 'reservation_expired', canPay: false, canRetry: false });
});

test('cancellation: terminal, no controls even with a payment row open', () => {
  const s = stateOf(rows({ order: { order_status: 'CANCELLED' } }));
  assert.deepEqual(s, { key: 'cancelled', canPay: false, canRetry: false });
});

test('late-payment receipt: shown for review, no controls', () => {
  const s = stateOf(rows({ order: { payment_status: 'PENDING', order_status: 'CANCELLED' }, lates: [{ status: 'open' }] }));
  assert.deepEqual(s, { key: 'late_receipt', canPay: false, canRetry: false });
});

test('refund processing, completion and review are distinct states', () => {
  const base = { order: { payment_status: 'PAID', order_status: 'CANCELLED' } };
  assert.equal(stateOf(rows({ ...base, refunds: [{ refund_type: null, status: 'processing', gateway_state: 'sent' }] })).key, 'refund_processing');
  assert.equal(stateOf(rows({ ...base, refunds: [{ refund_type: null, status: 'succeeded', gateway_state: 'done' }] })).key, 'refund_completed');
  assert.equal(stateOf(rows({ ...base, refunds: [{ refund_type: null, status: 'failed', gateway_state: 'failed' }] })).key, 'refund_review');
  assert.equal(stateOf(rows({ ...base, refunds: [{ refund_type: null, status: 'succeeded', gateway_state: 'ambiguous' }] })).key, 'refund_review');
});

test('a paid order never offers pay or retry, whatever the initialisation says', () => {
  for (const init of ['refused', 'uncertain', 'created', null]) {
    const s = stateOf(rows({ order: { payment_status: 'PAID' }, init: init ? { status: init } : null }));
    assert.equal(s.canPay, false);
    assert.equal(s.canRetry, false);
  }
});

test('a refused attempt on an open reservation offers retry, never pay', () => {
  const s = stateOf(rows({ init: { status: 'refused' } }));
  assert.equal(s.canPay, false);
  assert.equal(s.canRetry, true);
});
