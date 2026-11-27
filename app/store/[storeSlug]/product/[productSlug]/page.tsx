import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/guest/product-card';
import { ProductGallery } from '@/components/guest/product-gallery';
import { AddToCartForm } from '@/components/guest/add-to-cart-form';
import { ListToggle } from '@/components/guest/list-toggle';
import { formatINR } from '@/lib/money';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { getProductDetail, getStoreBySlug, listRelatedProducts } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; productSlug: string }>;
  searchParams: Promise<{ variant?: string; qty?: string }>;
}) {
  const { storeSlug, productSlug } = await params;
  const sp = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const product = await getProductDetail(store.id, productSlug);
  if (!product) notFound();

  const selected = product.variants.find((v) => v.id === sp.variant) ?? product.defaultVariant ?? product.variants[0];
  if (!selected) notFound();
  const quantity = Math.min(999, Math.max(1, Number.parseInt(sp.qty ?? '1', 10) || 1));
  const [related, quotationsEnabled] = await Promise.all([
    listRelatedProducts(store.id, product.categorySlug, product.id),
    isFeatureEnabled(store.id, 'quotations'),
  ]);
  const specEntries = Object.entries(product.specs).filter(([, v]) => v !== null && v !== '');
  const save = selected.mrpPaise && selected.mrpPaise > selected.salePricePaise ? selected.mrpPaise - selected.salePricePaise : 0;

  return (
    <div className="grid gap-12">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href={`/store/${storeSlug}`} className="hover:text-burgundy">Home</Link>
        <span className="mx-2">/</span>
        <Link href={`/store/${storeSlug}/category/${product.categorySlug}`} className="hover:text-burgundy">{product.categoryName}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <ProductGallery photos={product.photos} name={product.name} category={product.categoryName} />
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          {product.brand ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{product.brand}</p> : null}
          <h1 className="font-display text-3xl leading-tight text-burgundy sm:text-4xl">{product.name}</h1>
          <p className="text-sm text-ink-muted">SKU {selected.sku}</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-semibold text-ink">{formatINR(selected.salePricePaise)}</span>
            <span className="text-ink-muted">/ {selected.priceUnit}</span>
            {selected.mrpPaise && save > 0 ? (
              <span className="text-sm text-ink-muted line-through">{formatINR(selected.mrpPaise)}</span>
            ) : null}
          </div>
          <p className="text-sm text-ink-muted">GST {(product.gstRateBps / 100).toFixed(0)}% included in the checkout total</p>

          {product.variants.length > 1 ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-ink">Choose a variant</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <Link
                    key={variant.id}
                    href={`/store/${storeSlug}/product/${productSlug}?variant=${variant.id}`}
                    aria-current={variant.id === selected.id ? 'true' : undefined}
                    className={`rounded-control border px-3 py-2 text-sm ${
                      variant.id === selected.id ? 'border-burgundy bg-burgundy text-cream' : 'border-line bg-card text-ink'
                    }`}
                  >
                    {variant.label}
                    {variant.availableUnits === 0 ? ' (sold out)' : ''}
                  </Link>
                ))}
              </div>
            </fieldset>
          ) : null}

          <p
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${
              selected.availableUnits > 0 ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'
            }`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${selected.availableUnits > 0 ? 'bg-success' : 'bg-danger'}`} />
            {selected.availableUnits > 0 ? `In stock: ${selected.availableUnits} ${selected.priceUnit}${selected.availableUnits === 1 ? '' : 's'} available` : 'Out of stock'}
          </p>

          {selected.availableUnits > 0 ? (
            <div className="grid gap-3 rounded-card border border-line bg-card p-5 shadow-rest">
              <p className="text-sm font-semibold text-ink">Quantity ({selected.priceUnit})</p>
              <div className="flex flex-wrap items-center gap-3">
                {[1, 2, 5, 10].map((q) => (
                  <Link
                    key={q}
                    href={`/store/${storeSlug}/product/${productSlug}?variant=${selected.id}&qty=${q}`}
                    className={`rounded-control border px-3 py-1.5 text-sm ${q === quantity ? 'border-burgundy font-semibold text-burgundy' : 'border-line'}`}
                  >
                    {q}
                  </Link>
                ))}
              </div>
              <AddToCartForm storeSlug={storeSlug} variantId={selected.id} quantity={Math.min(quantity, selected.availableUnits)} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ListToggle storeSlug={storeSlug} productId={product.id} kind="wishlist" />
                <ListToggle storeSlug={storeSlug} productId={product.id} kind="compare" />
              </div>
              {quotationsEnabled ? (
                <Link href={`/store/${storeSlug}/quotes/request?variant=${selected.id}&quantity=${Math.min(quantity, selected.availableUnits)}`} className="mt-3 inline-block text-sm font-semibold text-burgundy underline">
                  Request a quotation for this product
                </Link>
              ) : null}
            </div>
          ) : null}

          {product.description ? <p className="leading-relaxed text-ink">{product.description}</p> : null}
        </div>
      </div>

      <section aria-labelledby="specs" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="specs" className="font-display text-2xl text-burgundy">Specifications</h2>
          <p className="text-xs text-ink-muted">Figures shown are for the selected variant.</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-card border border-line bg-card p-6 shadow-rest sm:grid-cols-2">
          {product.finish ? <Spec label="Finish" value={product.finish} /> : null}
          {product.colour ? <Spec label="Colour" value={product.colour} /> : null}
          {product.application ? <Spec label="Application" value={product.application} /> : null}
          {selected.sizeLabel ? <Spec label="Size" value={selected.sizeLabel} /> : null}
          {product.warrantyMonths !== null ? <Spec label="Warranty" value={`${product.warrantyMonths} months`} /> : null}
          {product.hsnCode ? <Spec label="HSN code" value={product.hsnCode} /> : null}
          {selected.piecesPerBox > 1 ? <Spec label="Pieces per box" value={String(selected.piecesPerBox)} /> : null}
          {specEntries.map(([key, value]) => (
            <Spec key={key} label={key} value={String(value)} />
          ))}
        </dl>
      </section>

      {related.length > 0 ? (
        <section aria-labelledby="related" className="grid gap-4">
          <h2 id="related" className="font-display text-2xl text-burgundy">You may also like</h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {related.map((item) => (
              <li key={item.id}>
                <ProductCard storeSlug={storeSlug} product={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 pb-2">
      <dt className="text-sm text-ink-muted capitalize">{label.replace(/_/g, ' ')}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
