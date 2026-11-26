import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductImage } from '@/components/guest/product-image';
import { formatINR } from '@/lib/money';
import { MAX_COMPARE, type CompareRow } from '@/lib/lists/compare-rules';
import { readGuestSession } from '@/lib/services/guest';
import { getComparisonTable } from '@/lib/services/guest-lists';
import { getStoreBySlug, type ProductDetail } from '@/lib/services/storefront';
import { listPageAction } from '../lists/actions';

export const dynamic = 'force-dynamic';

function display(row: CompareRow, value: string | number | null): string {
  if (value === null || value === '') return '—';
  if (row.kind === 'money' && typeof value === 'number') return formatINR(value);
  if (row.kind === 'number' && row.key === 'availableUnits') return String(value);
  return String(value);
}

export default async function ComparePage({
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
  const returnTo = `/store/${storeSlug}/compare`;
  const bulkId = 'compare-bulk';

  let products: ProductDetail[] = [];
  let rows: CompareRow[] = [];
  let loadFailed = false;
  try {
    const session = await readGuestSession(store.id, storeSlug);
    if (session) ({ products, rows } = await getComparisonTable(store.id, session.id));
  } catch {
    loadFailed = true;
  }
  const differingCount = rows.filter((r) => r.differs).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-burgundy">Compare products</h1>
          <p className="text-sm text-ink-muted">Compare up to {MAX_COMPARE} products side by side. Saved on this device.</p>
        </div>
        <Link href={`/store/${storeSlug}/category/all`} className="text-sm font-semibold text-burgundy underline">Add more products</Link>
      </header>

      {notice ? <p role="status" className="rounded-card border border-line bg-card p-3 text-sm text-ink">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-card border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      {loadFailed ? (
        <p role="alert" className="rounded-card border border-danger bg-danger/10 p-4 text-sm text-danger">
          We could not load your comparison. Refresh the page to try again.
        </p>
      ) : products.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-card p-8 text-center">
          <p className="font-display text-xl text-burgundy">Nothing to compare yet</p>
          <p className="mt-2 text-sm text-ink-muted">Use the Compare button on any product to add it here.</p>
          <Link href={`/store/${storeSlug}/category/all`} className="mt-4 inline-block rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream">
            Browse products
          </Link>
        </div>
      ) : (
        <>
          <form id={bulkId} action={listPageAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="storeSlug" value={storeSlug} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" name="intent" value="compare-move" className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream">
              Add selected to cart
            </button>
            <button type="submit" name="intent" value="compare-remove" className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold text-burgundy">
              Remove selected
            </button>
            <p className="text-sm text-ink-muted">
              {differingCount} of {rows.length} attributes differ. Differences are highlighted.
            </p>
          </form>

          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">Side-by-side comparison of selected products</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[10rem] bg-card p-3 text-left font-semibold text-ink-muted">Attribute</th>
                  {products.map((p) => (
                    <th key={p.id} scope="col" className="min-w-[13rem] border-l border-line p-3 align-top text-left">
                      <div className="flex flex-col gap-2">
                        <ProductImage src={p.imageUrl} alt={p.name} category={p.categoryName} />
                        <Link href={`/store/${storeSlug}/product/${p.slug}`} className="font-display text-base text-ink hover:text-burgundy">{p.name}</Link>
                        <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                          <input type="checkbox" form={bulkId} name="selected" value={p.id} disabled={!p.defaultVariant || !p.inStock} />
                          Select for cart
                        </label>
                        <form action={listPageAction}>
                          <input type="hidden" name="storeSlug" value={storeSlug} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="productId" value={p.id} />
                          <button type="submit" name="intent" value="compare-remove" className="text-xs font-semibold text-burgundy underline">Remove from comparison</button>
                        </form>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} data-differs={row.differs ? 'true' : 'false'} className={row.differs ? 'bg-gold/15' : undefined}>
                    <th scope="row" className={`sticky left-0 z-10 border-t border-line p-3 text-left font-semibold text-ink ${row.differs ? 'bg-gold/15' : 'bg-card'}`}>
                      {row.label}
                      {row.differs ? <span className="sr-only"> (differs)</span> : null}
                    </th>
                    {row.values.map((value, i) => (
                      <td key={products[i]!.id} className="border-l border-t border-line p-3 align-top text-ink">{display(row, value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-muted">
            Prices and stock are shown as they stand now. Add to cart checks the price and stock again before you pay.
          </p>
        </>
      )}
    </div>
  );
}
