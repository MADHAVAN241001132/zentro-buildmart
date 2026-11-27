import Link from 'next/link';
import { Suspense } from 'react';
import { ClipboardList, Heart, Home, LayoutGrid, Ruler, ShoppingBag } from 'lucide-react';
import { LanguageSwitcher } from '@/components/guest/language-switcher';
import { translate } from '@/lib/i18n/translate';
import type { Locale } from '@/lib/i18n/locales';

export function SiteHeader({
  storeSlug,
  storeName,
  logoUrl,
  cartCount,
  wishlistCount = 0,
  compareCount = 0,
  locale = 'en',
  showVisualizer = false,
  showProjects = false,
}: {
  storeSlug: string;
  storeName: string;
  logoUrl?: string | null;
  cartCount: number;
  wishlistCount?: number;
  compareCount?: number;
  locale?: Locale;
  showVisualizer?: boolean;
  showProjects?: boolean;
}) {
  const base = `/store/${storeSlug}`;
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const counted = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);
  const initials = storeName.trim().charAt(0).toUpperCase() || 'S';

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-content items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
          <Link href={base} className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
            {logoUrl ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-white/95 p-1 shadow-xs sm:h-11 sm:w-11">
                <img
                  src={logoUrl}
                  alt={`${storeName} Logo`}
                  className="h-full w-full object-contain"
                  loading="eager"
                />
              </div>
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-burgundy font-display text-lg text-gold shadow-xs">
                {initials}
              </span>
            )}
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-display text-base text-burgundy sm:text-lg">{storeName}</span>
              <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Powered by ZENTRO BuildMart</span>
            </div>
          </Link>
          <nav aria-label={t('nav.home')} className="hidden items-center gap-6 text-sm font-medium text-ink md:flex">
            <Link href={`${base}/category/all`} className="hover:text-burgundy">{t('nav.products')}</Link>
            <Link href={`${base}/tools/tile-calculator`} className="hover:text-burgundy">{t('nav.tileCalculator')}</Link>
            <Link href={`${base}/compare`} className="hover:text-burgundy">{counted(t('nav.compare'), compareCount)}</Link>
            {showVisualizer ? <Link href={`${base}/visualizer`} className="hover:text-burgundy">{t('nav.visualizer')}</Link> : null}
            {showProjects ? <Link href={`${base}/projects`} className="hover:text-burgundy">{t('nav.projects')}</Link> : null}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Suspense fallback={null}>
              <LanguageSwitcher current={locale} />
            </Suspense>
            <Link href={`${base}/wishlist`} aria-label={counted(t('nav.wishlist'), wishlistCount)} className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control p-2 text-ink hover:bg-card">
              <Heart className="h-5 w-5" aria-hidden />
              {wishlistCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-burgundy px-1 text-[11px] font-semibold text-cream">
                  {wishlistCount}
                </span>
              ) : null}
            </Link>
            <Link href={`${base}/cart`} aria-label={counted(t('nav.cart'), cartCount)} className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control p-2 text-ink hover:bg-card">
              <ShoppingBag className="h-5 w-5" aria-hidden />
              {cartCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-burgundy px-1 text-[11px] font-semibold text-cream">
                  {cartCount}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </header>
      {/* Mobile bottom navigation: placed outside <header> so backdrop-blur does not trap fixed positioning. */}
      <nav
        aria-label={t('nav.open')}
        className={`fixed inset-x-0 bottom-0 z-30 grid ${showProjects ? 'grid-cols-5' : 'grid-cols-4'} border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] text-[11px] font-medium text-ink-muted backdrop-blur md:hidden`}
      >
        <Link href={base} className="flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy">
          <Home className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate">{t('nav.home')}</span>
        </Link>
        <Link href={`${base}/category/all`} className="flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy">
          <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate">{t('nav.products')}</span>
        </Link>
        {showProjects ? (
          <Link href={`${base}/projects`} className="flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy">
            <Ruler className="h-5 w-5 shrink-0" aria-hidden />
            <span className="max-w-full truncate">{t('nav.projects')}</span>
          </Link>
        ) : null}
        <Link href={`${base}/cart`} aria-label={counted(t('nav.cart'), cartCount)} className="relative flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy">
          <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden />
          {cartCount > 0 ? (
            <span className="absolute right-[24%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-cream">
              {cartCount}
            </span>
          ) : null}
          <span className="max-w-full truncate">{t('nav.cart')}</span>
        </Link>
        <Link href={`${base}/orders`} className="flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy">
          <ClipboardList className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate">{t('nav.orders')}</span>
        </Link>
      </nav>
    </>
  );
}
