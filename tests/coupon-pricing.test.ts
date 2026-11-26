import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, PricingError } from '../lib/pricing';

const basket = [
  { key: 'a', unitPricePaise: 15000, quantity: 3, gstRateBps: 1800 },
  { key: 'b', unitPricePaise: 4500, quantity: 1, gstRateBps: 1200 },
];

test('database line shares are used as given, and GST follows each discounted line', () => {
  // Shares as computed by guest_cart_coupon_quote for a 10% coupon: 4500 + 450 = 4950 over subtotal 49500.
  const totals = priceCart(basket, { discountPaise: 4950, lineDiscountsPaise: [4500, 450] });
  assert.equal(totals.discountPaise, 4950);
  assert.equal(totals.lines[0]?.lineDiscountPaise, 4500);
  assert.equal(totals.lines[1]?.lineDiscountPaise, 450);
  assert.equal(totals.lines[0]?.lineTaxablePaise, 40500);
  assert.equal(totals.lines[0]?.lineTaxPaise, Math.round(40500 * 0.18));
  assert.equal(totals.lines[1]?.lineTaxPaise, Math.round(4050 * 0.12));
  assert.equal(totals.totalPaise, totals.subtotalPaise - totals.discountPaise + totals.taxPaise);
});

test('line shares that do not add up to the order discount are refused', () => {
  assert.throws(
    () => priceCart(basket, { discountPaise: 4950, lineDiscountsPaise: [4000, 450] }),
    PricingError,
  );
});

test('a line share larger than its line is refused', () => {
  assert.throws(
    () => priceCart(basket, { discountPaise: 4700, lineDiscountsPaise: [100, 4600] }),
    PricingError,
  );
});

test('line shares must match the number of lines', () => {
  assert.throws(() => priceCart(basket, { discountPaise: 0, lineDiscountsPaise: [0] }), PricingError);
});
