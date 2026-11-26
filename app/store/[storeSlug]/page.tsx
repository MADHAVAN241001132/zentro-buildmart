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
      <section className="relative grid gap-6 overflow-hidden rounded-card bg-gradient-to-br from-burgundy-deep via-burgundy to-burgundy-deep px-6 py-10 text-cream shadow-hover md:grid-cols-[1.4fr_1fr] md:items-center md:px-10 md:py-14">
        <div className="grid gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">{t('home.eyebrow')}</p>
          <h1 className="font-display text-3xl leading-tight [overflow-wrap:anywhere] sm:text-4xl lg:text-5xl">{t('home.welcome', { name: store.name })}</h1>
          {store.businessDescription ? <p className="max-w-2xl text-cream/85">{store.businessDescription}</p> : null}
          <p className="max-w-xl text-cream/80">{t('home.intro')}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={`/store/${storeSlug}/category/all`} className="rounded-control bg-gold px-5 py-2.5 text-sm font-semibold text-burgundy-deep transition hover:brightness-105">
              {t('home.browse')}
            </Link>
            <Link href={`/store/${storeSlug}/tools/tile-calculator`} className="rounded-control border border-cream/40 px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-cream/10">
              {t('home.tileCalculator')}
            </Link>
          </div>
        </div>
        {/* Decorative panel. It is a styled tile, not a product photograph. */}
        <div aria-hidden="true" className="hidden aspect-[4/3] rounded-card border border-gold/40 bg-burgundy-deep/60 p-6 md:flex md:flex-col md:justify-between">
          <span className="font-display text-5xl text-gold">Z</span>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`aspect-square rounded-control ${i % 2 === 0 ? 'bg-gold/30' : 'bg-cream/15'}`} />
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="categories-heading" className="grid gap-5">
        <h2 id="categories-heading" className="font-display text-2xl text-burgundy">{t('home.categories')}</h2>
        {categories.length === 0 ? (
          <EmptyState title={t('home.noCategories')} body={t('home.noCategoriesBody')} />
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
                  <span className="p-5 pb-0 font-display text-lg text-ink [overflow-wrap:anywhere]">{category.name}</span>
                  <span className="mt-4 p-5 pt-0 text-sm text-ink-muted">{t('home.productCount', { count: category.productCount })}</span>
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
          <EmptyState title={t('home.noProducts')} body={t('home.noProductsBody')} />
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
