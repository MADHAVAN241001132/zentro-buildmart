import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RefundRequestForm, type RefundableItem } from '@/components/guest/refund-request-form';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { getGuestOrder } from '@/lib/services/checkout';
import { readGuestSession } from '@/lib/services/guest';
import {
  GUEST_REFUND_STATUS_LABEL,
  guestRefundRequests,
  guestRemainingLines,
  REFUND_REASON_CODES,
  REFUND_REASON_LABEL,
} from '@/lib/services/refund-requests';
import { getStoreBySlug } from '@/lib/services/storefront';
import { submitGuestRefundAction, withdrawGuestRefundAction } from './actions';
import { addRefundPhotoAction, removeRefundPhotoAction } from './photo-actions';
import { RefundPhotoPanel } from '@/components/guest/refund-photo-panel';
import { guestRefundPhotoLinks } from '@/lib/services/guest-photos';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

const REQUEST_STATUS_LABEL: Record<string, string> = {
  submitted: 'Waiting for the store',
  approved: 'Approved',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
};

export default async function GuestRefundPage({
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
  const order = await getGuestOrder(store.id, session.id, orderNumber);
  if (!order) notFound();

  const [lines, requests] = await Promise.all([
    guestRemainingLines({ storeId: store.id, sessionId: session.id, orderId: order.orderId }),
    guestRefundRequests({ storeId: store.id, sessionId: session.id, orderId: order.orderId }),
  ]);

  const paidOk = order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED';
  const cancelled = order.orderStatus === 'CANCELLED';
  const paidAt = new Date(order.paidAt ?? order.createdAt).getTime();
  const withinWindow = Date.now() - paidAt <= WINDOW_DAYS * 86_400_000;
  const open = requests.find((r) => r.status === 'submitted') ?? null;
  const photos = open ? await guestRefundPhotoLinks(store.id, session.id, open.id) : [];
  const refundable: RefundableItem[] = lines.filter((l) => l.remaining > 0).map((l) => ({
    orderItemId: l.orderItemId,
    name: l.name,
    variantLabel: l.variantLabel,
    remaining: l.remaining,
    lineTotalPaise: l.lineTotalPaise,
  }));

  let explanation: string | null = null;
  if (cancelled) explanation = 'This order was cancelled, so it cannot be refunded here.';
  else if (!paidOk) explanation = 'Only paid orders can be refunded. Complete the payment first.';
  else if (!withinWindow) explanation = `Refund requests must be made within ${WINDOW_DAYS} days of payment.`;
  else if (refundable.length === 0) explanation = 'Every item on this order has already been returned or is awaiting a decision.';
  else if (open) explanation = 'You already have a refund request for this order that is waiting for the store.';

  const canRequest = explanation === null;
  const submit = submitGuestRefundAction.bind(null, storeSlug, orderNumber);
  const withdraw = withdrawGuestRefundAction.bind(null, storeSlug, orderNumber);
  const reasonOptions = REFUND_REASON_CODES.map((code) => ({ value: code, label: REFUND_REASON_LABEL[code] }));

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Order {order.orderNumber}</p>
        <h1 className="font-display text-3xl text-burgundy">Refunds</h1>
        <p className="text-sm text-ink-muted">
          Ask the store to refund items from this order. The store reviews every request. Nothing is refunded until it is approved.
        </p>
        <p className="text-sm">
          <Link href={`/store/${storeSlug}/orders/${order.orderNumber}`} className="font-semibold text-burgundy">
            ← Back to the order
          </Link>
        </p>
      </header>

      {sp.notice ? <p role="status" className="rounded-control border border-line bg-card p-3 text-sm text-ink">{sp.notice}</p> : null}

      {canRequest ? (
        <section className="grid gap-3">
          <h2 className="font-display text-xl text-burgundy">Request a refund</h2>
          <RefundRequestForm submit={submit} items={refundable} reasonOptions={reasonOptions} />
        </section>
      ) : (
        <p className="rounded-card border border-line bg-card p-5 text-sm text-ink-muted">{explanation}</p>
      )}

      {open ? (
        <section className="grid gap-2 rounded-card border border-gold/40 bg-card p-5 text-sm">
          <p className="font-semibold text-ink">Waiting for the store</p>
          <p className="text-ink-muted">Sent {new Date(open.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.</p>
          <form action={withdraw}>
            <input type="hidden" name="requestId" value={open.id} />
            <button type="submit" className="text-sm font-semibold text-burgundy underline">Withdraw this request</button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-display text-xl text-burgundy">Your refund history</h2>
        {open ? (
          <RefundPhotoPanel
            photos={photos}
            canEdit
            addAction={addRefundPhotoAction.bind(null, storeSlug, orderNumber, open.id)}
            removeAction={removeRefundPhotoAction.bind(null, storeSlug, orderNumber)}
          />
        ) : null}
        {requests.length === 0 ? (
          <p className="text-sm text-ink-muted">You have not asked for a refund on this order.</p>
        ) : (
          requests.map((request) => (
            <article key={request.id} className="grid gap-2 rounded-card border border-line bg-card p-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{REQUEST_STATUS_LABEL[request.status] ?? request.status}</span>
                <span className="text-xs text-ink-muted">{new Date(request.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              </div>
              <ul className="grid gap-1 text-ink-muted">
                {request.lines.map((line) => (
                  <li key={`${line.name}-${line.variantLabel}`}>{line.quantity} × {line.name}{line.variantLabel ? ` (${line.variantLabel})` : ''}</li>
                ))}
              </ul>
              <p className="text-ink-muted">Reason: {REFUND_REASON_LABEL[request.reasonCode as keyof typeof REFUND_REASON_LABEL] ?? 'Other'} — {request.reason}</p>
              {request.decisionNote ? <p className="text-ink">Store reply: {request.decisionNote}</p> : null}
              {request.refundStatus ? (
                <p className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={request.refundStatus} />
                  <span className="text-ink">
                    {GUEST_REFUND_STATUS_LABEL[request.refundStatus] ?? 'In progress'}
                    {request.refundAmountPaise !== null ? ` · ${formatINR(request.refundAmountPaise)}` : ''}
                  </span>
                </p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
