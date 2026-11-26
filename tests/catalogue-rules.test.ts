import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCatalogue, evaluatePrices, parseRupees, parseGstRate, normaliseName, CATALOGUE_COLUMNS, PRICE_COLUMNS, type ImportContext } from '../lib/imports/catalogue-rules';
import type { SheetRow } from '../lib/imports/read-spreadsheet';

const header = CATALOGUE_COLUMNS.map((c) => c.header);
const priceHeader = PRICE_COLUMNS.map((c) => c.header);

function sheet(headerCells: string[], lines: string[][]): SheetRow[] {
  return [{ rowNumber: 1, cells: headerCells }, ...lines.map((cells, i) => ({ rowNumber: i + 2, cells }))];
}

/** One product row: product SKU, name, category, variant SKU, variant name, costs, GST, stock and reorder level. */
function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Product SKU': 'TILE-1',
    'Product name': 'Matt floor tile',
    'Product description': '',
    Category: 'Floor tiles',
    Brand: '',
    'Variant SKU': 'TILE-1-A',
    'Variant name': 'Grey 600',
    Dimensions: '600 x 600',
    Material: 'Ceramic',
    'Measurement unit': 'box',
    'Cost price': '900.00',
    'Selling price': '1,250.50',
    MRP: '',
    'GST rate': '18',
    'Opening stock': '10',
    'Reorder level': '4',
    'Product status': 'active',
  };
  const merged = { ...base, ...overrides };
  return header.map((h) => merged[h] ?? '');
}

const emptyContext = (): ImportContext => ({
  categories: new Map([[normaliseName('Floor tiles'), 'cat-1']]),
  brands: new Map(),
  products: new Map(),
  variants: new Map(),
  productSlugs: new Set(),
});

test('money: rupee text becomes integer paise with no floating-point drift', () => {
  assert.deepEqual(parseRupees('1,250.50', 'Selling price', true), { value: 125050 });
  assert.deepEqual(parseRupees('0.10', 'Cost price', true), { value: 10 });
  assert.deepEqual(parseRupees('2', 'Selling price', true), { value: 200 });
  assert.ok('error' in parseRupees('12.345', 'Selling price', true));
  assert.ok('error' in parseRupees('-5', 'Selling price', true));
});

test('GST: only the five allowed rates are accepted, stored in basis points', () => {
  assert.deepEqual(parseGstRate('18'), { value: 1800 });
  assert.deepEqual(parseGstRate('5%'), { value: 500 });
  assert.deepEqual(parseGstRate('28'), { value: 2800 });
  assert.ok('error' in parseGstRate('19'));
  assert.ok('error' in parseGstRate('18.5'));
});

test('catalogue: a valid row is ready and the summary counts it', () => {
  const out = evaluateCatalogue(sheet(header, [row()]), 'skip', emptyContext());
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.summary.readyRows, 1);
  assert.equal(out.summary.errorRows, 0);
  assert.equal(out.summary.productsToCreate, 1);
  assert.equal(out.summary.variantsToCreate, 1);
});

test('catalogue: a formula in a text cell is refused, so nothing can run in a spreadsheet', () => {
  const out = evaluateCatalogue(sheet(header, [row({ 'Product name': '=HYPERLINK("http://x")' })]), 'skip', emptyContext());
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.summary.errorRows, 1);
  assert.equal(out.summary.readyRows, 0);
});

test('catalogue: a GST rate outside the allowed list is an error on that row', () => {
  const out = evaluateCatalogue(sheet(header, [row({ 'GST rate': '19' })]), 'skip', emptyContext());
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.summary.errorRows, 1);
});

test('catalogue: a variant SKU repeated in the file is an error on every copy', () => {
  const out = evaluateCatalogue(sheet(header, [row(), row({ 'Variant name': 'Duplicate' })]), 'skip', emptyContext());
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.summary.errorRows, 2);
  assert.equal(out.summary.readyRows, 0);
});

test('catalogue: an existing variant SKU is skipped in skip mode and updated in update mode', () => {
  const ctx = emptyContext();
  ctx.products.set('TILE-1', { id: 'p1', slug: 'matt-floor-tile' });
  ctx.productSlugs.add('matt-floor-tile');
  ctx.variants.set('TILE-1-A', { id: 'v1', productSku: 'TILE-1', salePricePaise: 125050, costPricePaise: 90000, mrpPaise: null });
  const skipped = evaluateCatalogue(sheet(header, [row()]), 'skip', ctx);
  assert.equal(skipped.ok && skipped.summary.skippedRows, 1);
  const updated = evaluateCatalogue(sheet(header, [row()]), 'update', ctx);
  assert.equal(updated.ok && updated.summary.variantsToUpdate, 1);
});

test('catalogue: a blank product cell on a later row inherits the first row, and a conflicting value is an error', () => {
  const first = row({ 'Variant SKU': 'TILE-1-A' });
  const later = row({ 'Variant SKU': 'TILE-1-B', 'Variant name': 'Black 600', 'Product name': '' });
  const ok = evaluateCatalogue(sheet(header, [first, later]), 'skip', emptyContext());
  assert.equal(ok.ok && ok.summary.readyRows, 2);
  const conflict = row({ 'Variant SKU': 'TILE-1-B', 'Variant name': 'Black 600', 'Product name': 'Different name' });
  const bad = evaluateCatalogue(sheet(header, [first, conflict]), 'skip', emptyContext());
  assert.equal(bad.ok && bad.summary.errorRows, 1);
});

test('catalogue: a missing required column is reported by name', () => {
  const short = header.filter((h) => h !== 'GST rate');
  const out = evaluateCatalogue(sheet(short, [short.map(() => 'x')]), 'skip', emptyContext());
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(out.error, /GST rate/);
});

test('prices: updates an existing variant and refuses an unknown variant SKU', () => {
  const ctx = emptyContext();
  ctx.variants.set('TILE-1-A', { id: 'v1', productSku: 'TILE-1', salePricePaise: 100000, costPricePaise: 80000, mrpPaise: null });
  const out = evaluatePrices(sheet(priceHeader, [['TILE-1-A', '1,300', '850', ''], ['NOPE-1', '10', '5', '']]), ctx);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.summary.pricesToUpdate, 1);
  assert.equal(out.summary.errorRows, 1);
  assert.equal(out.prices[0]?.salePricePaise, 130000);
});
