import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/owner/login/actions';
import { getOwnerContext, loadMyStorePermissions } from '@/lib/services/owner';
import { getStoreEnabledFeatures, type FeatureKey } from '@/lib/services/entitlements';
import { loadCurrentUserProfile } from '@/lib/services/profile';
import type { PermissionKey } from '@/lib/authz/permissions';
import { OwnerStatusBar } from '@/components/owner/owner-status-bar';
import { PortalShell } from '@/components/portal/portal-shell';

type NavItem = { href: string; label: string; permission: PermissionKey | null; feature?: FeatureKey };
type NavGroup = { heading: string; items: NavItem[] };

// Grouping only changes presentation. Hrefs and permission keys are unchanged; items the owner
// lacks permission for are removed exactly as before.
const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [{ href: '/owner', label: 'Dashboard', permission: null }],
  },
  {
    heading: 'Sales & cash',
    items: [
      { href: '/owner/cash', label: 'Cash payments', permission: 'cash_confirmation' },
      { href: '/owner/cash/day', label: 'Day close', permission: 'cash_confirmation' },
      { href: '/owner/pos', label: 'Point of sale', permission: 'pos_billing', feature: 'pos_billing' },
      { href: '/owner/orders', label: 'Orders', permission: 'order_management' },
      { href: '/owner/deliveries', label: 'Deliveries', permission: 'order_management', feature: 'delivery' },
      { href: '/owner/quotations', label: 'Quotations', permission: 'quotations', feature: 'quotations' },
      { href: '/owner/refund-requests', label: 'Refund requests', permission: 'refund_management' },
      { href: '/owner/payments', label: 'Payments', permission: 'refund_management' },
    ],
  },
  {
    heading: 'Catalogue & stock',
    items: [
      { href: '/owner/products', label: 'Products', permission: 'product_management' },
      { href: '/owner/products/import', label: 'Import / Export', permission: 'product_management', feature: 'bulk_imports' },
      { href: '/owner/categories', label: 'Categories & brands', permission: 'category_brand_management' },
      { href: '/owner/inventory', label: 'Inventory', permission: 'inventory_management' },
      { href: '/owner/inventory/batches', label: 'Tile batches', permission: 'tile_batch_management', feature: 'tile_batches' },
    ],
  },
  {
    heading: 'Partners',
    items: [
      { href: '/owner/suppliers', label: 'Suppliers', permission: 'supplier_management', feature: 'purchase_orders' },
      { href: '/owner/purchasing', label: 'Purchase orders', permission: 'purchasing', feature: 'purchase_orders' },
      { href: '/owner/customers', label: 'Customers & credit', permission: 'customer_management', feature: 'credit_ledger' },
    ],
  },
  {
    heading: 'Store',
    items: [
      { href: '/owner/reports', label: 'Reports', permission: 'reports_exports', feature: 'reports' },
      { href: '/owner/coupons', label: 'Coupons', permission: 'store_settings', feature: 'coupons' },
      { href: '/owner/qr', label: 'QR codes', permission: 'qr_management' },
      { href: '/owner/staff', label: 'Staff', permission: 'staff_management' },
      { href: '/owner/settings', label: 'Settings', permission: 'store_settings' },
    ],
  },
];

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const context = await getOwnerContext();
  if (!context) redirect('/owner/login');
  const [permissionsList, enabledFeatures, profile] = await Promise.all([
    loadMyStorePermissions(context.storeId),
    getStoreEnabledFeatures(context.storeId),
    loadCurrentUserProfile(),
  ]);
  const held = new Set(permissionsList);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    heading: group.heading,
    items: group.items
      .filter((item) => (item.permission === null || held.has(item.permission)) && (!item.feature || enabledFeatures.has(item.feature)))
      .map((item) => ({ href: item.href, label: item.label })),
  })).filter((group) => group.items.length > 0);

  return (
    <PortalShell
      portalTitle="ZENTRO"
      portalSubtitle={context.storeName}
      navGroups={visibleGroups}
      userName={profile?.fullName || context.storeName}
      userEmail={context.email ?? profile?.email ?? ''}
      avatarUrl={profile?.avatarUrl ?? null}
      profileHref="/owner/profile"
      settingsHref={held.has('store_settings') ? '/owner/settings' : null}
      signOutAction={signOutAction}
    >
      <div className="mb-4">
        <OwnerStatusBar />
      </div>
      {children}
    </PortalShell>
  );
}
