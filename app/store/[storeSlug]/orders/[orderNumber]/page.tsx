import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderStatusPoller } from '@/components/guest/order-status-poller';
import { OrderTimeline, type TimelineStep } from '@/components/guest/order-timeline';
import { RazorpayPayButton } from '@/components/guest/razorpay-pay-button';
import { SimulatorPayButtons } from '@/components/guest/simulator-pay-buttons';
import { StatusBadge } from '@/components/ui/status-badge';
import { buttonClass } from '@/components/ui/button';
import { formatINR } from '@/lib/money';
import { simulatorAllowed } from '@/lib/env';
import { GUEST_PAYMENT_TERMINAL, type GuestPaymentStateKey } from '@/lib/payments/guest-payment-state';
import { getGuestOrder } from '@/lib/services/checkout';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { retryPaymentAction } from './actions';
import { currentLocale } from '@/lib/i18n/server';
import { createTranslator } from '@/lib/i18n/translate';
import type { MessageKey } from '@/lib/i18n/messages/en';

export const dynamic = 'force-dynamic';

/** Guest-facing copy for each payment state. Localisation is applied in the localisation pass. */
/** Guest-facing copy for each payment state, held in the English and Tamil dictionaries. Tone stays in code. */
const COPY_KEYS: Record<GuestPaymentStateKey, { title: MessageKey; body: MessageKey; tone: 'info' | 'success' | 'danger' | 'warning' }> = {
  cash_awaiting: { title: 'payState.cash_awaiting.title', body: 'payState.cash_awaiting.body', tone: 'info' },
  paid: { title: 'payState.paid.title', body: 'payState.paid.body', tone: 'success' },
  payment_starting: { title: 'payState.payment_starting.title', body: 'payState.payment_starting.body', tone: 'info' },
  payment_ready: { title: 'payState.payment_ready.title', body: 'payState.payment_ready.body', tone: 'info' },
  payment_pending: { title: 'payState.payment_pending.title', body: 'payState.payment_pending.body', tone: 'info' },
  payment_failed: { title: 'payState.payment_failed.title', body: 'payState.payment_failed.body', tone: 'danger' },
  payment_refused: { title: 'payState.payment_refused.title', body: 'payState.payment_refused.body', tone: 'warning' },
  payment_uncertain: { title: 'payState.payment_uncertain.title', body: 'payState.payment_uncertain.body', tone: 'warning' },
  payment_under_review: { title: 'payState.payment_under_review.title', body: 'payState.payment_under_review.body', tone: 'warning' },
  reservation_expired: { title: 'payState.reservation_expired.title', body: 'payState.reservation_expired.body', tone: 'danger' },
  cancelled: { title: 'payState.cancelled.title', body: 'payState.cancelled.body', tone: 'danger' },
  late_receipt: { title: 'payState.late_receipt.title', body: 'payState.late_receipt.body', tone: 'warning' },
  refund_requested: { title: 'payState.refund_requested.title', body: 'payState.refund_requested.body', tone: 'info' },
  refund_processing: { title: 'payState.refund_processing.title', body: 'payState.refund_processing.body', tone: 'info' },
  refund_completed: { title: 'payState.refund_completed.title', body: 'payState.refund_completed.body', tone: 'success' },
  refund_review: { title: 'payState.refund_review.title', body: 'payState.refund_review.body', tone: 'warning' },
};

