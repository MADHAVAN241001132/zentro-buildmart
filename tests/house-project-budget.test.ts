import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateBudget, estimateLine, validPlannerQuantity } from '../lib/planner/budget';

test('line total adds GST on top of the taxable value in whole paise', () => {
  // 3 x Rs 1,000.00 at 18% GST: taxable 300000 paise, GST 54000 paise.
  const e = estimateLine({ key: 'a', roomId: 'r1', unitPricePaise: 100000, quantity: 3, gstRateBps: 1800 });
  assert.equal(e.taxablePaise, 300000);
  assert.equal(e.gstPaise, 54000);
  assert.equal(e.totalPaise, 354000);
});

test('GST rounds half up to the nearest paisa', () => {
  // 1 x Rs 0.05 (5 paise) at 5% GST = 0.25 paise, which rounds to 0.
  const e = estimateLine({ key: 'a', roomId: null, unitPricePaise: 5, quantity: 1, gstRateBps: 500 });
  assert.equal(e.gstPaise, 0);
  // 1 x 10 paise at 5% = 0.5 paise, which rounds up to 1.
  const f = estimateLine({ key: 'b', roomId: null, unitPricePaise: 10, quantity: 1, gstRateBps: 500 });
  assert.equal(f.gstPaise, 1);
});

test('room totals sum per room and project-level lines sit under the empty key', () => {
  const s = estimateBudget(
    [
      { key: 'a', roomId: 'kitchen', unitPricePaise: 10000, quantity: 2, gstRateBps: 0 },
      { key: 'b', roomId: 'kitchen', unitPricePaise: 5000, quantity: 1, gstRateBps: 0 },
      { key: 'c', roomId: null, unitPricePaise: 2000, quantity: 4, gstRateBps: 0 },
    ],
    null,
  );
  assert.equal(s.roomTotalsPaise['kitchen'], 25000);
  assert.equal(s.roomTotalsPaise[''], 8000);
  assert.equal(s.totalPaise, 33000);
  assert.equal(s.status, 'no_budget');
  assert.equal(s.remainingPaise, null);
});

test('budget status moves from within to near to exceeded', () => {
  const line = (q: number) => [{ key: 'a', roomId: null, unitPricePaise: 10000, quantity: q, gstRateBps: 0 }];
  const within = estimateBudget(line(5), 100000);
  assert.equal(within.status, 'within');
  assert.equal(within.remainingPaise, 50000);
  assert.equal(within.utilisationPercent, 50);

  const near = estimateBudget(line(9), 100000);
  assert.equal(near.status, 'near');
  assert.equal(near.utilisationPercent, 90);

  const exceeded = estimateBudget(line(11), 100000);
  assert.equal(exceeded.status, 'exceeded');
  assert.equal(exceeded.remainingPaise, -10000);
});

test('zero budget with spend is exceeded and reports no percentage', () => {
  const s = estimateBudget([{ key: 'a', roomId: null, unitPricePaise: 100, quantity: 1, gstRateBps: 0 }], 0);
  assert.equal(s.status, 'exceeded');
  assert.equal(s.utilisationPercent, null);
});

test('quantities must be whole numbers from one to the planner maximum (999)', () => {
  assert.equal(validPlannerQuantity(1), 1);
  assert.equal(validPlannerQuantity(999), 999);
  assert.equal(validPlannerQuantity(0), null);
  assert.equal(validPlannerQuantity(1.5), null);
  assert.equal(validPlannerQuantity(1000), null);
  assert.equal(validPlannerQuantity('3'), null);
});

test('invalid money inputs are refused rather than rounded', () => {
  assert.throws(() => estimateLine({ key: 'a', roomId: null, unitPricePaise: 10.5, quantity: 1, gstRateBps: 0 }));
  assert.throws(() => estimateLine({ key: 'a', roomId: null, unitPricePaise: 10, quantity: 1, gstRateBps: 3000 }));
  assert.throws(() => estimateBudget([], 12.5));
});
