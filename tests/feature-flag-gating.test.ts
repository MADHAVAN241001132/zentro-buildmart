import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_KEYS } from '@/lib/validation/admin';
import { featureDecision } from '@/lib/entitlements/rules';

const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

test('featureDecision enforces ON/OFF and assignment matrix for every FEATURE_KEY', () => {
  for (const key of FEATURE_KEYS) {
    // Flag ON + Assigned (active subscription, plan allows) -> visible
    assert.equal(featureDecision('active', true, {}, key), true, `${key} should be enabled when ON + active + assigned`);
    // Flag OFF + Assigned -> hidden
    assert.equal(featureDecision('active', false, {}, key), false, `${key} should be hidden when OFF even if assigned`);
    // Flag ON + Not assigned (plan disables or store unsubscribed/expired) -> hidden
    assert.equal(featureDecision('active', true, { [key]: false }, key), false, `${key} should be hidden when plan excludes it`);
    assert.equal(featureDecision('unsubscribed', true, {}, key), false, `${key} should be hidden when unsubscribed`);
    assert.equal(featureDecision('expired', true, {}, key), false, `${key} should be hidden when expired`);
    // Flag missing -> hidden for active stores
    assert.equal(featureDecision('active', undefined, {}, key), false, `${key} should be hidden when flag row is missing`);
    // Flag OFF + Not assigned -> hidden
    assert.equal(featureDecision('active', false, { [key]: false }, key), false, `${key} should be hidden when OFF + unassigned`);
  }
});

test('Owner sidebar and dashboard filter items by getStoreEnabledFeatures', () => {
  const layout = read('app/owner/(portal)/layout.tsx');
  assert.ok(layout.includes('getStoreEnabledFeatures(context.storeId)'));
  for (const key of ['pos_billing', 'delivery', 'quotations', 'bulk_imports', 'tile_batches', 'purchase_orders', 'reports', 'coupons', 'credit_ledger']) {
    assert.ok(layout.includes(`'${key}'`), `Owner layout should gate ${key}`);
  }

  const dashboard = read('app/owner/(portal)/page.tsx');
  assert.ok(dashboard.includes('getStoreEnabledFeatures(owner.storeId)'));
  assert.ok(dashboard.includes("enabledFeatures.has('reports')"));
});

test('Owner feature routes enforce requireOwnerFeature in their layouts', () => {
  const gatedLayouts: Array<[string, string]> = [
    ['app/owner/(portal)/pos/layout.tsx', 'pos_billing'],
    ['app/owner/(portal)/quotations/layout.tsx', 'quotations'],
    ['app/owner/(portal)/deliveries/layout.tsx', 'delivery'],
    ['app/owner/(portal)/coupons/layout.tsx', 'coupons'],
    ['app/owner/(portal)/inventory/batches/layout.tsx', 'tile_batches'],
    ['app/owner/(portal)/suppliers/layout.tsx', 'purchase_orders'],
    ['app/owner/(portal)/purchasing/layout.tsx', 'purchase_orders'],
    ['app/owner/(portal)/products/import/layout.tsx', 'bulk_imports'],
    ['app/owner/(portal)/reports/layout.tsx', 'reports'],
    ['app/owner/(portal)/qr/analytics/layout.tsx', 'qr_scan_analytics'],
    ['app/owner/(portal)/customers/layout.tsx', 'credit_ledger'],
  ];

  for (const [file, key] of gatedLayouts) {
    assert.ok(existsSync(join(ROOT, file)), `Missing gated layout ${file}`);
    const source = read(file);
    assert.ok(source.includes(`requireOwnerFeature('${key}'`), `${file} must call requireOwnerFeature('${key}')`);
  }
});

test('Guest storefront routes and components enforce feature flags', () => {
  const storeLayout = read('app/store/[storeSlug]/layout.tsx');
  assert.ok(storeLayout.includes('getStoreEnabledFeatures(store.id)'));
  assert.ok(storeLayout.includes('StoreFeatureSync'));

  assert.ok(read('app/store/[storeSlug]/checkout/page.tsx').includes("isFeatureEnabled(store.id, 'online_payments')"));
  assert.ok(read('lib/services/checkout.ts').includes("isFeatureEnabled(store.id, 'online_payments')"));
  assert.ok(read('app/store/[storeSlug]/cart/page.tsx').includes("isFeatureEnabled(store.id, 'coupons')"));
  assert.ok(read('app/store/[storeSlug]/actions.ts').includes("isFeatureEnabled(store.id, 'coupons')"));
  assert.ok(read('app/store/[storeSlug]/product/[productSlug]/page.tsx').includes("isFeatureEnabled(store.id, 'quotations')"));
  assert.ok(read('app/store/[storeSlug]/visualizer/page.tsx').includes("isFeatureEnabled(store.id, 'room_visualiser')"));
  assert.ok(read('app/store/[storeSlug]/visualizer/upload/route.ts').includes("isFeatureEnabled(store.id, 'room_visualiser')"));
  assert.ok(read('app/store/[storeSlug]/projects/layout.tsx').includes("isFeatureEnabled(store.id, 'house_project_planner')"));
  assert.ok(read('app/store/[storeSlug]/quotes/layout.tsx').includes("isFeatureEnabled(store.id, 'quotations')"));
});

test('isFeatureEnabled delegates directly to getStoreEnabledFeatures as single authoritative resolver', () => {
  const entitlements = read('lib/services/entitlements.ts');
  assert.ok(entitlements.includes('const enabledFeatures = await getStoreEnabledFeatures(storeId);'));
  assert.ok(entitlements.includes('return enabledFeatures.has(key);'));
});

test('Payment retry and direct checkout endpoints enforce online_payments feature check', () => {
  const checkoutService = read('lib/services/checkout.ts');
  assert.ok(checkoutService.includes("isFeatureEnabled(store.id, 'online_payments')"), 'placeOrder must gate online payment');
  assert.ok(checkoutService.includes("isFeatureEnabled(storeId, 'online_payments')"), 'retryOnlinePayment must gate online payment');

  const orderPage = read('app/store/[storeSlug]/orders/[orderNumber]/page.tsx');
  assert.ok(orderPage.includes("isFeatureEnabled(store.id, 'online_payments')"), 'Order page must check online_payments feature');
  assert.ok(orderPage.includes('state.canPay && onlineEnabled'), 'Payment buttons must be gated by onlineEnabled');
  assert.ok(orderPage.includes('state.canRetry && onlineEnabled'), 'Retry form must be gated by onlineEnabled');
});

test('featureDecision fails closed for missing flags across ALL store states', () => {
  for (const state of ['active', 'setup', 'allowance', 'unsubscribed', 'expired', 'upcoming'] as const) {
    for (const key of FEATURE_KEYS) {
      assert.equal(
        featureDecision(state, undefined, {}, key),
        false,
        `Missing flag must evaluate to false for state ${state} and key ${key}`
      );
      assert.equal(
        featureDecision(state, false, {}, key),
        false,
        `Explicit false flag must evaluate to false for state ${state} and key ${key}`
      );
    }
  }
});

