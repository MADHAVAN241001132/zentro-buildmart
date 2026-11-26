import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildRange, csvCell, grossProfitPaise, istDateOf, paginate, paiseToRupeeText, percentText, safeRatio, toCsv } from '../lib/reports/report-math';

test('presets use IST calendar days and inclusive ends', () => {
  const today = buildRange('today', '2026-11-26');
  assert.ok(today.ok);
  if (!today.ok) return;
  assert.equal(today.range.fromDate, '2026-11-26');
  assert.equal(today.range.startIso, '2026-11-25T18:30:00.000Z');
  assert.equal(today.range.endIso, '2026-11-26T18:30:00.000Z');

  const week = buildRange('7d', '2026-11-26');
  assert.ok(week.ok && week.range.fromDate === '2026-11-20');
  const mtd = buildRange('mtd', '2026-11-26');
  assert.ok(mtd.ok && mtd.range.fromDate === '2026-11-01');
  const ytd = buildRange('ytd', '2026-11-26');
  assert.ok(ytd.ok && ytd.range.fromDate === '2026-01-01');
});

test('custom ranges are validated', () => {
  assert.equal(buildRange('custom', '2026-11-26', { from: '2026-12-01', to: '2026-11-01' }).ok, false);
  assert.equal(buildRange('custom', '2026-11-26', { from: 'x', to: '2026-11-01' }).ok, false);
  assert.equal(buildRange('custom', '2026-11-26', { from: '2024-01-01', to: '2026-11-01' }).ok, false);
  const ok = buildRange('custom', '2026-11-26', { from: '2026-10-01', to: '2026-10-31' });
  assert.ok(ok.ok && ok.range.endIso === '2026-10-31T18:30:00.000Z');
});

test('IST date of an instant crosses midnight correctly', () => {
  assert.equal(istDateOf(new Date('2026-11-25T19:00:00Z')), '2026-11-26');
  assert.equal(istDateOf(new Date('2026-11-25T18:00:00Z')), '2026-11-25');
});

test('rupee text uses Indian grouping and two decimals', () => {
  assert.equal(paiseToRupeeText(0), '0.00');
  assert.equal(paiseToRupeeText(99), '0.99');
  assert.equal(paiseToRupeeText(123456789), '12,34,567.89');
  assert.equal(paiseToRupeeText(-150050), '-1,500.50');
});

test('ratios and percentages never produce NaN', () => {
  assert.equal(safeRatio(5, 0), 0);
  assert.equal(percentText(safeRatio(1, 4)), '25.0%');
  assert.equal(grossProfitPaise(10000, 7000), 3000);
});

test('CSV cells neutralise formula injection', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), `'+1`);
  assert.equal(csvCell('-5'), `'-5`);
  assert.equal(csvCell('@SUM(A1)'), `'@SUM(A1)`);
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(42), '42');
  assert.equal(csvCell(null), '');
});

test('CSV documents carry a BOM and quote commas and newlines', () => {
  const csv = toCsv(['name', 'note'], [['Tile, large', 'line1\nline2']]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('"Tile, large"'));
  assert.ok(csv.includes('"line1\nline2"'));
});

test('pagination clamps the page number', () => {
  const page = paginate([1, 2, 3, 4, 5], 9, 2);
  assert.equal(page.page, 3);
  assert.deepEqual(page.items, [5]);
  assert.equal(page.pages, 3);
  assert.equal(paginate([], 1, 10).pages, 1);
});
