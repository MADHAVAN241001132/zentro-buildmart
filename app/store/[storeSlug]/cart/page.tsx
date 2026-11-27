import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CartCouponForm } from '@/components/guest/cart-coupon-form';
import { CartLine } from '@/components/guest/cart-line';
import { EmptyState } from '@/components/ui/empty-state';
import { formatINR } from '@/lib/money';
import { currentLocale } from '@/lib/i18n/server';
import { createTranslator } from '@/lib/i18n/translate';
import { GstBreakdown } from '@/components/guest/gst-breakdown';
import { getCartView } from '@/lib/services/cart';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

export default async function CartPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const [t, session, couponsEnabled] = await Promise.all([
    currentLocale().then(createTranslator),
    readGuestSession(store.id, storeSlug),
    isFeatureEnabled(store.id, 'coupons'),
  ]);
  const cart = session ? await getCartView(store.id, session.id) : { cartId: null, lines: [], totals: null, itemCount: 0 };

  if (cart.lines.length === 0 || !cart.totals) {
    return (
      <EmptyState
        title={t('cart.empty')}
        body={t('cart.emptyBody')}
        action={
          <Link href={`/store/${storeSlug}/category/all`} className="font-semibold text-burgundy">
            {t('home.browse')}
          </Link>
        }
      />
    );
  }

  const totals = cart.totals;
  const couponLabel = cart.coupon?.code ? t('cart.coupon', { code: cart.coupon.code }) : t('cart.discount');
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section className="grid min-w-0 gap-4">
        <h1 className="font-display text-3xl text-burgundy">{t('cart.title')}</h1>
        <ul className="grid gap-4">
          {cart.lines.map((line) => {
            const priced = totals.lines.find((item) => item.key === line.itemId);
            return (
              <CartLine
                key={line.itemId}
                storeSlug={storeSlug}
                itemId={line.itemId}
                productName={line.productName}
                imageUrl={line.imageUrl}
                variantLabel={line.variantLabel}
                priceUnit={line.priceUnit}
                unitPricePaise={line.unitPricePaise}
                quantity={line.quantity}
                lineTotalPaise={priced?.lineTotalPaise ?? 0}
                availableUnits={line.availableUnits}
              />
            );
          })}
        </ul>
      </section>

      <aside aria-label={t('cart.summary')} className="h-fit rounded-card border border-line bg-card p-6 lg:sticky lg:top-24">
        <h2 className="font-display text-xl text-burgundy">{t('cart.summary')}</h2>
        <div className="mt-4">
          <GstBreakdown
            labels={{
              subtotal: t('cart.subtotal'),
              valueBeforeGst: t('gst.breakdown.valueBeforeGst'),
              discount: couponLabel,
              taxable: t('gst.breakdown.taxable'),
              gst: t('cart.gst'),
              gstIncluded: t('gst.breakdown.gstIncluded'),
              delivery: t('gst.breakdown.delivery'),
              total: t('cart.total'),
              totalPayable: t('gst.breakdown.totalPayable'),
              noteInclusive: t('gst.breakdown.noteInclusive'),
              noteExclusive: t('gst.breakdown.noteExclusive'),
              noteNotCollected: t('gst.breakdown.noteNotCollected'),
            }}
            pricingMode={cart.pricingMode}
            subtotalPaise={totals.subtotalPaise}
            discountPaise={totals.discountPaise}
            taxPaise={totals.taxPaise}
            deliveryPaise={0}
            totalPaise={totals.totalPaise}
          />
        </div>
        <dl className="mt-3 grid gap-2 text-sm">
          <Row label={t('cart.pickup')} value={t('cart.free')} />
        </dl>
        {couponsEnabled ? <CartCouponForm storeSlug={storeSlug} appliedCode={cart.coupon?.code ?? null} /> : null}
        {cart.coupon?.error ? (
          <p role="alert" className="mt-2 text-sm text-danger [overflow-wrap:anywhere]">
            {t('cart.couponError', { label: couponLabel, error: cart.coupon.error })}
          </p>
        ) : null}
        <Link
          href={`/store/${storeSlug}/checkout`}
          className="mt-6 block rounded-control bg-burgundy py-3 text-center font-semibold text-cream hover:bg-burgundy-deep"
        >
          {t('cart.checkout')}
        </Link>
        <Link href={`/store/${storeSlug}/quotes/request`} className="mt-3 block rounded-control border border-burgundy py-3 text-center font-semibold text-burgundy hover:bg-cream">
          {t('cart.quote')}
        </Link>
        <p className="mt-3 text-xs text-ink-muted">{t('cart.stockNote')}</p>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted [overflow-wrap:anywhere]">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
