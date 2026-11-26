import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { barPercent, inclusiveDays, maxOf, percentOf, MAX_DASHBOARD_DAYS } from '@/lib/admin-dashboard/derive';

test('percentages round half up and refuse a zero or missing whole', () => {
  assert.equal(percentOf(1, 2), 50);
  assert.equal(percentOf(2, 3), 67);
  assert.equal(percentOf(0, 5), 0);
  assert.equal(percentOf(3, 0), null);
  assert.equal(percentOf(3, null), null);
});

test('bars scale to the largest value, keep a visible minimum, and show nothing for zero', () => {
  assert.equal(barPercent(0, 100), 0);
  assert.equal(barPercent(100, 100), 100);
  assert.equal(barPercent(1, 100000), 1);
  assert.equal(barPercent(5, 0), 0);
  assert.equal(barPercent(300, 100), 100);
});

test('the largest value of an empty list is zero', () => {
  assert.equal(maxOf([], (n: number) => n), 0);
  assert.equal(maxOf([{ v: 4 }, { v: 9 }], (r) => r.v), 9);
});

test('ranges are inclusive and reversed or invalid ranges have no length', () => {
  assert.equal(inclusiveDays('2026-11-01', '2026-11-01'), 1);
  assert.equal(inclusiveDays('2026-11-01', '2026-11-30'), 30);
  assert.equal(inclusiveDays('2026-11-30', '2026-11-01'), 0);
  assert.equal(inclusiveDays('not-a-date', '2026-11-01'), 0);
  assert.equal(MAX_DASHBOARD_DAYS, 366, 'matches the database limit in zb_admin_dashboard');
});

test('the dashboard page is gated by requireAdmin and reads only through the aggregate', () => {
  const page = readFileSync('app/admin/(portal)/page.tsx', 'utf8');
  assert.match(page, /await requireAdmin\(\)/);
  assert.doesNotMatch(page, /createSupabaseAdminClient/, 'the page never uses the service-role client');
  const service = readFileSync('lib/services/admin-dashboard.ts', 'utf8');
  assert.match(service, /rpc\('zb_admin_dashboard'/);
  assert.doesNotMatch(service, /createSupabaseAdminClient/);
  const sql = readFileSync('supabase/migrations/0048_admin_dashboard.sql', 'utf8');
  assert.match(sql, /if not app\.is_platform_admin\(\) then/, 'the database checks the platform administrator too');
});

test('the dashboard keeps merchant sales, collected payments and subscription receipts separate in its labels', () => {
  const page = readFileSync('app/admin/(portal)/page.tsx', 'utf8');
  assert.match(page, /Expected plan value/);
  assert.match(page, /Not collected revenue/);
  assert.match(page, /Gross order value/);
  assert.match(page, /Collected payments/);
  assert.match(page, /not verified physical scans/);
});
