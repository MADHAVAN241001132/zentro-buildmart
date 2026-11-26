import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { displayValue, fileStem, spreadsheetValue, datasetToCsv } from '../lib/exports/tabular';

test('money converts to rupee text for display and to rupees for spreadsheets', () => {
  assert.equal(displayValue(123456, 'money'), '1,234.56');
  assert.equal(spreadsheetValue(123456, 'money'), 1234.56);
  assert.equal(displayValue(null, 'money'), '');
  assert.equal(spreadsheetValue(7, 'int'), 7);
});

test('CSV export uses the dataset columns and rupee text', () => {
  const csv = datasetToCsv({
    title: 'Supplier purchases', subtitle: 'x', columns: [{ header: 'Supplier', kind: 'text' }, { header: 'Value (Rs.)', kind: 'money' }],
    rows: [['Acme, Ltd', 250050]],
  });
  assert.ok(csv.includes('"Acme, Ltd","2,500.50"'));
});

test('file names are slugged from the title', () => {
  assert.equal(fileStem({ title: 'Cash & Reconciliation (Daily)', subtitle: '', columns: [], rows: [] }), 'cash-reconciliation-daily');
});
