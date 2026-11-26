import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  PAYMENT_STATUSES, PAGE_SIZE, defaultRange, istRangeIso, isIsoDate, pageBounds, pageCount, parseListQuery, sanitiseSearch,
} from '../lib/payments/reconciliation-filters';

const NOW = new Date('2026-11-26T10:00:00Z'); // 15:30 IST on 26 Nov 2026

test('IST today and the default 30-day window are computed in Asia/Kolkata', () => {
  assert.deepEqual(defaultRange(NOW), { from: '2026-10-28', to: '2026-11-26' });
  // Just after IST midnight, the IST date has advanced although UTC has not.
  assert.deepEqual(defaultRange(new Date('2026-11-25T19:00:00Z')).to, '2026-11-26');
});

test('IST range is half-open and includes the whole last day', () => {
  assert.deepEqual(istRangeIso('2026-11-01', '2026-11-01'), {
    startIso: '2026-11-01T00:00:00+05:30', endIso: '2026-11-02T00:00:00+05:30',
  });
  assert.equal(istRangeIso('2026-11-02', '2026-11-01'), null, 'reversed range refused');
  assert.equal(istRangeIso('2025-01-01', '2026-11-01'), null, 'range longer than a year refused');
  assert.equal(istRangeIso('2026-02-30', '2026-03-01'), null, 'impossible date refused');
});

test('ISO date validation rejects malformed and impossible dates', () => {
  assert.equal(isIsoDate('2026-11-26'), true);
  assert.equal(isIsoDate('26-11-2026'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate("2026-11-26'; drop"), false);
});

test('search text is reduced to safe characters and a bounded length', () => {
  assert.equal(sanitiseSearch("ZB-2026'%;"), 'ZB-2026');
  assert.equal(sanitiseSearch('x'.repeat(100)).length, 40);
  assert.equal(sanitiseSearch(undefined), '');
});

test('list query ignores unknown statuses, bad dates and bad pages', () => {
  const q = parseListQuery({ status: 'DROP TABLE', from: 'nope', to: '2026-11-20', page: '-4', q: 'ZB 1' }, PAYMENT_STATUSES, NOW);
  assert.equal(q.status, null);
  assert.equal(q.from, '2026-10-28', 'invalid from falls back to the default');
  assert.equal(q.to, '2026-11-20');
  assert.equal(q.page, 1);
  assert.equal(q.q, 'ZB1');
  assert.equal(parseListQuery({ status: 'PAID', page: '3' }, PAYMENT_STATUSES, NOW).status, 'PAID');
  assert.equal(parseListQuery({ page: '99999' }, PAYMENT_STATUSES, NOW).page, 1);
});

test('pagination bounds and page counts are exact', () => {
  assert.equal(PAGE_SIZE, 25);
  assert.deepEqual(pageBounds(1), { from: 0, to: 24 });
  assert.deepEqual(pageBounds(3), { from: 50, to: 74 });
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(25), 1);
  assert.equal(pageCount(26), 2);
});
