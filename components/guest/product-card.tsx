import Link from 'next/link';
import { formatINR } from '@/lib/money';
import { currentLocale } from '@/lib/i18n/server';
import { createTranslator } from '@/lib/i18n/translate';
import type { ProductSummary } from '@/lib/services/storefront';
import { ProductImage } from './product-image';
import { AddToCartForm } from './add-to-cart-form';
import { ListToggle } from './list-toggle';

export async function ProductCard({ storeSlug, product }: { storeSlug: string; product: ProductSummary }) {
  const t = createTranslator(await currentLocale());
  const price = product.defaultVariant;
  const href = `/store/${storeSlug}/product/${product.slug}`;
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-rest transition hover:shadow-hover">
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden>
          <ProductImage src={product.imageUrl} alt={product.name} category={product.categoryName} />
        </Link>
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            product.inStock ? 'bg-success/90 text-white' : 'bg-ink-muted/90 text-white'
          }`}
        >
          {product.inStock ? t('common.inStock') : t('common.outOfStock')}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {product.brand ? <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">{product.brand}</p> : null}
        <h3 className="font-display text-lg leading-snug text-ink">
          <Link href={href} className="hover:text-burgundy">{product.name}</Link>
        </h3>
        {price?.sizeLabel ? <p className="text-sm text-ink-muted">{price.sizeLabel}</p> : null}
        {price ? (
          <p className="mt-auto pt-2 text-xl font-semibold text-ink">
            {formatINR(price.salePricePaise)}
            <span className="ml-1 text-sm font-normal text-ink-muted">/ {price.priceUnit}</span>
          </p>
        ) : null}
        {price && product.inStock ? (
          <AddToCartForm storeSlug={storeSlug} variantId={price.id} />
        ) : (
          <Link href={href} className="rounded-control border border-line py-2.5 text-center text-sm font-semibold text-burgundy">
            {t('common.viewDetails')}
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ListToggle storeSlug={storeSlug} productId={product.id} kind="wishlist" />
          <ListToggle storeSlug={storeSlug} productId={product.id} kind="compare" />
        </div>
      </div>
    </article>
  );
}
