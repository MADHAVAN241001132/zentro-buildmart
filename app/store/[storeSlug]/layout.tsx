import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/guest/site-header';
import { StoreFeatureSync } from '@/components/guest/store-feature-sync';
import { getCartView } from '@/lib/services/cart';
import { getStoreEnabledFeatures } from '@/lib/services/entitlements';
import { readGuestSession } from '@/lib/services/guest';
import { countComparison, countWishlist } from '@/lib/services/guest-lists';
import { getStoreBySlug } from '@/lib/services/storefront';
import { currentLocale } from '@/lib/i18n/server';

export default async function StoreLayout({ children, params }: { children: ReactNode; params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const [session, enabledFeatures, locale] = await Promise.all([
    readGuestSession(store.id, storeSlug),
    getStoreEnabledFeatures(store.id),
    currentLocale(),
  ]);
  const [cart, wishlistCount, compareCount] = await Promise.all([
    session ? getCartView(store.id, session.id) : Promise.resolve(null),
    session ? countWishlist(store.id, session.id) : Promise.resolve(0),
    session ? countComparison(store.id, session.id) : Promise.resolve(0),
  ]);

  return (
    <div className="min-h-screen overflow-x-clip bg-cream" style={{ ['--store-brand' as string]: store.brandColour }}>
      <StoreFeatureSync storeSlug={storeSlug} />
      <SiteHeader
        storeSlug={storeSlug}
        storeName={store.name}
        logoUrl={store.logoUrl}
        cartCount={cart?.itemCount ?? 0}
        wishlistCount={wishlistCount}
        compareCount={compareCount}
        locale={locale}
        showVisualizer={enabledFeatures.has('room_visualiser')}
        showProjects={enabledFeatures.has('house_project_planner')}
      />
      <main className="mx-auto w-full min-w-0 max-w-content px-4 pb-28 pt-6 sm:px-6 md:pb-16">{children}</main>
      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-content flex-col gap-6 px-4 py-8 text-sm text-ink-muted sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-display text-lg text-burgundy">{store.name}</p>
              {store.legalName && store.legalName !== store.name ? <p className="text-xs">{store.legalName}</p> : null}
              <p className="mt-1 text-xs">
                {[store.city, store.state].filter(Boolean).join(', ')}
                {store.phone ? ` · ${store.phone}` : ''}
              </p>
              {store.gstin ? <p className="text-xs">GSTIN {store.gstin}</p> : null}
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-gold">A Digital Showroom Powered by ZENTRO BuildMart</p>
              <p className="mt-0.5 text-xs text-ink-muted">A Product by ZENTRO Networks</p>
              <p className="mt-1 text-[11px] font-semibold tracking-widest text-burgundy">Connect. Create. Conquer.</p>
              <Link href="/" className="mt-2 inline-block text-xs font-medium text-burgundy hover:underline">
                About ZENTRO BuildMart Platform &rarr;
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
