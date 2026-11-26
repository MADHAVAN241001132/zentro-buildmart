import Link from 'next/link';
import { Suspense } from 'react';
import { ClipboardList, Heart, Home, LayoutGrid, Ruler, ShoppingBag } from 'lucide-react';
import { LanguageSwitcher } from '@/components/guest/language-switcher';
import { translate } from '@/lib/i18n/translate';
import type { Locale } from '@/lib/i18n/locales';

export function SiteHeader({
  storeSlug,
  storeName,
  cartCount,
  wishlistCount = 0,
  compareCount = 0,
  locale = 'en',
}: {
  storeSlug: string;
  storeName: string;
  cartCount: number;
  wishlistCount?: number;
  compareCount?: number;
  locale?: Locale;
}) {
  const base = `/store/${storeSlug}`;
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const counted = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={base} className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-burgundy font-display text-lg text-gold">Z</span>
          <span className="truncate font-display text-lg text-burgundy">{storeName}</span>
        </Link>
        <nav aria-label={t('nav.home')} className="hidden items-center gap-6 text-sm font-medium text-ink md:flex">
          <Link href={`${base}/category/all`} className="hover:text-burgundy">{t('nav.products')}</Link>
          <Link href={`${base}/tools/tile-calculator`} className="hover:text-burgundy">{t('nav.tileCalculator')}</Link>
          <Link href={`${base}/compare`} className="hover:text-burgundy">{counted(t('nav.compare'), compareCount)}</Link>
          <Link href={`${base}/visualizer`} className="hover:text-burgundy">{t('nav.visualizer')}</Link>
          <Link href={`${base}/projects`} className="hover:text-burgundy">{t('nav.projects')}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <LanguageSwitcher current={locale} />
          </Suspense>
          <Link href={`${base}/wishlist`} aria-label={counted(t('nav.wishlist'), wishlistCount)} className="relative rounded-control p-2 text-ink hover:bg-card">
            <Heart className="h-5 w-5" aria-hidden />
            {wishlistCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-burgundy px-1 text-[11px] font-semibold text-cream">
                {wishlistCount}
              </span>
            ) : null}
          </Link>
          <Link href={`${base}/cart`} aria-label={counted(t('nav.cart'), cartCount)} className="relative rounded-control p-2 text-ink hover:bg-card">
            <ShoppingBag className="h-5 w-5" aria-hidden />
            {cartCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-burgundy px-1 text-[11px] font-semibold text-cream">
                {cartCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
      {/* Mobile bottom navigation: thumb-reachable primary destinations. Hidden from md upward. */}
      <nav
        aria-label={t('nav.open')}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] text-[11px] font-medium text-ink-muted backdrop-blur md:hidden"
      >
        <Link href={base} className="flex flex-col items-center gap-1 py-2.5 hover:text-burgundy">
          <Home className="h-5 w-5" aria-hidden />
          <span>{t('nav.home')}</span>
        </Link>
        <Link href={`${base}/category/all`} className="flex flex-col items-center gap-1 py-2.5 hover:text-burgundy">
          <LayoutGrid className="h-5 w-5" aria-hidden />
          <span>{t('nav.products')}</span>
        </Link>
        <Link href={`${base}/projects`} className="flex flex-col items-center gap-1 py-2.5 hover:text-burgundy">
          <Ruler className="h-5 w-5" aria-hidden />
          <span>{t('nav.projects')}</span>
        </Link>
        <Link href={`${base}/cart`} aria-label={counted(t('nav.cart'), cartCount)} className="relative flex flex-col items-center gap-1 py-2.5 hover:text-burgundy">
          <ShoppingBag className="h-5 w-5" aria-hidden />
          {cartCount > 0 ? (
            <span className="absolute right-[28%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-cream">
              {cartCount}
            </span>
          ) : null}
          <span>{t('nav.cart')}</span>
        </Link>
        <Link href={`${base}/orders`} className="flex flex-col items-center gap-1 py-2.5 hover:text-burgundy">
          <ClipboardList className="h-5 w-5" aria-hidden />
          <span>{t('nav.orders')}</span>
        </Link>
      </nav>
    </header>
  );
}
