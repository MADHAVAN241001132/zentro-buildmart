import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileInvoiceFigures,
  gstBreakdownByRate,
  formatPlainInr,
  formatQuantity,
  formatGstRate,
  type InvoiceLineFigures,
  type InvoiceTotalFigures,
} from '../lib/invoices/invoice-math';

// Two lines: 2 x 10000 paise at 18% with 1000 discount, and 3 x 2500 paise at 5% with no discount.
const LINES: InvoiceLineFigures[] = [
  { quantity: 2, unitPricePaise: 10000, discountPaise: 1000, gstRateBps: 1800, taxablePaise: 19000, taxPaise: 3420, lineTotalPaise: 22420 },
  { quantity: 3, unitPricePaise: 2500, discountPaise: 0, gstRateBps: 500, taxablePaise: 7500, taxPaise: 375, lineTotalPaise: 7875 },
];
const TOTALS: InvoiceTotalFigures = {
  subtotalPaise: 27500,
  discountPaise: 1000,
  taxablePaise: 26500,
  taxPaise: 3795,
  deliveryPaise: 0,
  totalPaise: 30295,
};

test('consistent figures reconcile with no problems', () => {
  assert.deepEqual(reconcileInvoiceFigures(LINES, TOTALS), []);
});

test('delivery charge is included in the payable total check', () => {
  const withDelivery = { ...TOTALS, deliveryPaise: 500, totalPaise: 30795 };
  assert.deepEqual(reconcileInvoiceFigures(LINES, withDelivery), []);
  const wrong = { ...TOTALS, deliveryPaise: 500, totalPaise: 30295 };
  assert.ok(reconcileInvoiceFigures(LINES, wrong).some((p) => p.includes('Payable total')));
});

test('a changed tax total is reported', () => {
  const problems = reconcileInvoiceFigures(LINES, { ...TOTALS, taxPaise: 3800, totalPaise: 30300 });
  assert.ok(problems.some((p) => p.includes('GST total')));
});

test('a changed discount is reported against line and taxable figures', () => {
  const problems = reconcileInvoiceFigures(LINES, { ...TOTALS, discountPaise: 900 });
  assert.ok(problems.some((p) => p.includes('order discount')));
  assert.ok(problems.some((p) => p.includes('Taxable amount')));
});

test('an empty invoice is reported', () => {
  assert.ok(reconcileInvoiceFigures([], TOTALS).some((p) => p.includes('no lines')));
});

test('GST is grouped by rate and split into CGST and SGST that add up exactly', () => {
  const rows = gstBreakdownByRate(LINES);
  assert.deepEqual(rows.map((r) => r.rateBps), [500, 1800]);
  const eighteen = rows[1]!;
  assert.equal(eighteen.taxablePaise, 19000);
  assert.equal(eighteen.taxPaise, 3420);
  assert.equal(eighteen.cgstPaise, 1710);
  assert.equal(eighteen.sgstPaise, 1710);
  const odd = gstBreakdownByRate([{ ...LINES[0]!, taxPaise: 3421 }]);
  assert.equal(odd[0]!.cgstPaise + odd[0]!.sgstPaise, 3421);
  assert.equal(odd[0]!.sgstPaise - odd[0]!.cgstPaise, 1);
});

test('plain INR formatting uses Indian digit grouping and two decimals', () => {
  assert.equal(formatPlainInr(0), '0.00');
  assert.equal(formatPlainInr(5), '0.05');
  assert.equal(formatPlainInr(123456), '1,234.56');
  assert.equal(formatPlainInr(1234567), '12,345.67');
  assert.equal(formatPlainInr(123456789), '12,34,567.89');
  assert.equal(formatPlainInr(-250), '-2.50');
  assert.throws(() => formatPlainInr(1.5));
});

test('quantity and GST labels drop trailing zeros', () => {
  assert.equal(formatQuantity(3), '3');
  assert.equal(formatQuantity(12.5), '12.5');
  assert.equal(formatQuantity(1.2345), '1.234');
  assert.equal(formatGstRate(1800), '18%');
  assert.equal(formatGstRate(1250), '12.5%');
});
