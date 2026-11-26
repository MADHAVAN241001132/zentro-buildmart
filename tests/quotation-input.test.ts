import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineText, parseOwnerLineText, normaliseMobile, parseOptionalRupees, parseValidity, MAX_QUOTE_LINES } from '../lib/quotations/quotation-input';

test('line text accepts space or comma separators and uppercases the SKU', () => {
  const result = parseLineText('amb-v001 4\nAMB-V009, 2.5\n\n');
  assert.deepEqual(result, { ok: true, value: [{ sku: 'AMB-V001', quantity: 4 }, { sku: 'AMB-V009', quantity: 2.5 }] });
});

test('line text refuses empty input, bad quantities, duplicates and too many lines', () => {
  assert.equal(parseLineText('  \n ').ok, false);
  assert.equal(parseLineText('AMB-V001').ok, false);
  assert.equal(parseLineText('AMB-V001 0').ok, false);
  assert.equal(parseLineText('AMB-V001 1.2345').ok, false);
  assert.equal(parseLineText('AMB-V001 100000').ok, false);
  const dup = parseLineText('AMB-V001 1\namb-v001 2');
  assert.equal(dup.ok, false);
  const many = Array.from({ length: MAX_QUOTE_LINES + 1 }, (_, i) => `SKU-${i} 1`).join('\n');
  assert.equal(parseLineText(many).ok, false);
});

test('mobile numbers are normalised to ten digits', () => {
  assert.equal(normaliseMobile('98400 11001'), '9840011001');
  assert.equal(normaliseMobile('+91 9840011001'), '9840011001');
  assert.equal(normaliseMobile('09840011001'), '9840011001');
  assert.equal(normaliseMobile('12345'), null);
  assert.equal(normaliseMobile('abcdefghij'), null);
});

test('optional rupee amounts convert to paise and blanks mean not given', () => {
  assert.deepEqual(parseOptionalRupees(''), { ok: true, value: null });
  assert.deepEqual(parseOptionalRupees('1250.50'), { ok: true, value: 125050 });
  assert.equal(parseOptionalRupees('12.345').ok, false);
  assert.equal(parseOptionalRupees('-5').ok, false);
});

test('validity dates must be real dates on or after today', () => {
  assert.deepEqual(parseValidity('', '2026-11-26'), { ok: true, value: null });
  assert.deepEqual(parseValidity('2026-12-10', '2026-11-26'), { ok: true, value: '2026-12-10' });
  assert.deepEqual(parseValidity('2026-11-26', '2026-11-26'), { ok: true, value: '2026-11-26' });
  assert.equal(parseValidity('2026-11-25', '2026-11-26').ok, false);
  assert.equal(parseValidity('2026-02-30', '2026-01-01').ok, false);
  assert.equal(parseValidity('10/12/2026', '2026-01-01').ok, false);
});

test('owner lines accept optional unit price and discount in rupees', () => {
  const result = parseOwnerLineText('amb-v001 4 950 120\nAMB-V009 2.5\nAMB-V010,1,1250.50');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value[0], { sku: 'AMB-V001', quantity: 4, unitPricePaise: 95000, discountPaise: 12000 });
  assert.deepEqual(result.value[1], { sku: 'AMB-V009', quantity: 2.5, unitPricePaise: null, discountPaise: 0 });
  assert.equal(result.value[2]?.unitPricePaise, 125050);
});

test('owner lines reject a zero price and duplicate SKUs', () => {
  assert.equal(parseOwnerLineText('AMB-V001 2 0').ok, false);
  assert.equal(parseOwnerLineText('AMB-V001 2\namb-v001 3').ok, false);
});
