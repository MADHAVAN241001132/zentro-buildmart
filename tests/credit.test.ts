import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openItems, summarise, withRunningBalance, type LedgerRow } from '../lib/services/credit';

const row = (id: string, entryType: LedgerRow['entryType'], amountPaise: number, createdAt: string, dueOn: string | null = null): LedgerRow => ({
  id, entryType, amountPaise, createdAt, dueOn, note: null,
});

test('a partial payment settles the oldest sale first', () => {
  const rows = [
    row('s1', 'sale', 600000, '2026-10-01T00:00:00Z', '2026-10-31'),
    row('s2', 'sale', 400000, '2026-11-01T00:00:00Z', '2026-12-01'),
    row('p1', 'payment', -250000, '2026-11-05T00:00:00Z'),
  ];
  const open = openItems(rows);
  assert.equal(open.length, 2);
  assert.equal(open[0]?.id, 's1');
  assert.equal(open[0]?.remainingPaise, 350000);
  assert.equal(open[1]?.remainingPaise, 400000);
});

test('overdue includes only open items whose due date has passed', () => {
  const rows = [
    row('s1', 'sale', 600000, '2026-10-01T00:00:00Z', '2026-10-31'),
    row('s2', 'sale', 400000, '2026-11-01T00:00:00Z', '2026-12-30'),
    row('p1', 'payment', -600000, '2026-11-05T00:00:00Z'),
  ];
  const summary = summarise(rows, '2026-11-26');
  assert.equal(summary.balancePaise, 400000);
  assert.equal(summary.overduePaise, 0);
  assert.equal(summary.nextDueOn, '2026-12-30');
});

test('an overdue sale with no payment is reported as overdue', () => {
  const rows = [row('s1', 'sale', 250000, '2026-09-01T00:00:00Z', '2026-10-01')];
  const summary = summarise(rows, '2026-11-26');
  assert.equal(summary.overduePaise, 250000);
});

test('a positive adjustment is owed with no due date and is never overdue', () => {
  const rows = [row('a1', 'adjustment', 5000, '2026-09-01T00:00:00Z')];
  const summary = summarise(rows, '2026-11-26');
  assert.equal(summary.balancePaise, 5000);
  assert.equal(summary.overduePaise, 0);
});

test('running balance follows chronological order', () => {
  const rows = [
    row('p1', 'payment', -100, '2026-11-02T00:00:00Z'),
    row('s1', 'sale', 1000, '2026-11-01T00:00:00Z'),
  ];
  const out = withRunningBalance(rows);
  assert.deepEqual(out.map((r) => r.runningPaise), [1000, 900]);
});
