import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTiles, toFeet, TileInputError } from '../lib/calculator/tiles';

test('converts metric units to feet', () => {
  assert.ok(Math.abs(toFeet(1, 'm') - 3.28084) < 1e-9);
  assert.ok(Math.abs(toFeet(100, 'cm') - 3.28084) < 1e-6);
  assert.ok(Math.abs(toFeet(1000, 'mm') - 3.28084) < 1e-6);
  assert.equal(toFeet(12, 'ft'), 12);
});

test('rounds boxes up and reports leftover coverage', () => {
  // 10 ft x 10 ft = 100 sq ft, 10% wastage = 110 sq ft, 12 sq ft per box -> 9.17 -> 10 boxes
  const result = calculateTiles({ length: 10, width: 10, unit: 'ft', coverageSqftPerBox: 12, wastagePercent: 10 });
  assert.equal(result.areaSqft, 100);
  assert.equal(result.areaWithWastageSqft, 110);
  assert.equal(result.boxes, 10);
  assert.equal(result.purchasedSqft, 120);
  assert.equal(result.leftoverSqft, 20);
  assert.equal(result.estimatedCostPaise, null);
});

test('estimates cost from price per box', () => {
  const result = calculateTiles({
    length: 3,
    width: 2,
    unit: 'm',
    coverageSqftPerBox: 10,
    wastagePercent: 0,
    pricePerBoxPaise: 45000,
  });
  // 3 m x 2 m = 9.84252 ft x 6.56168 ft ~ 64.5834 sq ft -> 65 / 10 = 7 boxes
  assert.equal(result.boxes, 7);
  assert.equal(result.estimatedCostPaise, 315000);
});

test('rejects invalid input', () => {
  assert.throws(() => calculateTiles({ length: 0, width: 5, unit: 'ft', coverageSqftPerBox: 10 }), TileInputError);
  assert.throws(() => calculateTiles({ length: 5, width: 5, unit: 'ft', coverageSqftPerBox: 0 }), TileInputError);
  assert.throws(
    () => calculateTiles({ length: 5, width: 5, unit: 'ft', coverageSqftPerBox: 10, wastagePercent: 150 }),
    TileInputError,
  );
});
