import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appUrl } from '@/lib/env';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export default async function QrPage() {
  const owner = await requireOwnerPermission('qr_management');
  const supabase = await createSupabaseServerClient();
  const [{ data: categories }, { data: products }, showAnalytics] = await Promise.all([
    supabase.from('categories').select('slug, name').eq('store_id', owner.storeId).eq('is_active', true).order('sort_order'),
    supabase.from('products').select('slug, name').eq('store_id', owner.storeId).eq('status', 'active').eq('visibility', 'public').order('name').limit(60),
    isFeatureEnabled(owner.storeId, 'qr_scan_analytics'),
  ]);
  const base = `/api/store/${owner.storeSlug}/qr`;
  const showroomUrl = `${appUrl().replace(/\/$/, '')}/store/${owner.storeSlug}`;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Showroom"
        title="QR codes"
        description="Print the showroom code on posters at the entrance and counter. Category and product codes open that page directly. Images are generated on demand and are tracked from the moment you download them."
        actions={<PrintButton />}
      />

      <section className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-[220px_1fr] md:items-center" aria-labelledby="main-qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${base}?target=showroom&size=600`} alt={`QR code for ${owner.storeName}`} width={220} height={220} className="h-auto w-[220px] rounded-control border border-line bg-white p-2" />
        <div className="grid gap-3">
          <h2 id="main-qr" className="font-display text-2xl text-burgundy">Main showroom code</h2>
          <p className="text-sm text-ink-muted break-all">Opens {showroomUrl} through a tracked entry link.</p>
          <a href={`${base}?target=showroom&size=1200&download=1`} className="w-fit rounded-control bg-burgundy px-4 py-2 text-sm font-semibold text-cream">Download PNG (1200 px)</a>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="cat-qr">
        <h2 id="cat-qr" className="font-display text-2xl text-burgundy">Category codes</h2>
        {(categories ?? []).length === 0 ? (
          <EmptyState title="No active categories" body="Create categories in the Catalogue to generate category codes." />
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(categories ?? []).map((c) => (
              <li key={c.slug as string} className="grid gap-2 rounded-card border border-line bg-card p-4 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}?target=category&slug=${c.slug as string}&size=300`} alt={`QR code for ${c.name as string}`} width={150} height={150} className="mx-auto h-auto w-[150px]" />
                <p className="text-sm font-medium">{c.name as string}</p>
                <a href={`${base}?target=category&slug=${c.slug as string}&size=1200&download=1`} className="text-xs font-semibold text-burgundy">Download</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="prod-qr">
        <h2 id="prod-qr" className="font-display text-2xl text-burgundy">Product codes</h2>
        <ul className="grid gap-2 text-sm">
          {(products ?? []).map((p) => (
            <li key={p.slug as string} className="flex items-center justify-between rounded-control border border-line bg-card px-4 py-2">
              <span>{p.name as string}</span>
              <a href={`${base}?target=product&slug=${p.slug as string}&size=1200&download=1`} className="font-semibold text-burgundy">Download PNG</a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">Shows the first 60 active public products. Use the storefront URL pattern for others.</p>
      </section>

      {showAnalytics ? (
        <section className="grid gap-2 rounded-card border border-line bg-card p-6 text-sm">
          <h2 className="font-display text-xl text-burgundy">Scan analytics</h2>
          <p className="text-ink-muted">Tracked entries and attributed orders are reported on the QR analytics page. Codes printed before tracking was introduced still work, but their visits are not counted.</p>
          <a href="/owner/qr/analytics" className="w-fit text-burgundy underline">Open QR analytics</a>
        </section>
      ) : null}
    </div>
  );
}
