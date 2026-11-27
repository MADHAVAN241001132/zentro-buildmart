import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/owner/login/actions';
import { getOwnerContext, loadMyStorePermissions } from '@/lib/services/owner';
import { getStoreEnabledFeatures, type FeatureKey } from '@/lib/services/entitlements';
import type { PermissionKey } from '@/lib/authz/permissions';
import { OwnerStatusBar } from '@/components/owner/owner-status-bar';

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
  const [permissionsList, enabledFeatures] = await Promise.all([
    loadMyStorePermissions(context.storeId),
    getStoreEnabledFeatures(context.storeId),
  ]);
  const held = new Set(permissionsList);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    heading: group.heading,
    items: group.items.filter(
      (item) => (item.permission === null || held.has(item.permission)) && (!item.feature || enabledFeatures.has(item.feature)),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen overflow-x-clip bg-cream lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-line bg-gradient-to-b from-burgundy-deep to-burgundy-deep/95 text-cream lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0">
        <div className="flex items-center justify-between gap-3 border-b border-cream/10 p-5">
          <div className="min-w-0">
            <p className="font-display text-lg text-gold">ZENTRO</p>
            <p className="truncate text-sm text-cream/80">{context.storeName}</p>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="rounded-control px-2 py-1 text-xs uppercase tracking-wide text-cream/70 hover:bg-cream/10 hover:text-cream">
              Sign out
            </button>
          </form>
        </div>
        <nav aria-label="Owner" className="flex gap-4 overflow-x-auto px-3 py-3 lg:flex-col lg:gap-5 lg:py-5">
          {visibleGroups.map((group) => (
            <div key={group.heading} className="flex shrink-0 gap-1 lg:flex-col">
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80 lg:block">{group.heading}</p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-control px-3 py-2 text-sm text-cream/90 transition hover:bg-cream/10 hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
        <OwnerStatusBar />
        {children}
      </main>
    </div>
  );
}
