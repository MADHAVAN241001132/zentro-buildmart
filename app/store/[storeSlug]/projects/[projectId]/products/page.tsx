import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatINR } from '@/lib/money';
import { readGuestSession } from '@/lib/services/guest';
import { PlannerError, getProjectView, type ProjectView } from '@/lib/services/house-projects';
import { getProductDetailsByIds, getStoreBySlug, listCategories, listProducts, listStoreBrands } from '@/lib/services/storefront';
import { setLineAction } from '../../actions';
import { RemoteImage } from '@/components/guest/remote-image';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;
const SORTS = ['name', 'price-asc', 'price-desc', 'featured'] as const;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function pageNumber(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export default async function ProductPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeSlug, projectId } = await params;
  const query = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) notFound();

  let view: ProjectView;
  try {
    view = await getProjectView(store.id, session.id, projectId);
  } catch (err) {
    if (err instanceof PlannerError) notFound();
    throw err;
  }

  const q = first(query.q).trim().slice(0, 80);
  const category = first(query.category).replace(/[^a-z0-9-]/g, '').slice(0, 60);
  const brand = first(query.brand).replace(/[^a-z0-9-]/g, '').slice(0, 60);
  const sortValue = first(query.sort);
  const sort = (SORTS as readonly string[]).includes(sortValue) ? (sortValue as (typeof SORTS)[number]) : 'name';
  const page = pageNumber(first(query.page));
  const roomId = first(query.roomId).replace(/[^0-9a-f-]/gi, '');
  const room = view.rooms.find((r) => r.id === roomId) ?? null;

  const [categories, brands, result] = await Promise.all([
    listCategories(store.id),
    listStoreBrands(store.id, { limit: 200 }),
    listProducts(store.id, {
      search: q || undefined,
      categorySlug: category || undefined,
      brandSlug: brand || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const details = await getProductDetailsByIds(store.id, result.items.map((p) => p.id));
  const detailById = new Map(details.map((d) => [d.id, d]));

  const basePath = `/store/${storeSlug}/projects/${projectId}/products`;
  const current = new URLSearchParams();
  if (q) current.set('q', q);
  if (category) current.set('category', category);
  if (brand) current.set('brand', brand);
  if (sort !== 'name') current.set('sort', sort);
  if (roomId && room) current.set('roomId', roomId);
  const returnTo = `${basePath}${current.toString() ? `?${current.toString()}` : ''}`;
  const pageLink = (n: number) => {
    const p = new URLSearchParams(current);
    if (n > 1) p.set('page', String(n));
    return `${basePath}${p.toString() ? `?${p.toString()}` : ''}`;
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link href={`/store/${storeSlug}/projects/${projectId}`} className="text-sm font-semibold text-burgundy underline">Back to {view.name}</Link>
        <h1 className="font-display text-3xl text-burgundy">Add products{room ? ` to ${room.name}` : ' to the project'}</h1>
        <p className="text-sm text-ink-muted">Search the showroom, choose a size or finish, and set the quantity. Prices are checked again when you add to the cart.</p>
      </header>

      {/* Search and filters use GET so they work without scripts and can be bookmarked. */}
      <form method="get" className="grid gap-3 rounded-card border border-line bg-card p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        {roomId && room ? <input type="hidden" name="roomId" value={roomId} /> : null}
        <label className="grid gap-1 text-sm font-semibold text-ink">
          Search
          <input name="q" defaultValue={q} maxLength={80} placeholder="Tiles, sanitary, switches" className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-ink">
          Category
          <select name="category" defaultValue={category} className="rounded-control border border-line bg-cream px-3 py-2 font-normal">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-ink">
          Brand
          <select name="brand" defaultValue={brand} className="rounded-control border border-line bg-cream px-3 py-2 font-normal">
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={sort} className="rounded-control border border-line bg-cream px-2 py-2 text-sm">
            <option value="name">Name</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
            <option value="featured">Featured</option>
          </select>
          <button type="submit" className="rounded-control bg-burgundy px-4 py-2 text-sm font-semibold text-cream">Apply</button>
        </div>
      </form>

      <p className="text-sm text-ink-muted" aria-live="polite">
        {result.total === 0 ? 'No products match.' : `${result.total} ${result.total === 1 ? 'product' : 'products'} · page ${result.page} of ${result.pageCount}`}
      </p>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((item) => {
          const detail = detailById.get(item.id);
          const variants = detail?.variants ?? [];
          return (
            <li key={item.id} className="grid gap-3 rounded-card border border-line bg-card p-4">
              <div className="flex gap-3">
                {item.imageUrl ? (
                  <RemoteImage
                    src={item.imageUrl}
                    alt=""
                    wrapperClassName="h-20 w-20 shrink-0 rounded-control bg-cream"
                    fallback={<span className="h-20 w-20 shrink-0 rounded-control bg-cream" aria-hidden="true" />}
                  />
                ) : (
                  <span className="h-20 w-20 shrink-0 rounded-control bg-cream" aria-hidden="true" />
                )}
                <div className="grid min-w-0 gap-1">
                  <span className="font-semibold text-ink">{item.name}</span>
                  <span className="text-xs text-ink-muted">{[item.brand, item.categoryName].filter(Boolean).join(' · ')}</span>
                  {!item.inStock ? <span className="text-xs font-semibold text-danger">Out of stock at the moment</span> : null}
                </div>
              </div>
              {variants.length === 0 ? (
                <p className="text-sm text-ink-muted">Not available to plan right now.</p>
              ) : (
                <form action={setLineAction} className="grid gap-2">
                  <input type="hidden" name="storeSlug" value={storeSlug} />
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="roomId" value={room ? room.id : ''} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="grid gap-1 text-sm text-ink-muted">
                    Size or finish
                    <select name="variantId" required defaultValue={variants[0]?.id} className="rounded-control border border-line bg-cream px-2 py-2 text-sm text-ink">
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}{v.sizeLabel ? ` · ${v.sizeLabel}` : ''} · {formatINR(v.salePricePaise)} per {v.priceUnit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="grid gap-1 text-sm text-ink-muted">
                      Quantity
                      <input name="quantity" type="number" min={1} max={999} step={1} defaultValue={1} required className="w-24 rounded-control border border-line bg-cream px-2 py-2 text-ink" />
                    </label>
                    <button type="submit" className="rounded-control border border-burgundy px-3 py-2 text-sm font-semibold text-burgundy">
                      {room ? 'Add to room' : 'Add to project'}
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {result.pageCount > 1 ? (
        <nav aria-label="Product pages" className="flex items-center justify-between gap-4 text-sm">
          {result.page > 1 ? <Link href={pageLink(result.page - 1)} className="font-semibold text-burgundy underline">Previous</Link> : <span />}
          <span className="text-ink-muted">Page {result.page} of {result.pageCount}</span>
          {result.page < result.pageCount ? <Link href={pageLink(result.page + 1)} className="font-semibold text-burgundy underline">Next</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
