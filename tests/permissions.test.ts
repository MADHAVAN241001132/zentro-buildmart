import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PERMISSION_KEYS,
  canManageStaff,
  changesOutsideAuthority,
  defaultPermissions,
  isPermissionKey,
  isStoreRole,
  permissionLabel,
} from '../lib/authz/permissions';

test('the catalogue has 18 unique keys that match migration 0036', () => {
  assert.equal(PERMISSION_KEYS.length, 18);
  assert.equal(new Set(PERMISSION_KEYS).size, 18);
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/0036_roles_permissions.sql'), 'utf8');
  const insertBlock = sql.slice(sql.indexOf('insert into store_permission_keys'), sql.indexOf('on conflict (key)'));
  const dbKeys = [...insertBlock.matchAll(/\('([a-z_]+)', '/g)].map((m) => m[1]).sort();
  assert.deepEqual(dbKeys, [...PERMISSION_KEYS].sort());
});

test('an owner holds every permission by default', () => {
  assert.deepEqual(defaultPermissions('owner'), [...PERMISSION_KEYS]);
});

test('manager defaults exclude staff and store administration', () => {
  const manager = defaultPermissions('manager');
  assert.ok(manager.includes('pos_billing'));
  assert.ok(manager.includes('refund_management'));
  assert.ok(!manager.includes('staff_management'));
  assert.ok(!manager.includes('store_settings'));
});

test('staff defaults are a subset of manager defaults and never include finance approval', () => {
  const staff = defaultPermissions('staff');
  const manager = new Set(defaultPermissions('manager'));
  assert.ok(staff.every((k) => manager.has(k)));
  assert.ok(!staff.includes('cash_confirmation'));
  assert.ok(!staff.includes('refund_management'));
});

test('a change outside the holder authority is detected in both directions', () => {
  const held = ['pos_billing', 'staff_management'];
  assert.deepEqual(changesOutsideAuthority(held, [], ['refund_management']), ['refund_management']);
  assert.deepEqual(changesOutsideAuthority(held, ['store_settings'], []), ['store_settings']);
  assert.deepEqual(changesOutsideAuthority(held, ['pos_billing'], ['pos_billing']), []);
});

test('only staff management opens staff administration', () => {
  assert.equal(canManageStaff(['staff_management']), true);
  assert.equal(canManageStaff(defaultPermissions('manager')), false);
});

test('key and role guards and labels', () => {
  assert.equal(isPermissionKey('pos_billing'), true);
  assert.equal(isPermissionKey('pos_billing; drop'), false);
  assert.equal(isStoreRole('manager'), true);
  assert.equal(isStoreRole('admin'), false);
  assert.equal(permissionLabel('qr_analytics'), 'QR analytics');
});
