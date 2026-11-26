import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatINR, parseRupeesToPaise, gstOn, roundDiv } from '../lib/money';

test('formatINR groups with Indian lakh separators and two decimals', () => {
  assert.equal(formatINR(0), '₹0.00');
  assert.equal(formatINR(5), '₹0.05');
  assert.equal(formatINR(123456), '₹1,234.56');
  assert.equal(formatINR(123456789), '₹12,34,567.89');
  assert.equal(formatINR(-250), '-₹2.50');
});

test('parseRupeesToPaise accepts plain and comma-separated amounts', () => {
  assert.equal(parseRupeesToPaise('1234'), 123400);
  assert.equal(parseRupeesToPaise('1,234.5'), 123450);
  assert.equal(parseRupeesToPaise(' 99.99 '), 9999);
  assert.equal(parseRupeesToPaise('0.5'), 50);
});

test('parseRupeesToPaise rejects invalid input', () => {
  assert.equal(parseRupeesToPaise(''), null);
  assert.equal(parseRupeesToPaise('-5'), null);
  assert.equal(parseRupeesToPaise('1.234'), null);
  assert.equal(parseRupeesToPaise('abc'), null);
});

test('gstOn uses basis points and rounds half up', () => {
  assert.equal(gstOn(10000n, 1800), 1800n);
  assert.equal(gstOn(1n, 1800), 0n);
  assert.equal(gstOn(5n, 5000), 3n);
  assert.equal(gstOn(0n, 1800), 0n);
});

test('roundDiv rounds half up and rejects non-positive divisors', () => {
  assert.equal(roundDiv(5n, 2n), 3n);
  assert.equal(roundDiv(4n, 2n), 2n);
  assert.throws(() => roundDiv(1n, 0n), RangeError);
});
