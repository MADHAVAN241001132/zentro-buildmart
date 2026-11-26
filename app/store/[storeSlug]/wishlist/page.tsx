import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductImage } from '@/components/guest/product-image';
import { formatINR } from '@/lib/money';
import { readGuestSession } from '@/lib/services/guest';
import { getWishlist } from '@/lib/services/guest-lists';
import { getStoreBySlug, type ProductDetail } from '@/lib/services/storefront';
import { listPageAction } from '../lists/actions';

export const dynamic = 'force-dynamic';

export default async function WishlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { storeSlug } = await params;
  const { notice, error } = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const returnTo = `/store/${storeSlug}/wishlist`;

  let items: ProductDetail[] = [];
  let loadFailed = false;
  try {
    const session = await readGuestSession(store.id, storeSlug);
    items = session ? await getWishlist(store.id, session.id) : [];
  } catch {
    loadFailed = true;
  }

  const bulkId = 'wishlist-bulk';
  const sellable = (p: ProductDetail) => Boolean(p.defaultVariant) && p.inStock;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-burgundy">Your wishlist</h1>
          <p className="text-sm text-ink-muted">{items.length} saved {items.length === 1 ? 'product' : 'products'}. Saved on this device.</p>
        </div>
        <Link href={`/store/${storeSlug}/category/all`} className="text-sm font-semibold text-burgundy underline">Keep browsing</Link>
      </header>

      {notice ? <p role="status" className="rounded-card border border-line bg-card p-3 text-sm text-ink">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-card border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      {loadFailed ? (
        <p role="alert" className="rounded-card border border-danger bg-danger/10 p-4 text-sm text-danger">
          We could not load your wishlist. Refresh the page to try again.
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-card p-8 text-center">
          <p className="font-display text-xl text-burgundy">Your wishlist is empty</p>
          <p className="mt-2 text-sm text-ink-muted">Save products you like while you browse, and move them to your cart when you are ready.</p>
          <Link href={`/store/${storeSlug}/category/all`} className="mt-4 inline-block rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream">
            Browse products
          </Link>
        </div>
      ) : (
        <>
          <form id={bulkId} action={listPageAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="storeSlug" value={storeSlug} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" name="intent" value="wishlist-move" className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream">
              Move selected to cart
            </button>
            <p className="text-sm text-ink-muted">Only in-stock products with a price can be moved.</p>
          </form>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <li key={p.id} className="flex flex-col overflow-hidden rounded-card border border-line bg-card">
                <div className="relative">
                  <ProductImage src={p.imageUrl} alt={p.name} category={p.categoryName} />
                  <label className="absolute left-3 top-3 flex items-center gap-2 rounded-control bg-card/95 px-2 py-1 text-xs font-semibold text-ink">
                    <input type="checkbox" form={bulkId} name="selected" value={p.id} disabled={!sellable(p)} aria-label={`Select ${p.name}`} />
                    Select
                  </label>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  {p.brand ? <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">{p.brand}</p> : null}
                  <h2 className="font-display text-lg leading-snug text-ink">
                    <Link href={`/store/${storeSlug}/product/${p.slug}`} className="hover:text-burgundy">{p.name}</Link>
                  </h2>
                  {p.defaultVariant ? (
                    <p className="text-lg font-semibold text-ink">
                      {formatINR(p.defaultVariant.salePricePaise)}
                      <span className="ml-1 text-sm font-normal text-ink-muted">/ {p.defaultVariant.priceUnit}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-ink-muted">Price not available</p>
                  )}
                  <p className={`text-sm font-semibold ${sellable(p) ? 'text-success' : 'text-ink-muted'}`}>
                    {!p.defaultVariant ? 'Not available' : p.inStock ? `In stock (${p.defaultVariant.availableUnits} available)` : 'Out of stock'}
                  </p>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                    <form action={listPageAction}>
                      <input type="hidden" name="storeSlug" value={storeSlug} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="productId" value={p.id} />
                      <button type="submit" name="intent" value="wishlist-move" disabled={!sellable(p)} className="w-full rounded-control bg-burgundy py-2 text-sm font-semibold text-cream disabled:opacity-50">
                        Move to cart
                      </button>
                    </form>
                    <form action={listPageAction}>
                      <input type="hidden" name="storeSlug" value={storeSlug} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="productId" value={p.id} />
                      <button type="submit" name="intent" value="wishlist-remove" className="w-full rounded-control border border-line py-2 text-sm font-semibold text-burgundy">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
