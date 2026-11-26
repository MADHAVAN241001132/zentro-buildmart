/**
 * Store roles and permission keys. Pure functions, shared by the server and the Staff page.
 * The database (migration 0036) is the authority: it enforces every rule again on each write.
 * The list here must match store_permission_keys; tests/permissions.test.ts checks that.
 */
export const STORE_ROLES = ['owner', 'manager', 'staff'] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

export const PERMISSIONS = [
  { key: 'product_management', label: 'Product management', area: 'Catalogue' },
  { key: 'category_brand_management', label: 'Category and brand management', area: 'Catalogue' },
  { key: 'inventory_management', label: 'Inventory management', area: 'Stock' },
  { key: 'tile_batch_management', label: 'Tile batch management', area: 'Stock' },
  { key: 'pos_billing', label: 'POS billing', area: 'Sales' },
  { key: 'order_management', label: 'Order management', area: 'Sales' },
  { key: 'cash_confirmation', label: 'Cash confirmation', area: 'Finance' },
  { key: 'refund_management', label: 'Refund management', area: 'Finance' },
  { key: 'supplier_management', label: 'Supplier management', area: 'Purchasing' },
  { key: 'purchasing', label: 'Purchasing', area: 'Purchasing' },
  { key: 'customer_management', label: 'Customer management', area: 'Customers' },
  { key: 'credit_management', label: 'Credit management', area: 'Customers' },
  { key: 'quotations', label: 'Quotations', area: 'Sales' },
  { key: 'reports_exports', label: 'Reports and exports', area: 'Reports' },
  { key: 'qr_management', label: 'QR management', area: 'Marketing' },
  { key: 'qr_analytics', label: 'QR analytics', area: 'Marketing' },
  { key: 'store_settings', label: 'Store settings', area: 'Administration' },
  { key: 'staff_management', label: 'Staff management', area: 'Administration' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

const MANAGER_DEFAULTS: readonly PermissionKey[] = [
  'product_management', 'category_brand_management', 'inventory_management', 'tile_batch_management',
  'pos_billing', 'order_management', 'cash_confirmation', 'refund_management', 'supplier_management',
  'purchasing', 'customer_management', 'credit_management', 'quotations', 'reports_exports',
  'qr_management', 'qr_analytics',
];

const STAFF_DEFAULTS: readonly PermissionKey[] = [
  'pos_billing', 'order_management', 'customer_management', 'inventory_management', 'tile_batch_management',
];

/** Owners hold every permission implicitly. Managers and staff start from these defaults and are then edited. */
export function defaultPermissions(role: StoreRole): PermissionKey[] {
  if (role === 'owner') return [...PERMISSION_KEYS];
  return [...(role === 'manager' ? MANAGER_DEFAULTS : STAFF_DEFAULTS)];
}

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export function isStoreRole(value: string): value is StoreRole {
  return (STORE_ROLES as readonly string[]).includes(value);
}

export function permissionLabel(key: string): string {
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}

/** Permissions that would be added or removed by a change, and that the caller does not hold. */
export function changesOutsideAuthority(held: readonly string[], before: readonly string[], after: readonly string[]): string[] {
  const heldSet = new Set(held);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const changed = new Set<string>();
  for (const k of afterSet) if (!beforeSet.has(k)) changed.add(k);
  for (const k of beforeSet) if (!afterSet.has(k)) changed.add(k);
  return [...changed].filter((k) => !heldSet.has(k));
}

/** Staff management is needed to open the Staff page and to change anyone's access. */
export function canManageStaff(held: readonly string[]): boolean {
  return held.includes('staff_management');
}
