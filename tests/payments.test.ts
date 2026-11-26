import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signWebhookBody,
  signCheckout,
  verifyWebhookSignature,
  verifyCheckoutSignature,
} from '../lib/payments/signatures';
import { generateGuestToken, hashGuestToken, guestCookieName, isWellFormedGuestToken } from '../lib/guest/token';

const SECRET = 'test_webhook_secret';
const BODY = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}';

test('webhook signature verifies the exact raw body', () => {
  const sig = signWebhookBody(BODY, SECRET);
  assert.equal(verifyWebhookSignature(BODY, sig, SECRET), true);
  assert.equal(verifyWebhookSignature(BODY + ' ', sig, SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, sig, 'other'), false);
  assert.equal(verifyWebhookSignature(BODY, null, SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, 'not-hex', SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, sig, ''), false);
});

test('checkout signature binds order id and payment id', () => {
  const sig = signCheckout('order_A', 'pay_B', 'key_secret');
  assert.equal(verifyCheckoutSignature({ orderId: 'order_A', paymentId: 'pay_B', signature: sig }, 'key_secret'), true);
  assert.equal(verifyCheckoutSignature({ orderId: 'order_A', paymentId: 'pay_C', signature: sig }, 'key_secret'), false);
  assert.equal(verifyCheckoutSignature({ orderId: 'order_A', paymentId: 'pay_B', signature: sig }, 'wrong'), false);
  assert.equal(verifyCheckoutSignature({ orderId: '', paymentId: 'pay_B', signature: sig }, 'key_secret'), false);
});

test('guest tokens are 43-char base64url and hash deterministically', () => {
  const token = generateGuestToken();
  assert.equal(isWellFormedGuestToken(token), true);
  assert.equal(hashGuestToken(token), hashGuestToken(token));
  assert.equal(hashGuestToken(token).length, 64);
  assert.notEqual(hashGuestToken(token), token);
  assert.equal(isWellFormedGuestToken('short'), false);
  assert.equal(isWellFormedGuestToken(undefined), false);
});

test('guest cookie name is derived from a validated slug', () => {
  assert.equal(guestCookieName('ambattur-central'), 'zb_guest_ambattur-central');
  assert.throws(() => guestCookieName('Bad Slug!'));
});
