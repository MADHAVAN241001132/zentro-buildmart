import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, allocateProportionally, PricingError } from '../lib/pricing';

test('allocateProportionally always sums exactly to the amount', () => {
  const parts = allocateProportionally(100n, [1n, 1n, 1n]);
  assert.equal(parts.reduce((s, v) => s + v, 0n), 100n);
  assert.deepEqual(parts, [34n, 33n, 33n]);
  const weighted = allocateProportionally(1000n, [3n, 1n]);
  assert.deepEqual(weighted, [750n, 250n]);
});

test('priceCart satisfies the database total constraint with discount and delivery', () => {
  const totals = priceCart(
    [
      { key: 'a', unitPricePaise: 33333, quantity: 3, gstRateBps: 1800 },
      { key: 'b', unitPricePaise: 12500, quantity: 2, gstRateBps: 1200 },
      { key: 'c', unitPricePaise: 999, quantity: 7, gstRateBps: 500 },
    ],
    { discountPaise: 4567, deliveryPaise: 5000 },
  );
  assert.equal(totals.totalPaise, totals.subtotalPaise - totals.discountPaise + totals.taxPaise + totals.deliveryPaise);
  const lineTax = totals.lines.reduce((s, l) => s + l.lineTaxPaise, 0);
  assert.equal(lineTax, totals.taxPaise);
  const lineDiscount = totals.lines.reduce((s, l) => s + l.lineDiscountPaise, 0);
  assert.equal(lineDiscount, totals.discountPaise);
});

test('priceCart computes GST on the discounted taxable value', () => {
  const totals = priceCart([{ key: 'x', unitPricePaise: 10000, quantity: 1, gstRateBps: 1800 }], {
    discountPaise: 1000,
  });
  assert.equal(totals.subtotalPaise, 10000);
  assert.equal(totals.taxPaise, 1620);
  assert.equal(totals.totalPaise, 10000 - 1000 + 1620);
});

test('priceCart rejects empty carts, over-discounts and bad quantities', () => {
  assert.throws(() => priceCart([]), PricingError);
  assert.throws(
    () => priceCart([{ key: 'x', unitPricePaise: 100, quantity: 1, gstRateBps: 0 }], { discountPaise: 101 }),
    PricingError,
  );
  assert.throws(() => priceCart([{ key: 'x', unitPricePaise: 100, quantity: 0, gstRateBps: 0 }]), PricingError);
  assert.throws(() => priceCart([{ key: 'x', unitPricePaise: 1.5, quantity: 1, gstRateBps: 0 }]), PricingError);
});
