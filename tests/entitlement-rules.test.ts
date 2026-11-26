import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREMIUM_FEATURE_KEYS,
  coveringRow,
  daysUntilExpiry,
  featureDecision,
  istDate,
  isExpiringSoon,
  quotaDecision,
  classifyDatabaseLimitMessage,
  usageSummary,
  subscriptionState,
  type SubscriptionRow,
} from '../lib/entitlements/rules';

const period = (periodStart: string, periodEnd: string, status: SubscriptionRow['status'] = 'active', graceEndsOn: string | null = null): SubscriptionRow =>
  ({ status, periodStart, periodEnd, graceEndsOn });

const ACTIVE_STORE = { storeStatus: 'active', allowanceExpiresOn: null } as const;

test('an active store with no subscription and no allowance is unsubscribed', () => {
  assert.equal(subscriptionState([], '2026-11-26', ACTIVE_STORE), 'unsubscribed');
});

test('a draft store with no subscription is in setup, not restricted by quota', () => {
  assert.equal(subscriptionState([], '2026-11-26', { storeStatus: 'draft', allowanceExpiresOn: null }), 'setup');
});

test('a current allowance covers a store without subscription rows, until it expires', () => {
  assert.equal(subscriptionState([], '2026-11-26', { storeStatus: 'active', allowanceExpiresOn: '2026-11-30' }), 'allowance');
  assert.equal(subscriptionState([], '2026-11-30', { storeStatus: 'active', allowanceExpiresOn: '2026-11-30' }), 'allowance');
  assert.equal(subscriptionState([], '2026-12-01', { storeStatus: 'active', allowanceExpiresOn: '2026-11-30' }), 'unsubscribed');
});

test('a covering period makes the store active on both boundary days', () => {
  const rows = [period('2026-11-01', '2026-11-30')];
  assert.equal(subscriptionState(rows, '2026-11-01', ACTIVE_STORE), 'active');
  assert.equal(subscriptionState(rows, '2026-11-30', ACTIVE_STORE), 'active');
});

test('a period that ended the day before is expired, and a later period is upcoming', () => {
  assert.equal(subscriptionState([period('2026-10-01', '2026-11-25')], '2026-11-26', ACTIVE_STORE), 'expired');
  assert.equal(subscriptionState([period('2026-12-01', '2026-12-31')], '2026-11-26', ACTIVE_STORE), 'upcoming');
});

test('a grace row covers through the grace end date only', () => {
  const rows = [period('2026-10-01', '2026-11-20', 'grace', '2026-11-28')];
  assert.equal(subscriptionState(rows, '2026-11-28', ACTIVE_STORE), 'active');
  assert.equal(subscriptionState(rows, '2026-11-29', ACTIVE_STORE), 'expired');
});

test('cancelled and expired rows never make a store active or upcoming', () => {
  const rows = [period('2026-12-01', '2026-12-31', 'cancelled'), period('2026-10-01', '2026-10-31', 'expired')];
  assert.equal(subscriptionState(rows, '2026-11-26', ACTIVE_STORE), 'expired');
});

test('renewal history: the covering row is the one ending latest', () => {
  const rows = [period('2026-10-01', '2026-11-30'), period('2026-11-01', '2026-12-31')];
  assert.equal(coveringRow(rows, '2026-11-15')?.periodEnd, '2026-12-31');
});

test('expiry countdown and the upcoming-expiry window', () => {
  const rows = [period('2026-11-01', '2026-12-10')];
  assert.equal(daysUntilExpiry(rows, '2026-11-26'), 14);
  assert.equal(isExpiringSoon(rows, '2026-11-26'), true);
  assert.equal(isExpiringSoon(rows, '2026-11-01'), false);
  assert.equal(daysUntilExpiry([period('2026-10-01', '2026-10-31')], '2026-11-26'), null);
});

test('quota: explicit unlimited allows any count, a null limit without the flag is refused', () => {
  assert.deepEqual(quotaDecision(10_000, null, true), { allowed: true });
  assert.deepEqual(quotaDecision(0, null, false), { allowed: false, reason: 'limit_not_configured' });
  assert.deepEqual(quotaDecision(199, 200, false), { allowed: true });
  assert.deepEqual(quotaDecision(200, 200, false), { allowed: false, reason: 'limit_reached' });
});

test('feature: subscribed stores need an active subscription, an enabled flag and no plan override', () => {
  assert.equal(featureDecision('active', true, {}, 'quotations'), true);
  assert.equal(featureDecision('active', false, {}, 'quotations'), false);
  assert.equal(featureDecision('active', undefined, {}, 'quotations'), false);
  assert.equal(featureDecision('active', true, { room_visualiser: false }, 'room_visualiser'), false);
  assert.equal(featureDecision('expired', true, {}, 'quotations'), false);
  assert.equal(featureDecision('upcoming', true, {}, 'quotations'), false);
});

test('feature: allowance and setup stores keep features unless a flag is explicitly disabled', () => {
  assert.equal(featureDecision('allowance', undefined, {}, 'pos_billing'), true);
  assert.equal(featureDecision('allowance', false, {}, 'pos_billing'), false);
  assert.equal(featureDecision('setup', true, {}, 'pos_billing'), true);
  assert.equal(featureDecision('unsubscribed', true, {}, 'pos_billing'), false);
});

test('premium keys include the modules named in the brief', () => {
  for (const key of ['room_visualiser', 'house_project_planner', 'bulk_imports', 'quotations', 'pos_billing']) {
    assert.ok((PREMIUM_FEATURE_KEYS as readonly string[]).includes(key), `${key} is premium`);
  }
});

test('istDate uses the Indian calendar day, not UTC', () => {
  // 20:00 UTC on 25 Nov is 01:30 IST on 26 Nov.
  assert.equal(istDate(new Date('2026-11-25T20:00:00Z')), '2026-11-26');
  assert.equal(istDate(new Date('2026-11-25T10:00:00Z')), '2026-11-25');
});

test('database limit messages map to the right code, including "not configured" before "limit reached"', () => {
  assert.equal(classifyDatabaseLimitMessage('The product limit for the current plan has been reached')?.code, 'limit_reached');
  assert.equal(classifyDatabaseLimitMessage('The user limit for the current plan has been reached')?.code, 'limit_reached');
  assert.equal(classifyDatabaseLimitMessage('The plan has no product limit configured')?.code, 'limit_not_configured');
  assert.equal(classifyDatabaseLimitMessage('The plan has no user limit configured')?.code, 'limit_not_configured');
  assert.equal(classifyDatabaseLimitMessage('The subscription for this store is not active')?.code, 'subscription_inactive');
  assert.equal(classifyDatabaseLimitMessage('duplicate key value violates unique constraint'), null);
});

test('usage: unlimited, near-limit and reached are distinct and a missing limit is not_configured', () => {
  assert.equal(usageSummary(500, null, true).level, 'unlimited');
  assert.equal(usageSummary(10, 200, false).level, 'ok');
  assert.equal(usageSummary(10, 200, false).remaining, 190);
  assert.equal(usageSummary(170, 200, false).level, 'near');
  assert.equal(usageSummary(200, 200, false).level, 'reached');
  assert.equal(usageSummary(200, 200, false).remaining, 0);
  assert.equal(usageSummary(3, null, false).level, 'not_configured');
});
