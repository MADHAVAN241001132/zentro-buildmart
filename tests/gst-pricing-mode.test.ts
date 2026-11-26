import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineAmounts } from '../lib/gst/policy';

const taxed = { collect: true };

test('exclusive: GST is added on top of the configured price', () => {
  const a = lineAmounts(1000n, 1800, { ...taxed, inclusive: false });
  assert.deepEqual([a.taxablePaise, a.taxPaise, a.totalPaise], [1000n, 180n, 1180n]);
});

test('inclusive: 1180 at 18% contains 1000 taxable and 180 GST, and nothing is added', () => {
  const a = lineAmounts(1180n, 1800, { ...taxed, inclusive: true });
  assert.deepEqual([a.taxablePaise, a.taxPaise, a.totalPaise], [1000n, 180n, 1180n]);
});

test('inclusive odd paise: 999 at 18% -> taxable 847 (846.61 rounds up), tax 152', () => {
  const a = lineAmounts(999n, 1800, { ...taxed, inclusive: true });
  assert.deepEqual([a.taxablePaise, a.taxPaise, a.totalPaise], [847n, 152n, 999n]);
});

test('inclusive 5% and 12%: exact extraction', () => {
  assert.deepEqual(
    [lineAmounts(1050n, 500, { ...taxed, inclusive: true }).taxPaise, lineAmounts(1120n, 1200, { ...taxed, inclusive: true }).taxablePaise],
    [50n, 1000n],
  );
});

test('composition and unregistered: the configured price is payable, with no GST extracted or added', () => {
  const inc = lineAmounts(1180n, 1800, { collect: false, inclusive: true });
  const exc = lineAmounts(1180n, 1800, { collect: false, inclusive: false });
  assert.deepEqual([inc.taxablePaise, inc.taxPaise, inc.totalPaise], [1180n, 0n, 1180n]);
  assert.deepEqual([exc.taxablePaise, exc.taxPaise, exc.totalPaise], [1180n, 0n, 1180n]);
});

test('a line total always equals taxable plus tax (inclusive and exclusive), across rates and odd amounts', () => {
  for (const rate of [0, 500, 1200, 1800, 2800]) {
    for (let gross = 1n; gross <= 2000n; gross += 37n) {
      for (const inclusive of [true, false]) {
        const a = lineAmounts(gross, rate, { collect: true, inclusive });
        assert.equal(a.taxablePaise + a.taxPaise, a.totalPaise, `gross ${gross} rate ${rate} inclusive ${inclusive}`);
      }
    }
  }
});

test('negative amounts are refused', () => {
  assert.throws(() => lineAmounts(-1n, 1800, { collect: true, inclusive: true }), RangeError);
});
