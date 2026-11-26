import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/guest/site-header';
import { getCartView } from '@/lib/services/cart';
import { readGuestSession } from '@/lib/services/guest';
import { countComparison, countWishlist } from '@/lib/services/guest-lists';
import { getStoreBySlug } from '@/lib/services/storefront';
import { currentLocale } from '@/lib/i18n/server';

export default async function StoreLayout({ children, params }: { children: ReactNode; params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const session = await readGuestSession(store.id, storeSlug);
  const cart = session ? await getCartView(store.id, session.id) : null;
  const wishlistCount = session ? await countWishlist(store.id, session.id) : 0;
  const compareCount = session ? await countComparison(store.id, session.id) : 0;
  const locale = await currentLocale();

  return (
    <div className="min-h-screen bg-cream" style={{ ['--store-brand' as string]: store.brandColour }}>
      <SiteHeader storeSlug={storeSlug} storeName={store.name} cartCount={cart?.itemCount ?? 0} wishlistCount={wishlistCount} compareCount={compareCount} locale={locale} />
      <main className="mx-auto max-w-content px-4 pb-28 pt-6 sm:px-6 md:pb-16">{children}</main>
      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-content flex-col gap-2 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:justify-between sm:px-6">
          <p className="font-display text-base text-burgundy">{store.name}</p>
          {store.legalName && store.legalName !== store.name ? <p>{store.legalName}</p> : null}
          <p>
            {[store.city, store.state].filter(Boolean).join(', ')}
            {store.phone ? ` · ${store.phone}` : ''}
          </p>
          {store.gstin ? <p>GSTIN {store.gstin}</p> : null}
        </div>
      </footer>
    </div>
  );
}
