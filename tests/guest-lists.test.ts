import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison, planCartMoves, cleanProductIds, safeReturnPath, MAX_COMPARE, type CompareInput } from '../lib/lists/compare-rules';

const base = (overrides: Partial<CompareInput>): CompareInput => ({
  id: '00000000-0000-4000-8000-000000000001', name: 'Tile A', brand: 'Kajaria', material: 'Vitrified', finish: 'Matt', colour: 'Grey',
  application: 'floor', warrantyMonths: 12, gstRateBps: 1800, sizeLabel: '600 x 600', priceUnit: 'box',
  salePricePaise: 64000, mrpPaise: 72000, availableUnits: 10, specs: {}, ...overrides,
});

test('comparison: max is four products', () => {
  assert.equal(MAX_COMPARE, 4);
});

test('comparison: rows that match across products are not flagged; differing rows are', () => {
  const rows = buildComparison([base({}), base({ id: 'b', name: 'Tile B', salePricePaise: 75000 })]);
  const price = rows.find((r) => r.key === 'salePricePaise')!;
  const brand = rows.find((r) => r.key === 'brand')!;
  assert.equal(price.differs, true);
  assert.deepEqual(price.values, [64000, 75000]);
  assert.equal(brand.differs, false);
});

test('comparison: a product with no value for a row counts as a difference', () => {
  const rows = buildComparison([base({}), base({ id: 'b', material: null })]);
  const material = rows.find((r) => r.key === 'material')!;
  assert.equal(material.differs, true);
  assert.equal(material.values[1], null);
});

test('comparison: specification keys from any product become rows, sorted, with gaps flagged', () => {
  const rows = buildComparison([base({ specs: { 'Water absorption': '0.1%' } }), base({ id: 'b', specs: { 'Slip rating': 'R10' } })]);
  const specs = rows.filter((r) => r.key.startsWith('spec:'));
  assert.deepEqual(specs.map((r) => r.label), ['Slip rating', 'Water absorption']);
  assert.ok(specs.every((r) => r.differs));
});

test('cart plan: available products go to the cart; no price and no stock are skipped with reasons', () => {
  const plan = planCartMoves([
    { id: 'a', name: 'A', variantId: 'va', availableUnits: 3 },
    { id: 'b', name: 'B', variantId: null, availableUnits: 0 },
    { id: 'c', name: 'C', variantId: 'vc', availableUnits: 0 },
  ]);
  assert.deepEqual(plan.toCart, [{ productId: 'a', variantId: 'va' }]);
  assert.deepEqual(plan.skipped.map((s) => s.reason), ['No price is set for this product.', 'Out of stock.']);
});

test('ids: only well-formed UUIDs are kept, duplicates removed, bulk limit enforced', () => {
  const good = '0A0B0C0D-0000-4000-8000-000000000001';
  const ids = cleanProductIds([good, good.toLowerCase(), 'not-an-id', '<script>', '']);
  assert.deepEqual(ids, [good.toLowerCase()]);
  const many = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  assert.equal(cleanProductIds(many).length, 50);
});

test('return path: stays inside the store, refuses other hosts, protocol-relative and header-injection paths', () => {
  assert.equal(safeReturnPath('kajaria', '/store/kajaria/wishlist'), '/store/kajaria/wishlist');
  assert.equal(safeReturnPath('kajaria', 'https://evil.example/x'), '/store/kajaria');
  assert.equal(safeReturnPath('kajaria', '//evil.example'), '/store/kajaria');
  assert.equal(safeReturnPath('kajaria', '/store/other/wishlist'), '/store/kajaria');
  assert.equal(safeReturnPath('kajaria', '/store/kajaria/x\r\nSet-Cookie: a=b'), '/store/kajaria');
  assert.equal(safeReturnPath('kajaria', null), '/store/kajaria');
});
