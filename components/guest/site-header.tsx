'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Calculator,
  Camera,
  GitCompareArrows,
  Heart,
  Home,
  LayoutGrid,
  MoreHorizontal,
  Ruler,
  ShoppingBag,
  X,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/guest/language-switcher';
import { ZentroLogo } from '@/components/ui/zentro-logo';
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
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const base = `/store/${storeSlug}`;
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const counted = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const secondaryItems = [
    { href: `${base}/tools/tile-calculator`, label: t('nav.tileCalculator'), icon: Calculator, visible: true, count: 0 },
    { href: `${base}/projects`, label: t('nav.projects'), icon: Ruler, visible: showProjects, count: 0 },
    { href: `${base}/visualizer`, label: t('nav.visualizer'), icon: Camera, visible: showVisualizer, count: 0 },
    { href: `${base}/wishlist`, label: t('nav.wishlist'), icon: Heart, visible: true, count: wishlistCount },
  ].filter((item) => item.visible);

  const moreActive = secondaryItems.some((item) => isActive(item.href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-content flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-3">
          <div className="flex items-center justify-between gap-2 md:min-w-0 md:flex-1">
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
                <ZentroLogo size={40} alt={`${storeName} Logo`} className="rounded-control shadow-xs sm:h-11 sm:w-11" />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="break-words font-display text-sm leading-snug text-burgundy sm:text-base md:text-lg">{storeName}</span>
                <span className="break-words text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Powered by ZENTRO BuildMart
                </span>
              </div>
            </Link>
          </div>

          <nav aria-label={t('nav.home')} className="hidden items-center gap-5 text-sm font-medium text-ink md:flex">
            <Link href={`${base}/category/all`} className={`hover:text-burgundy ${isActive(`${base}/category`) ? 'font-semibold text-burgundy' : ''}`}>
              {t('nav.products')}
            </Link>
            <Link href={`${base}/tools/tile-calculator`} className={`hover:text-burgundy ${isActive(`${base}/tools/tile-calculator`) ? 'font-semibold text-burgundy' : ''}`}>
              {t('nav.tileCalculator')}
            </Link>
            <Link href={`${base}/compare`} className={`hover:text-burgundy ${isActive(`${base}/compare`) ? 'font-semibold text-burgundy' : ''}`}>
              {counted(t('nav.compare'), compareCount)}
            </Link>
            {showVisualizer ? (
              <Link href={`${base}/visualizer`} className={`hover:text-burgundy ${isActive(`${base}/visualizer`) ? 'font-semibold text-burgundy' : ''}`}>
                {t('nav.visualizer')}
              </Link>
            ) : null}
            {showProjects ? (
              <Link href={`${base}/projects`} className={`hover:text-burgundy ${isActive(`${base}/projects`) ? 'font-semibold text-burgundy' : ''}`}>
                {t('nav.projects')}
              </Link>
            ) : null}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-line/60 pt-1.5 md:border-t-0 md:pt-0 sm:gap-2">
            <Suspense fallback={null}>
              <LanguageSwitcher current={locale} />
            </Suspense>
            <Link
              href={`${base}/wishlist`}
              aria-label={counted(t('nav.wishlist'), wishlistCount)}
              className={`relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control p-2 hover:bg-card ${
                isActive(`${base}/wishlist`) ? 'text-burgundy' : 'text-ink'
              }`}
            >
              <Heart className="h-5 w-5" aria-hidden />
              {wishlistCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-burgundy px-1 text-[11px] font-semibold text-cream">
                  {wishlistCount}
                </span>
              ) : null}
            </Link>
            {/* Desktop header Cart only; on mobile, Cart lives in the bottom navigation bar to avoid duplicate Cart icons. */}
            <Link
              href={`${base}/cart`}
              aria-label={counted(t('nav.cart'), cartCount)}
              className={`relative hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-control p-2 hover:bg-card md:inline-flex ${
                isActive(`${base}/cart`) ? 'text-burgundy' : 'text-ink'
              }`}
            >
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

      {/* Mobile "More" drawer for additional enabled storefront features */}
      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More storefront features">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] shadow-hover">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg text-burgundy">Storefront Features</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-ink-muted hover:bg-cream hover:text-burgundy"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex min-h-[48px] items-center gap-2.5 rounded-card border px-3.5 py-3 text-sm font-medium transition ${
                      active
                        ? 'border-burgundy bg-burgundy/10 text-burgundy font-semibold'
                        : 'border-line bg-cream/60 text-ink hover:border-burgundy/40'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.count > 0 ? `${item.label} (${item.count})` : item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile bottom navigation: single Cart icon, Compare included, no unwanted Orders link. */}
      <nav
        aria-label={t('nav.open')}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] text-[11px] font-medium text-ink-muted backdrop-blur md:hidden"
      >
        <Link
          href={base}
          onClick={() => setMoreOpen(false)}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy ${
            isActive(base, true) ? 'font-semibold text-burgundy' : ''
          }`}
        >
          <Home className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate">{t('nav.home')}</span>
        </Link>
        <Link
          href={`${base}/category/all`}
          onClick={() => setMoreOpen(false)}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy ${
            isActive(`${base}/category`) ? 'font-semibold text-burgundy' : ''
          }`}
        >
          <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate">{t('nav.products')}</span>
        </Link>
        <Link
          href={`${base}/compare`}
          onClick={() => setMoreOpen(false)}
          aria-label={counted(t('nav.compare'), compareCount)}
          className={`relative flex min-h-[54px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy ${
            isActive(`${base}/compare`) ? 'font-semibold text-burgundy' : ''
          }`}
        >
          <GitCompareArrows className="h-5 w-5 shrink-0" aria-hidden />
          {compareCount > 0 ? (
            <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-burgundy-deep">
              {compareCount}
            </span>
          ) : null}
          <span className="max-w-full truncate">{t('nav.compare')}</span>
        </Link>
        <Link
          href={`${base}/cart`}
          onClick={() => setMoreOpen(false)}
          aria-label={counted(t('nav.cart'), cartCount)}
          className={`relative flex min-h-[54px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy ${
            isActive(`${base}/cart`) ? 'font-semibold text-burgundy' : ''
          }`}
        >
          <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden />
          {cartCount > 0 ? (
            <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-cream">
              {cartCount}
            </span>
          ) : null}
          <span className="max-w-full truncate">{t('nav.cart')}</span>
        </Link>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-1 px-1 py-2 hover:text-burgundy ${
            moreOpen || moreActive ? 'font-semibold text-burgundy' : ''
          }`}
        >
          <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate">More</span>
        </button>
      </nav>
    </>
  );
}
