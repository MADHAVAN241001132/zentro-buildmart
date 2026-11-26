import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerOrderMismatch } from '../lib/payments/provider-order-evidence';

const expected = { providerOrderId: 'order_ABC123xyz', expectedAmountPaise: 49900, currency: 'INR', orderNumber: 'ZBM-000042' };
const good = { id: 'order_ABC123xyz', amount: 49900, currency: 'INR', receipt: 'ZBM-000042', status: 'created' };

test('a matching provider order is accepted', () => {
  assert.equal(providerOrderMismatch(expected, good), null);
  assert.equal(providerOrderMismatch(expected, { ...good, status: 'paid' }), null);
});

test('a different order id is refused', () => {
  assert.match(providerOrderMismatch(expected, { ...good, id: 'order_OTHER0001' }) ?? '', /different order id/);
});

test('an amount that differs by one paisa is refused', () => {
  assert.match(providerOrderMismatch(expected, { ...good, amount: 49901 }) ?? '', /amount/);
});

test('a currency other than INR is refused', () => {
  assert.match(providerOrderMismatch(expected, { ...good, currency: 'USD' }) ?? '', /currency/);
});

test('a receipt that is not this order number is refused', () => {
  assert.match(providerOrderMismatch(expected, { ...good, receipt: 'ZBM-000043' }) ?? '', /receipt/);
  assert.match(providerOrderMismatch(expected, { ...good, receipt: null }) ?? '', /receipt/);
});

test('an unknown or missing status is refused', () => {
  assert.match(providerOrderMismatch(expected, { ...good, status: 'refunded' }) ?? '', /status/);
});
