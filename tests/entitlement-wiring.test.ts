import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Structural checks: every premium entry point must call the central entitlement service.
// Removing a gate fails these tests. They do not replace the SQL suite or browser checks.
const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const count = (source: string, needle: string) => source.split(needle).length - 1;

const GATES: Array<{ file: string; needle: string; min: number }> = [
  { file: 'app/owner/(portal)/pos/actions.ts', needle: "checkFeature(owner.storeId, 'pos_billing')", min: 3 },
  { file: 'app/owner/(portal)/pos/actions.ts', needle: "checkFeature(scanOwner.storeId, 'pos_billing')", min: 1 },
  { file: 'app/store/[storeSlug]/visualizer/actions.ts', needle: "checkFeature(store.id, 'room_visualiser')", min: 2 },
  { file: 'app/owner/(portal)/products/import/actions.ts', needle: "checkFeature(owner.storeId, 'bulk_imports')", min: 2 },
  { file: 'app/owner/(portal)/purchasing/actions.ts', needle: "checkFeature(owner.storeId, 'purchase_orders')", min: 2 },
  { file: 'app/owner/(portal)/suppliers/actions.ts', needle: "checkFeature(owner.storeId, 'purchase_orders')", min: 1 },
  { file: 'app/owner/(portal)/inventory/batches/actions.ts', needle: "checkFeature(owner.storeId, 'tile_batches')", min: 1 },
  { file: 'lib/services/house-projects.ts', needle: "assertFeature(storeId, 'house_project_planner')", min: 1 },
  { file: 'lib/services/quotations.ts', needle: "assertFeature(storeId, 'quotations')", min: 2 },
];

for (const gate of GATES) {
  test(`${gate.file} enforces ${gate.needle}`, () => {
    assert.ok(count(read(gate.file), gate.needle) >= gate.min, `${gate.needle} missing from ${gate.file}`);
  });
}

test('no type cast is used to hide a gate result in the tile batch actions', () => {
  assert.equal(count(read('app/owner/(portal)/inventory/batches/actions.ts'), 'as never'), 0);
});

test('renewal goes through the database function that keeps history', () => {
  const source = read('app/admin/(portal)/subscriptions/actions.ts');
  assert.ok(source.includes("rpc('renew_subscription'"));
  assert.equal(source.includes("update({ period_end"), false, 'renewal must not overwrite the period in place');
});

test('plan creation writes explicit unlimited flags and user limits', () => {
  const source = read('app/admin/(portal)/subscriptions/actions.ts');
  assert.ok(source.includes('users_unlimited: parsed.data.usersUnlimited'));
  assert.ok(source.includes('products_unlimited: parsed.data.productsUnlimited'));
});

test('the owner staff gate on owner creation still uses the shared service', () => {
  assert.ok(read('app/admin/(portal)/owners/actions.ts').includes('createOwnerAccount'));
});

test('cancellation and refund paths are not gated', () => {
  const pos = read('app/owner/(portal)/pos/actions.ts');
  const cancelStart = pos.indexOf('export async function cancelBillAction');
  const placeStart = pos.indexOf('export async function placeBillAction');
  const cancelBody = pos.slice(cancelStart, placeStart);
  assert.equal(cancelBody.includes('checkFeature'), false, 'cancelling a held bill must stay available');
});

test('guest orders are refused unless the store is active or on an allowance', () => {
  assert.ok(read('lib/services/checkout.ts').includes('checkCommerce(store.id)'));
});

test('POS placement and owner quotation save check commerce state', () => {
  assert.ok(read('app/owner/(portal)/pos/actions.ts').includes("checkCommerce(owner.storeId)"));
  assert.ok(read('lib/services/quotations.ts').includes('assertSubscriptionActive(storeId)'));
});

test('allowance administration goes through the database functions, which check the administrator', () => {
  const source = read('app/admin/(portal)/subscriptions/actions.ts');
  assert.ok(source.includes("rpc('grant_migration_allowance'"));
  assert.ok(source.includes("rpc('revoke_migration_allowance'"));
  assert.ok(source.includes('requireAdmin()'));
});

test('activation is guarded in the database, so no Admin route can bypass it', () => {
  const migration = read('supabase/migrations/0031_legacy_store_policy.sql');
  assert.ok(migration.includes('stores_activation_guard'));
  assert.ok(migration.includes('enforce_activation_subscription'));
});
