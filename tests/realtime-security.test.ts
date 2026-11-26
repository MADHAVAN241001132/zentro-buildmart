import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const CLIENT_LIVE_FILES = [
  'components/realtime/use-status-poll.ts',
  'components/realtime/status-indicator.tsx',
  'components/guest/order-status-poller.tsx',
  'components/owner/owner-status-bar.tsx',
  'lib/realtime/poll-policy.ts',
];

test('no client component opens a Realtime channel or database subscription', () => {
  for (const file of CLIENT_LIVE_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /\.channel\(|\.subscribe\(|postgres_changes|createClient/, `${file} opens a subscription`);
    assert.doesNotMatch(source, /SERVICE_ROLE|service_role|NEXT_PUBLIC_SUPABASE_SERVICE/, `${file} references a service key`);
  }
});

test('status snapshot never selects customer, payment-identifier or address fields', () => {
  const source = read('lib/services/status-snapshot.ts');
  for (const forbidden of ['customer_name', 'customer_mobile', 'customer_email', 'razorpay', 'provider_payment_id', 'provider_order_id', 'address', 'amount_paise']) {
    assert.doesNotMatch(source, new RegExp(forbidden), `snapshot exposes ${forbidden}`);
  }
});

test('guest snapshot is limited to the guest session in every query', () => {
  const source = read('lib/services/status-snapshot.ts');
  const guestPart = source.slice(source.indexOf('export async function guestStatusSnapshot'), source.indexOf('async function countWhere'));
  const scopedQueries = guestPart.match(/guest_session_id', sessionId\)/g) ?? [];
  assert.equal(scopedQueries.length, 3, 'orders, quotations and refund requests are each scoped to the session');
  assert.match(guestPart, /eq\('store_id', storeId\)/);
});

test('owner counts are limited to the owner store', () => {
  const source = read('lib/services/status-snapshot.ts');
  const ownerPart = source.slice(source.indexOf('export async function ownerStatusCounts'));
  assert.match(ownerPart, /eq\('store_id', storeId\)/);
  assert.doesNotMatch(ownerPart, /\.select\('\*'\)/);
});

test('guest status route uses the guest session cookie and returns nothing without a session', () => {
  const source = read('app/api/store/[storeSlug]/status/route.ts');
  assert.match(source, /readGuestSession\(store\.id, storeSlug\)/);
  assert.match(source, /session: false, orders: \[\]/);
  assert.match(source, /private, no-store/);
});

test('owner status route takes the store from the owner membership, not the request', () => {
  const source = read('app/api/owner/status/route.ts');
  assert.match(source, /getOwnerContext\(\)/);
  assert.match(source, /ownerStatusCounts\(context\.storeId, held\)/);
  assert.match(source, /loadMyStorePermissions\(context\.storeId\)/);
  assert.doesNotMatch(source, /searchParams|params/);
  assert.match(source, /private, no-store/);
});

test('the poller refreshes the page from verified records and does not trust client payment state', () => {
  const source = read('components/guest/order-status-poller.tsx');
  assert.match(source, /router\.refresh\(\)/);
  assert.doesNotMatch(source, /paymentStatus|payment_status|PAID/);
});
