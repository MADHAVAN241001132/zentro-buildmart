import { PageHeader } from '@/components/owner/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FEATURE_KEYS } from '@/lib/validation/admin';
import { FeatureFlagToggle } from '@/components/admin/feature-flag-toggle';
import { StoreSelector } from '@/components/admin/store-selector';
import {
  ShoppingCart, CreditCard, Layers, Clipboard, Truck, Tag, Package,
  ShoppingBag, Camera, QrCode, Home, Upload, BarChart2,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type FeatureKey = (typeof FEATURE_KEYS)[number];

interface FeatureMeta {
  label: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  scope: 'guest' | 'owner' | 'both';
}

const FEATURE_META: Record<FeatureKey, FeatureMeta> = {
  online_payments: {
    label: 'Online Payments',
    description: 'Razorpay UPI, card and netbanking at checkout. Requires store settings to also enable online.',
    category: 'Payment',
    icon: <CreditCard className="h-4 w-4" />,
    scope: 'guest',
  },
  coupons: {
    label: 'Coupon Codes',
    description: 'Guests can apply discount coupon codes in the cart and checkout.',
    category: 'Payment',
    icon: <Tag className="h-4 w-4" />,
    scope: 'guest',
  },
  pos_billing: {
    label: 'POS Billing',
    description: 'Point-of-sale billing terminal for in-store cashiers.',
    category: 'Store Management',
    icon: <ShoppingCart className="h-4 w-4" />,
    scope: 'owner',
  },
  quotations: {
    label: 'Quotations',
    description: 'Create, share and PDF-export price quotations for customers.',
    category: 'Store Management',
    icon: <Clipboard className="h-4 w-4" />,
    scope: 'both',
  },
  credit_ledger: {
    label: 'Credit Ledger',
    description: 'Track customer credit accounts and outstanding balances.',
    category: 'Store Management',
    icon: <Layers className="h-4 w-4" />,
    scope: 'owner',
  },
  delivery: {
    label: 'Delivery Management',
    description: 'Create and track delivery orders with status updates.',
    category: 'Store Management',
    icon: <Truck className="h-4 w-4" />,
    scope: 'owner',
  },
  tile_batches: {
    label: 'Tile Batch Management',
    description: 'Track tile dye-lot batches and shade variations in inventory.',
    category: 'Store Management',
    icon: <Package className="h-4 w-4" />,
    scope: 'owner',
  },
  purchase_orders: {
    label: 'Purchase Orders',
    description: 'Manage supplier purchase orders and inbound stock.',
    category: 'Business Admin',
    icon: <ShoppingBag className="h-4 w-4" />,
    scope: 'owner',
  },
  bulk_imports: {
    label: 'Bulk Product Import',
    description: 'Import products and variants from CSV or Excel spreadsheets.',
    category: 'Business Admin',
    icon: <Upload className="h-4 w-4" />,
    scope: 'owner',
  },
  reports: {
    label: 'Reports & Exports',
    description: 'Revenue reports, GST summaries and product export downloads.',
    category: 'Business Admin',
    icon: <BarChart2 className="h-4 w-4" />,
    scope: 'owner',
  },
  room_visualiser: {
    label: 'Room Visualizer',
    description: 'Guests can upload room photos and place product overlays to preview.',
    category: 'Guest Shopping',
    icon: <Camera className="h-4 w-4" />,
    scope: 'guest',
  },
  house_project_planner: {
    label: 'House Project Planner',
    description: 'Guests can create multi-room construction projects with product lists.',
    category: 'Guest Shopping',
    icon: <Home className="h-4 w-4" />,
    scope: 'guest',
  },
  qr_scan_analytics: {
    label: 'QR Scan Analytics',
    description: 'Track and analyse product QR code scans by visitors.',
    category: 'Smart Planning',
    icon: <QrCode className="h-4 w-4" />,
    scope: 'owner',
  },
};

const CATEGORIES = ['Guest Shopping', 'Payment', 'Smart Planning', 'Store Management', 'Business Admin'];

const SCOPE_BADGE: Record<'guest' | 'owner' | 'both', { label: string; className: string }> = {
  guest: { label: 'Guest', className: 'bg-gold/15 text-burgundy-deep' },
  owner: { label: 'Owner', className: 'bg-burgundy/10 text-burgundy' },
  both: { label: 'Guest + Owner', className: 'bg-success/10 text-success' },
};

export default async function FeatureFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;

  const [{ data: stores }, { data: flags }] = await Promise.all([
    supabase.from('stores').select('id, name, slug').order('name'),
    supabase.from('feature_flags').select('store_id, feature_key, enabled'),
  ]);

  const storeList = (stores ?? []) as Array<{ id: string; name: string; slug: string }>;
  const zentroStore = storeList.find((s) => s.slug === 'zentro-buildmart-showroom') ?? storeList[0];
  const selectedStoreId = sp.store && storeList.some((s) => s.id === sp.store) ? sp.store : (zentroStore?.id ?? null);
  const selectedStore = storeList.find((s) => s.id === selectedStoreId) ?? null;

  const flagMap = new Map<string, boolean>();
  for (const f of flags ?? []) {
    flagMap.set(`${f.store_id as string}:${f.feature_key as string}`, Boolean(f.enabled));
  }

  const enabledCount = selectedStoreId
    ? FEATURE_KEYS.filter((k) => flagMap.get(`${selectedStoreId}:${k}`)).length
    : 0;
  const disabledCount = FEATURE_KEYS.length - enabledCount;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Platform"
        title="Feature Flags"
        description="Control which features are available per store. Toggles take effect immediately—disabled features are hidden from both owner dashboards and guest storefronts. Enabling a feature grants access only to stores that also have the feature assigned in their subscription plan."
      />

      {storeList.length === 0 ? (
        <p className="text-sm text-ink-muted">No stores have been onboarded yet.</p>
      ) : (
        <>
          {/* Store selector + counts */}
          <div className="flex flex-wrap items-center gap-3">
            <StoreSelector
              stores={storeList.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
              selectedStoreId={selectedStoreId}
            />
            {selectedStore ? (
              <span className="rounded-full bg-burgundy/10 px-3 py-1 text-xs font-semibold text-burgundy">
                Selected: {selectedStore.name} ({selectedStore.slug})
              </span>
            ) : null}
            <div className="flex gap-2 text-sm">
              <span className="rounded-full bg-success/10 px-3 py-1 font-semibold text-success">
                {enabledCount} ON
              </span>
              <span className="rounded-full bg-ink-muted/10 px-3 py-1 font-semibold text-ink-muted">
                {disabledCount} OFF
              </span>
            </div>
          </div>

          {/* Feature list by category */}
          {selectedStore && (
            <div className="grid gap-6">
              {CATEGORIES.map((category) => {
                const categoryKeys = FEATURE_KEYS.filter((k) => FEATURE_META[k].category === category);
                return (
                  <div key={category} className="rounded-card border border-line bg-card">
                    <div className="border-b border-line px-5 py-4">
                      <h2 className="font-display text-lg text-burgundy">{category}</h2>
                    </div>
                    <ul className="divide-y divide-line">
                      {categoryKeys.map((key) => {
                        const meta = FEATURE_META[key];
                        const isEnabled = flagMap.get(`${selectedStore.id as string}:${key}`) ?? false;
                        const scopeBadge = SCOPE_BADGE[meta.scope];
                        return (
                          <li key={key} className="flex items-center gap-4 px-5 py-4">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${isEnabled ? 'bg-burgundy/10 text-burgundy' : 'bg-ink-muted/10 text-ink-muted'}`}>
                              {meta.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-ink">{meta.label}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${scopeBadge.className}`}>
                                  {scopeBadge.label}
                                </span>
                              </div>
                              <p className="mt-0.5 text-sm text-ink-muted">{meta.description}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <FeatureFlagToggle
                                storeId={selectedStore.id as string}
                                featureKey={key}
                                enabled={isEnabled}
                                storeName={selectedStore.name as string}
                                featureLabel={meta.label}
                              />
                              <span className="text-xs font-semibold text-ink-muted">
                                {isEnabled ? 'ON' : 'OFF'}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
