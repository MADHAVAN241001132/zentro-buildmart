import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gstinProblem, gstComponents, gstStateByCode, storeTaxMode, GST_STATE_CODES } from '../lib/gst/policy';
import { priceCart } from '../lib/pricing';

test('a well-formed GSTIN with a correct check digit is accepted (format only, not registration)', () => {
  assert.equal(gstinProblem('27AAPFU0939F1ZV'), null);
  assert.equal(gstinProblem('33AAAAA1234A1ZV'), null);
});

test('a wrong check digit, unknown state, wrong shape and missing value are each reported', () => {
  assert.equal(gstinProblem('27AAPFU0939F1ZX'), 'check_digit');
  assert.equal(gstinProblem('99AAPFU0939F1ZV'), 'state_code');
  assert.equal(gstinProblem('27AAPFU0939F1Z'), 'format');
  assert.equal(gstinProblem('27aapfu0939f1zv'), 'format');
  assert.equal(gstinProblem(null), 'missing');
  assert.equal(gstinProblem(''), 'missing');
});

test('the state table has 37 entries, no duplicate codes, and the expected union territories', () => {
  assert.equal(GST_STATE_CODES.length, 37);
  assert.equal(new Set(GST_STATE_CODES.map((s) => s.code)).size, 37);
  assert.equal(gstStateByCode('33')?.name, 'Tamil Nadu');
  assert.equal(gstStateByCode('35')?.regime, 'ut');
  assert.equal(gstStateByCode('33')?.regime, 'state');
  assert.equal(gstStateByCode('25'), null);
});

test('only a regular store with a valid GSTIN matching its state code collects GST', () => {
  const good = { gst_registration: 'regular', gstin: '33AAAAA1234A1ZV', state_code: '33' };
  assert.equal(storeTaxMode(good), 'taxed');
  assert.equal(storeTaxMode({ ...good, gst_registration: 'composition' }), 'not_collected');
  assert.equal(storeTaxMode({ ...good, gst_registration: 'unregistered' }), 'not_collected');
  assert.equal(storeTaxMode({ ...good, gstin: '33AAAAA1234A1Z5' }), 'invalid_profile');
  assert.equal(storeTaxMode({ ...good, state_code: null }), 'invalid_profile');
  assert.equal(storeTaxMode({ ...good, state_code: '27' }), 'invalid_profile');
});

test('intrastate supply splits into equal CGST and SGST that add up to the line tax', () => {
  const c = gstComponents(10000n, 1800, { collect: true, interstate: false, ut: false });
  assert.deepEqual([c.cgstPaise, c.sgstPaise, c.utgstPaise, c.igstPaise, c.totalPaise], [900n, 900n, 0n, 0n, 1800n]);
});

test('an odd rounding remainder goes to the second half so the parts always equal the total', () => {
  // 999 x 18% = 179.82 -> 180. Half rate: 999 x 9% = 89.91 -> 90, remainder 90.
  const c = gstComponents(999n, 1800, { collect: true, interstate: false, ut: false });
  assert.equal(c.totalPaise, 180n);
  assert.equal(c.cgstPaise + c.sgstPaise, 180n);
  assert.equal(c.cgstPaise, 90n);
});

test('union territory intrastate supply carries UTGST instead of SGST', () => {
  const c = gstComponents(10000n, 1800, { collect: true, interstate: false, ut: true });
  assert.deepEqual([c.cgstPaise, c.sgstPaise, c.utgstPaise, c.igstPaise], [900n, 0n, 900n, 0n]);
});

test('interstate supply is IGST equal to the full line tax (10001 x 5% = 500.05 -> 500)', () => {
  const c = gstComponents(10001n, 500, { collect: true, interstate: true, ut: false });
  assert.deepEqual([c.cgstPaise, c.sgstPaise, c.utgstPaise, c.igstPaise, c.totalPaise], [0n, 0n, 0n, 500n, 500n]);
});

test('a store that may not collect GST has zero components for every supply', () => {
  const c = gstComponents(10000n, 1800, { collect: false, interstate: true, ut: false });
  assert.equal(c.totalPaise, 0n);
  assert.equal(c.igstPaise, 0n);
});

test('pricing with taxCollected false charges no tax and the total is the subtotal less discount', () => {
  const lines = [{ key: 'a', unitPricePaise: 10000, quantity: 2, gstRateBps: 1800 }];
  const taxed = priceCart(lines, {});
  const untaxed = priceCart(lines, { taxCollected: false });
  assert.equal(taxed.taxPaise, 3600);
  assert.equal(untaxed.taxPaise, 0);
  assert.equal(untaxed.totalPaise, 20000);
  assert.equal(untaxed.lines[0]?.lineTaxPaise, 0);
});