const TONE_CLASS: Record<'info' | 'success' | 'danger' | 'warning', string> = {
  info: 'border-line bg-card',
  success: 'border-success/30 bg-success/5',
  danger: 'border-danger/30 bg-danger/5',
  warning: 'border-gold bg-card',
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; orderNumber: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { storeSlug, orderNumber } = await params;
  const sp = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) notFound();
  const [order, onlineEnabled] = await Promise.all([
    getGuestOrder(store.id, session.id, orderNumber),
    isFeatureEnabled(store.id, 'online_payments'),
  ]);
  if (!order) notFound();

  const state = order.paymentState;
  const t = createTranslator(await currentLocale());
  const keys = COPY_KEYS[state.key];
  const copy = { title: t(keys.title), body: t(keys.body), tone: keys.tone };
  const isPaid = order.paymentStatus === 'PAID';
  const polling = !GUEST_PAYMENT_TERMINAL.has(state.key);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <OrderStatusPoller active={polling} storeSlug={storeSlug} />
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Order {order.orderNumber}</p>
        <h1 className="font-display text-3xl text-burgundy">{copy.title}</h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={order.paymentStatus} />
          <StatusBadge status={order.orderStatus} />
        </div>
      </header>

      <OrderTimeline steps={timelineSteps(state.key, isPaid, order.orderStatus)} />

      {sp.notice ? <p role="status" className="rounded-card border border-gold bg-card p-3 text-sm text-ink">{sp.notice}</p> : null}

      <section aria-live="polite" className={`grid gap-2 rounded-card border p-5 text-sm ${TONE_CLASS[copy.tone]}`}>
        <p className="text-ink">{copy.body}</p>
        {state.key === 'paid' || state.key === 'refund_completed' || state.key === 'refund_processing' || state.key === 'refund_requested' || state.key === 'refund_review' ? null : (
          <p className="text-xs text-ink-muted">Amount due {formatINR(order.totalPaise)} including GST.</p>
        )}
      </section>

      <p className="text-sm">
        <Link href={`/store/${storeSlug}/orders/${order.orderNumber}/refund`} className="font-semibold text-burgundy">
          Refunds and return requests
        </Link>
      </p>

      {isPaid ? (
        <p className="text-sm">
          <a href={`/store/${storeSlug}/orders/${order.orderNumber}/invoice`} className="font-semibold text-burgundy">
            Download tax invoice (PDF)
          </a>
        </p>
      ) : null}

      {state.canPay && onlineEnabled ? (
        <section className="grid gap-4 rounded-card border border-line bg-card p-6">
          {order.provider === 'razorpay' && order.razorpayKeyId && order.providerOrderId ? (
            <RazorpayPayButton
              keyId={order.razorpayKeyId}
              providerOrderId={order.providerOrderId}
              amountPaise={order.totalPaise}
              orderNumber={order.orderNumber}
              customerName={order.customerName}
              customerMobile={order.customerMobile ?? ''}
            />
          ) : null}
          {order.provider === 'simulator' && simulatorAllowed() && order.providerOrderId ? (
            <SimulatorPayButtons providerOrderId={order.providerOrderId} amountPaise={order.totalPaise} />
          ) : null}
        </section>
      ) : null}

      {state.canRetry && onlineEnabled ? (
        <form action={retryPaymentAction} className="grid gap-2 rounded-card border border-line bg-card p-5">
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <p className="text-sm text-ink-muted">Your order is still reserved. Trying again starts one new payment with our provider.</p>
          <button className={buttonClass('primary')}>Try the payment again</button>
        </form>
      ) : null}

      {state.key === 'reservation_expired' || state.key === 'cancelled' || state.key === 'payment_failed' || (state.key === 'payment_refused' && !state.canRetry) ? (
        <p className="text-sm">
          <Link href={`/store/${storeSlug}/category/all`} className="font-semibold text-burgundy">Start a new order</Link>
        </p>
      ) : null}

      <section aria-labelledby="invoice-heading" className="grid gap-4 rounded-card border border-line bg-card p-6">
        <h2 id="invoice-heading" className="font-display text-xl text-burgundy">Order summary</h2>
        <ul className="grid gap-3 text-sm">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-4">
              <span className="text-ink">{item.productName} <span className="text-ink-muted">{item.variantLabel} × {item.quantity}</span></span>
              <span className="font-medium">{formatINR(item.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid gap-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd>{formatINR(order.subtotalPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Discount</dt><dd>- {formatINR(order.discountPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">GST</dt><dd>{formatINR(order.taxPaise)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{formatINR(order.totalPaise)}</dd></div>
        </dl>
        <p className="text-xs text-ink-muted">Tax invoice: available as a PDF once payment is confirmed.</p>
      </section>
    </div>
  );
}

/**
 * Progress steps derived from the payment state and order status already loaded for this page.
 * No status is inferred beyond those values.
 */
function timelineSteps(paymentKey: GuestPaymentStateKey, isPaid: boolean, orderStatus: string): TimelineStep[] {
  const failed = paymentKey === 'payment_failed' || paymentKey === 'payment_refused' || paymentKey === 'cancelled' || paymentKey === 'reservation_expired';
  const paymentLabel = isPaid
    ? 'Payment received'
    : paymentKey === 'cash_awaiting'
      ? 'Waiting for payment at the showroom'
      : failed
        ? 'Payment not completed'
        : 'Payment pending';
  const paymentState: TimelineStep['state'] = isPaid ? 'done' : failed ? 'attention' : 'current';
  const fulfilment = orderStatus.replace(/_/g, ' ').toLowerCase();
  return [
    { label: 'Order placed', detail: 'Your items are reserved while we process the order.', state: 'done' },
    { label: paymentLabel, detail: isPaid ? undefined : 'Shown here as soon as the showroom or provider confirms.', state: paymentState },
    {
      label: 'Order processing',
      detail: isPaid ? `Current status: ${fulfilment}` : 'Starts after payment is confirmed.',
      state: isPaid ? 'current' : 'pending',
    },
  ];
}
