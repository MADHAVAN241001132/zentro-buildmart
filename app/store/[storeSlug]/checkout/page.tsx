import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckoutForm } from '@/components/guest/checkout-form';
import { ProductThumb } from '@/components/guest/product-thumb';
import { GstBreakdown } from '@/components/guest/gst-breakdown';
import { formatINR } from '@/lib/money';
import { currentLocale } from '@/lib/i18n/server';
import { createTranslator } from '@/lib/i18n/translate';
import { getCartView } from '@/lib/services/cart';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const [session, onlineFeatureEnabled] = await Promise.all([
    readGuestSession(store.id, storeSlug),
    isFeatureEnabled(store.id, 'online_payments'),
  ]);
  const onlineEnabled = store.paymentSettings.onlineEnabled && onlineFeatureEnabled;
  const cart = session ? await getCartView(store.id, session.id) : null;
  if (!cart || cart.lines.length === 0 || !cart.totals) redirect(`/store/${storeSlug}/cart`);

  const totals = cart.totals;
  const t = createTranslator(await currentLocale());
  if (!onlineEnabled && !store.paymentSettings.cashEnabled) {
    return <p className="text-ink">This showroom is not accepting orders right now.</p>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start">
      <section className="grid gap-6">
        <div className="grid gap-4">
          <Link href={`/store/${storeSlug}/cart`} className="w-fit text-sm font-semibold text-burgundy hover:underline">← Back to cart</Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-3xl text-burgundy sm:text-4xl">Checkout</h1>
            <ol aria-label="Checkout progress" className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
              <li className="rounded-full bg-cream px-3 py-1 text-ink-muted">Cart</li>
              <li aria-hidden="true" className="h-px w-4 bg-line" />
              <li aria-current="step" className="rounded-full bg-burgundy px-3 py-1 text-cream">Checkout</li>
              <li aria-hidden="true" className="h-px w-4 bg-line" />
              <li className="rounded-full bg-cream px-3 py-1 text-ink-muted">Confirmation</li>
            </ol>
          </div>
        </div>
        {cart.coupon?.error ? (
          <p role="alert" className="text-sm text-danger">
            Coupon {cart.coupon.code}: {cart.coupon.error}{' '}
            <Link href={`/store/${storeSlug}/cart`} className="font-semibold text-burgundy">Review your cart</Link>
          </p>
        ) : null}
        <CheckoutForm
          storeSlug={storeSlug}
          onlineEnabled={onlineEnabled}
          cashEnabled={store.paymentSettings.cashEnabled}
          totalLabel={formatINR(totals.totalPaise)}
        />
      </section>
      <aside aria-labelledby="summary-heading" className="grid gap-5 rounded-card border border-line bg-card p-5 shadow-rest sm:p-6 lg:sticky lg:top-24">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="summary-heading" className="font-display text-xl text-burgundy">Order summary</h2>
          <p className="text-sm text-ink-muted">{cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-baseline justify-between gap-3 rounded-control bg-burgundy-deep px-4 py-3 text-cream">
          <span className="text-sm">Total payable</span>
          <span className="font-display text-2xl text-gold">{formatINR(totals.totalPaise)}</span>
        </div>
        <ul className="grid gap-3 border-t border-line pt-4 text-sm">
          {cart.lines.map((line) => {
            const priced = totals.lines.find((t) => t.key === line.itemId);
            return (
              <li key={line.itemId} className="flex justify-between gap-4">
                <span className="flex min-w-0 items-center gap-3">
                  <ProductThumb src={line.imageUrl} name={line.productName} className="h-10 w-10" />
                  <span className="text-ink">{line.productName} <span className="text-ink-muted">× {line.quantity}</span></span>
                </span>
                <span className="font-medium">{formatINR(priced?.lineTotalPaise ?? 0)}</span>
              </li>
            );
          })}
        </ul>
        <div>
          <GstBreakdown
            labels={{
              subtotal: t('cart.subtotal'),
              valueBeforeGst: t('gst.breakdown.valueBeforeGst'),
              discount: cart.coupon?.code ? `Coupon ${cart.coupon.code}` : t('gst.breakdown.discount'),
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
      </aside>
    </div>
  );
}
