import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCart } from '../lib/pricing';

// Two units at ₹590.00 each (118000 paise), 18% GST. Exact values, integer paise.
const lines = [{ key: 'v1', unitPricePaise: 59000, quantity: 2, gstRateBps: 1800 }];

test('inclusive, no coupon: ₹1,180 contains ₹1,000 taxable and ₹180 GST; nothing is added', () => {
  const t = priceCart(lines, { inclusive: true });
  assert.equal(t.subtotalPaise, 100000);
  assert.equal(t.discountPaise, 0);
  assert.equal(t.taxPaise, 18000);
  assert.equal(t.totalPaise, 118000);
  assert.equal(t.lines[0]?.lineTotalPaise, 118000);
});

test('exclusive, no coupon: ₹1,180 plus 18% = ₹212.40 GST, ₹1,392.40 payable', () => {
  const t = priceCart(lines, { inclusive: false });
  assert.equal(t.subtotalPaise, 118000);
  assert.equal(t.taxPaise, 21240);
  assert.equal(t.totalPaise, 139240);
});

test('inclusive with a 10% coupon: discount on the gross first, then GST extracted from what remains', () => {
  // Gross discount 11800 (10% of 118000). Remaining gross 106200 -> taxable 90000, GST 16200.
  const t = priceCart(lines, { inclusive: true, discountPaise: 11800 });
  assert.equal(t.grossDiscountPaise, 11800);
  assert.equal(t.grossSubtotalPaise, 118000);
  assert.equal(t.taxPaise, 16200);
  assert.equal(t.discountPaise, 10000, 'ledger discount is on the taxable basis: 100000 - 90000');
  assert.equal(t.subtotalPaise - t.discountPaise + t.taxPaise, t.totalPaise);
  assert.equal(t.totalPaise, 106200);
});

test('exclusive with a 10% coupon: the ledger discount equals the gross discount', () => {
  const t = priceCart(lines, { inclusive: false, discountPaise: 11800 });
  assert.equal(t.discountPaise, 11800);
  assert.equal(t.taxPaise, 19116);
  assert.equal(t.totalPaise, 106200 + 19116);
});

test('inclusive, composition or unregistered: the configured price is payable, no GST extracted', () => {
  const t = priceCart(lines, { inclusive: true, taxCollected: false });
  assert.equal(t.taxPaise, 0);
  assert.equal(t.subtotalPaise, 118000);
  assert.equal(t.totalPaise, 118000);
});

test('inclusive, odd paise with two rates: ledger identity holds on every line', () => {
  const mixed = [
    { key: 'a', unitPricePaise: 999, quantity: 3, gstRateBps: 1800 },
    { key: 'b', unitPricePaise: 1050, quantity: 1, gstRateBps: 500 },
  ];
  const t = priceCart(mixed, { inclusive: true, discountPaise: 333 });
  assert.equal(t.subtotalPaise - t.discountPaise + t.taxPaise, t.totalPaise);
  assert.equal(t.totalPaise, t.grossSubtotalPaise - t.grossDiscountPaise);
  const lineTax = t.lines.reduce((s, l) => s + l.lineTaxPaise, 0);
  assert.equal(lineTax, t.taxPaise);
});
