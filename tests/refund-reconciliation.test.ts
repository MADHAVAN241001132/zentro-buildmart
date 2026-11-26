import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGatewayFailure, decideReconciliation } from '../lib/payments/refund-reconciliation';

const REFUND = '6f1c2d3e-0000-4000-8000-000000000001';

test('no gateway record with our receipt means the gateway holds nothing for this request', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: null,
    records: [{ id: 'rfnd_other', amount: 1000, status: 'processed', receipt: 'someone-else' }],
  });
  assert.equal(decision.action, 'not_found');
});

test('a processed refund matched by receipt settles as success with its gateway id', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: null,
    records: [{ id: 'rfnd_1', amount: 1000, status: 'processed', receipt: REFUND }],
  });
  assert.deepEqual(decision, { action: 'settle_success', gatewayRefundId: 'rfnd_1', amountPaise: 1000 });
});

test('a failed refund settles as failed', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: 'rfnd_2',
    records: [{ id: 'rfnd_2', amount: 1000, status: 'failed', receipt: REFUND }],
  });
  assert.equal(decision.action, 'settle_failed');
  assert.equal((decision as { gatewayRefundId: string }).gatewayRefundId, 'rfnd_2');
});

test('a pending refund waits for its webhook and is not settled', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: null,
    records: [{ id: 'rfnd_3', amount: 1000, status: 'pending', receipt: REFUND }],
  });
  assert.equal(decision.action, 'await_webhook');
});

test('two gateway refunds for one request is a conflict, never an action', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: null,
    records: [
      { id: 'rfnd_a', amount: 1000, status: 'processed', receipt: REFUND },
      { id: 'rfnd_b', amount: 1000, status: 'processed', receipt: REFUND },
    ],
  });
  assert.equal(decision.action, 'conflict');
});

test('an amount that differs from our refund is a conflict and settles nothing', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: null,
    records: [{ id: 'rfnd_c', amount: 999, status: 'processed', receipt: REFUND }],
  });
  assert.equal(decision.action, 'conflict');
});

test('a gateway id that differs from the one we stored is a conflict', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: 'rfnd_known',
    records: [{ id: 'rfnd_other', amount: 1000, status: 'processed', receipt: REFUND }],
  });
  assert.equal(decision.action, 'conflict');
});

test('a stored gateway id is matched even when the receipt is missing', () => {
  const decision = decideReconciliation({
    refundId: REFUND,
    amountPaise: 1000,
    knownGatewayRefundId: 'rfnd_known',
    records: [{ id: 'rfnd_known', amount: 1000, status: 'processed', receipt: null }],
  });
  assert.equal(decision.action, 'settle_success');
});

test('client-side rejections are refused; timeouts, rate limits, server errors and unknown causes are ambiguous', () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(classifyGatewayFailure({ status }), 'refused', `status ${status}`);
  }
  for (const status of [408, 409, 429, 500, 502, 503]) {
    assert.equal(classifyGatewayFailure({ status }), 'ambiguous', `status ${status}`);
  }
  assert.equal(classifyGatewayFailure(new TypeError('fetch failed')), 'ambiguous');
  assert.equal(classifyGatewayFailure(undefined), 'ambiguous');
});
