import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../lib/i18n/messages/en';
import { ta } from '../lib/i18n/messages/ta';
import { translate, missingTamilKeys } from '../lib/i18n/translate';

const STATES = [
  'cash_awaiting', 'paid', 'payment_starting', 'payment_ready', 'payment_pending', 'payment_failed',
  'payment_refused', 'payment_uncertain', 'payment_under_review', 'reservation_expired', 'cancelled',
  'late_receipt', 'refund_requested', 'refund_processing', 'refund_completed', 'refund_review',
] as const;

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

test('every payment state has an English and a Tamil title and body', () => {
  for (const state of STATES) {
    for (const part of ['title', 'body'] as const) {
      const key = `payState.${state}.${part}` as keyof typeof en;
      assert.ok(en[key] && en[key].trim().length > 0, `English ${key} is missing`);
      assert.ok(ta[key] && ta[key].trim().length > 0, `Tamil ${key} is missing`);
    }
  }
});

test('Tamil payment-state messages keep the same placeholders as English', () => {
  for (const state of STATES) {
    for (const part of ['title', 'body'] as const) {
      const key = `payState.${state}.${part}` as keyof typeof en;
      assert.deepEqual(placeholders(ta[key] ?? ''), placeholders(en[key] ?? ''), `placeholders differ for ${key}`);
    }
  }
});

test('the payment-state messages resolve in both locales without falling back to the raw key', () => {
  for (const state of STATES) {
    const key = `payState.${state}.body` as keyof typeof en;
    assert.notEqual(translate('en', key), key);
    assert.notEqual(translate('ta', key), key);
  }
});

test('no payment-state key is missing from the Tamil dictionary', () => {
  const missing = missingTamilKeys().filter((k) => k.startsWith('payState.'));
  assert.deepEqual(missing, []);
});
