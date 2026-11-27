import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/guest/product-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollableSelect } from '@/components/ui/scrollable-select';
import { currentLocale } from '@/lib/i18n/server';
import { createTranslator } from '@/lib/i18n/translate';
import { listCategories, listProducts, listStoreBrands, getStoreBySlug, type ProductQuery } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

const SORTS = ['featured', 'price-asc', 'price-desc', 'name'] as const;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; categorySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeSlug, categorySlug } = await params;
  const sp = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const t = createTranslator(await currentLocale());

  const [categories, brands] = await Promise.all([listCategories(store.id), listStoreBrands(store.id, { limit: 200 })]);
  const category = categorySlug === 'all' ? null : categories.find((c) => c.slug === categorySlug);
  if (categorySlug !== 'all' && !category) notFound();

  // An unknown brand slug is ignored rather than producing an empty listing.
  const activeBrand = brands.find((b) => b.slug === single(sp.brand)) ?? null;

  const sortParam = single(sp.sort);
  const query: ProductQuery = {
    categorySlug: category?.slug,
    brandSlug: activeBrand?.slug,
    search: single(sp.q),
    sort: (SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as ProductQuery['sort']) : 'featured',
    inStockOnly: single(sp.stock) === '1',
    page: Number(single(sp.page) ?? '1') || 1,
    pageSize: 12,
  };
  const result = await listProducts(store.id, query);

  const linkFor = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      q: query.search,
      sort: query.sort,
      stock: query.inStockOnly ? '1' : undefined,
      brand: query.brandSlug,
      page: undefined,
      ...overrides,
    };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
      .join('&');
    return `/store/${storeSlug}/category/${categorySlug}${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="grid min-w-0 gap-6">
      <nav aria-label={t('common.breadcrumb')} className="text-sm text-ink-muted">
        <Link href={`/store/${storeSlug}`} className="hover:text-burgundy">{t('common.home')}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{category?.name ?? t('catalogue.allProducts')}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t('catalogue.eyebrow')}</p>
          <h1 className="font-display text-3xl text-burgundy [overflow-wrap:anywhere]">{category?.name ?? t('catalogue.allProducts')}</h1>
        </div>
        <span className="rounded-full bg-burgundy/10 px-4 py-1.5 text-sm font-semibold text-burgundy">
          {t('common.productCount', { count: result.total })}
        </span>
      </header>

      {activeBrand ? (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-gold/20 px-3 py-1 font-semibold text-burgundy">{t('catalogue.brand', { name: activeBrand.name })}</span>
          <Link href={linkFor({ brand: undefined })} className="font-semibold text-burgundy underline">{t('catalogue.clearBrand')}</Link>
        </p>
      ) : null}

      <form method="get" className="grid gap-3 rounded-card border border-line bg-card p-4 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <label className="sr-only" htmlFor="q">{t('catalogue.searchLabel')}</label>
        <input
          id="q"
          name="q"
          defaultValue={query.search ?? ''}
          placeholder={t('catalogue.searchPlaceholder')}
          className="rounded-control border border-line bg-white px-3 py-2.5"
        />
        <label className="sr-only" htmlFor="brand">{t('catalogue.brandLabel')}</label>
        <ScrollableSelect
          id="brand"
          name="brand"
          defaultValue={activeBrand?.slug ?? ''}
          ariaLabel={t('catalogue.brandLabel')}
          className="md:min-w-[160px]"
          options={[
            { value: '', label: t('catalogue.allBrands') },
            ...brands.map((brand) => ({ value: brand.slug, label: brand.name })),
          ]}
        />
        <label className="sr-only" htmlFor="sort">{t('catalogue.sortLabel')}</label>
        <ScrollableSelect
          id="sort"
          name="sort"
          defaultValue={query.sort}
          ariaLabel={t('catalogue.sortLabel')}
          className="md:min-w-[160px]"
          options={[
            { value: 'featured', label: t('catalogue.sortFeatured') },
            { value: 'price-asc', label: t('catalogue.sortPriceAsc') },
            { value: 'price-desc', label: t('catalogue.sortPriceDesc') },
            { value: 'name', label: t('catalogue.sortName') },
          ]}
        />
        <label className="flex items-center gap-2 px-2 text-sm font-medium">
          <input type="checkbox" name="stock" value="1" defaultChecked={query.inStockOnly} className="accent-burgundy" />
          {t('catalogue.inStockOnly')}
        </label>
        <button type="submit" className="rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream">{t('common.apply')}</button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title={t('catalogue.noMatch')}
          body={t('catalogue.noMatchBody')}
          action={<Link href={`/store/${storeSlug}/category/${categorySlug}`} className="font-semibold text-burgundy">{t('common.clearFilters')}</Link>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.items.map((product) => (
            <li key={product.id}>
              <ProductCard storeSlug={storeSlug} product={product} />
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 ? (
        <nav aria-label={t('common.pagination')} className="flex items-center justify-center gap-3 text-sm">
          {result.page > 1 ? <Link href={linkFor({ page: String(result.page - 1) })} className="font-semibold text-burgundy">{t('common.previous')}</Link> : null}
          <span className="text-ink-muted">{t('common.pageOf', { page: result.page, total: result.pageCount })}</span>
          {result.page < result.pageCount ? <Link href={linkFor({ page: String(result.page + 1) })} className="font-semibold text-burgundy">{t('common.next')}</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
