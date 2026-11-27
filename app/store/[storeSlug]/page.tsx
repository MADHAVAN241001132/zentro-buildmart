import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/guest/product-card';
import { EmptyState } from '@/components/ui/empty-state';
import { RemoteImage } from '@/components/guest/remote-image';
import { currentLocale } from '@/lib/i18n/server';
import { createTranslator } from '@/lib/i18n/translate';
import { listCategories, listProducts, listStoreBrands, getStoreBySlug } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

export default async function StoreHome({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const t = createTranslator(await currentLocale());
  const [categories, featured, brands] = await Promise.all([
    listCategories(store.id),
    listProducts(store.id, { sort: 'featured', pageSize: 4 }),
    listStoreBrands(store.id, { withLogoOnly: true, limit: 12 }),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <section className="relative grid gap-6 overflow-hidden rounded-card bg-gradient-to-br from-burgundy-deep via-burgundy to-burgundy-deep px-4 py-6 text-cream shadow-hover sm:px-6 sm:py-8 md:grid-cols-[1.15fr_1fr] md:items-center md:gap-8 md:px-10 md:py-12">
        <div className="grid gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">{t('home.eyebrow')}</p>
          <h1 className="font-display text-3xl leading-tight [overflow-wrap:anywhere] sm:text-4xl lg:text-5xl">{t('home.welcome', { name: store.name })}</h1>
          {store.tagline ? <p className="text-base font-medium tracking-wide text-gold">{store.tagline}</p> : null}
          {store.businessDescription ? <p className="max-w-2xl text-cream/85">{store.businessDescription}</p> : null}
          <p className="max-w-xl text-cream/80">{t('home.intro')}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={`/store/${storeSlug}/category/all`} className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-gold px-5 py-2.5 text-sm font-semibold text-burgundy-deep transition hover:brightness-105">
              {t('home.browse')}
            </Link>
            <Link href={`/store/${storeSlug}/tools/tile-calculator`} className="inline-flex min-h-[44px] items-center justify-center rounded-control border border-cream/40 px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-cream/10">
              {t('home.tileCalculator')}
            </Link>
          </div>
        </div>
        <div className="w-full overflow-hidden rounded-card border border-gold/40 bg-burgundy-deep/40 shadow-rest">
          {store.bannerUrl ? (
            <RemoteImage
              src={store.bannerUrl}
              alt={`${store.name} Showroom Banner`}
              wrapperClassName="aspect-[16/5] w-full bg-burgundy-deep/40"
              imgClassName="h-full w-full object-contain"
              fallback={
                <div className="flex aspect-[16/5] w-full flex-col items-center justify-center p-6 text-center text-cream">
                  <p className="font-display text-2xl text-gold">{store.name}</p>
                  <p className="text-xs text-cream/80 mt-1 uppercase tracking-wider">A Digital Showroom Powered by ZENTRO BuildMart</p>
                </div>
              }
            />
          ) : store.slug === 'zentro-buildmart-showroom' ? (
            <Image
              src="/images/showroom-hero.webp"
              alt="ZENTRO BuildMart Digital Showroom showcasing Kitchen Accessories, Bathroom Fittings, Tile Visualizer, Tile Calculator, Product Compare, and Project Gallery"
              width={1024}
              height={682}
              priority
              sizes="(max-width: 767px) 100vw, (max-width: 1279px) 46vw, 560px"
              className="h-auto w-full object-contain"
            />
          ) : (
            <div className="flex aspect-[16/9] w-full flex-col items-center justify-center p-8 text-center text-cream bg-gradient-to-br from-burgundy via-burgundy-deep to-black/60">
              {store.logoUrl ? (
                <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/95 p-2 shadow-rest">
                  <img src={store.logoUrl} alt={`${store.name} Logo`} className="h-full w-full object-contain" />
                </div>
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/20 font-display text-2xl text-gold mb-3">
                  {store.name.trim().charAt(0).toUpperCase() || 'S'}
                </span>
              )}
              <p className="font-display text-2xl text-gold">{store.name}</p>
              <p className="text-xs text-cream/90 mt-1.5 max-w-sm">Discover our collection of products and explore a convenient digital showroom experience.</p>
              <div className="mt-4 pt-3 border-t border-cream/15 text-[11px] text-cream/70">
                <span className="font-semibold text-gold">Powered by ZENTRO BuildMart</span>
                <span className="mx-2">&bull;</span>
                <span>Connect. Create. Conquer.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="categories-heading" className="grid gap-5">
        <h2 id="categories-heading" className="font-display text-2xl text-burgundy">{t('home.categories')}</h2>
        {categories.length === 0 ? (
          <EmptyState title="Catalogue being prepared" body="Our product collection is being prepared. Visit us again soon to explore our latest products." />
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/store/${storeSlug}/category/${category.slug}`}
                  className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-card shadow-rest transition hover:shadow-hover"
                >
                  {category.imageUrl ? (
                    <RemoteImage
                      src={category.imageUrl}
                      alt=""
                      wrapperClassName="aspect-[16/9] w-full bg-cream"
                      fallback={<span aria-hidden="true" className="block aspect-[16/9] w-full bg-burgundy" />}
                    />
                  ) : null}
                  <span className="p-3.5 pb-0 font-display text-base text-ink [overflow-wrap:anywhere] sm:p-5 sm:pb-0 sm:text-lg">{category.name}</span>
                  <span className="mt-2 p-3.5 pt-0 text-xs text-ink-muted sm:mt-4 sm:p-5 sm:pt-0 sm:text-sm">{t('home.productCount', { count: category.productCount })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {brands.length > 0 ? (
        <section aria-labelledby="brands-heading" className="grid gap-5">
          <h2 id="brands-heading" className="font-display text-2xl text-burgundy">{t('home.brands')}</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {brands.map((brand) => {
              const tile = (
                <span className="flex aspect-[3/2] w-full items-center justify-center rounded-control bg-cream px-2 text-center font-display text-sm text-burgundy">
                  {brand.name}
                </span>
              );
              return (
                <li key={brand.id}>
                  <Link
                    href={`/store/${storeSlug}/category/all?brand=${encodeURIComponent(brand.slug)}`}
                    className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 shadow-rest transition hover:shadow-hover"
                  >
                    {brand.logoUrl ? (
                      <RemoteImage
                        src={brand.logoUrl}
                        alt={t('home.logoAlt', { name: brand.name })}
                        wrapperClassName="aspect-[3/2] w-full rounded-control bg-cream"
                        imgClassName="h-full w-full object-contain p-3"
                        fallback={tile}
                      />
                    ) : (
                      tile
                    )}
                    <span className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{brand.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="featured-heading" className="grid gap-5">
        <div className="flex items-end justify-between">
          <h2 id="featured-heading" className="font-display text-2xl text-burgundy">{t('home.featured')}</h2>
          <Link href={`/store/${storeSlug}/category/all`} className="text-sm font-semibold text-burgundy">{t('home.viewAll')}</Link>
        </div>
        {featured.items.length === 0 ? (
          <EmptyState title="No products yet" body="Our product collection is being prepared. Visit us again soon to explore our latest products." />
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.items.map((product) => (
              <li key={product.id}>
                <ProductCard storeSlug={storeSlug} product={product} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
