import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { ownerRefundRequestDetail, REFUND_REASON_LABEL, type RefundReasonCode } from '@/lib/services/refund-requests';
import { ownerRefundPhotoLinks } from '@/lib/services/guest-photos';
import { uuidSchema } from '@/lib/validation';
import { approveRefundRequestAction, rejectRefundRequestAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function RefundRequestReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const owner = await requireOwnerPermission('refund_management');
  const { requestId } = await params;
  if (!uuidSchema.safeParse(requestId).success) notFound();
  const sp = await searchParams;
  const request = await ownerRefundRequestDetail(owner.storeId, requestId);
  if (!request) notFound();
  const photos = await ownerRefundPhotoLinks(owner.storeId, request.id);

  const decidable = request.status === 'submitted'; // the page gate requires refund management

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Refund request"
        title={`Request for order ${request.orderNumber}`}
        description={`${request.customerName}${request.customerMobile ? ` · ${request.customerMobile}` : ''} · ${request.paymentMethod} · ${request.paymentStatus}`}
        actions={<StatusBadge status={request.status} />}
      />
      {sp.notice ? <p role="status" className="text-sm text-ink">{sp.notice}</p> : null}
      <p className="text-sm">
        <Link href="/owner/refund-requests" className="font-semibold text-burgundy">← All refund requests</Link>
        {' · '}
        <Link href={`/owner/orders/${request.orderId}/refund`} className="font-semibold text-burgundy">Refund history for this order</Link>
      </p>

      <section className="grid gap-2 rounded-card border border-line bg-card p-6 text-sm">
        <p><span className="text-ink-muted">Reason: </span>{REFUND_REASON_LABEL[request.reasonCode as RefundReasonCode] ?? 'Other'}</p>
        <p className="whitespace-pre-line text-ink">{request.reason}</p>
        {request.decisionNote ? <p><span className="text-ink-muted">Store reply: </span>{request.decisionNote}</p> : null}
      </section>

      {photos.length > 0 ? (
        <section className="grid gap-3 rounded-card border border-line bg-card p-6 text-sm">
          <h2 className="font-display text-xl text-burgundy">Customer photographs</h2>
          <p className="text-xs text-ink-muted">Links expire after five minutes. Open the request again to refresh them.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="Customer refund photograph" loading="lazy" className="aspect-square w-full rounded-control object-cover" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {decidable ? (
        <form action={approveRefundRequestAction} className="grid gap-4 rounded-card border border-line bg-card p-6">
          <input type="hidden" name="requestId" value={request.id} />
          <h2 className="font-display text-xl text-burgundy">Approve</h2>
          <p className="text-sm text-ink-muted">Choose the condition of each returned item. Damaged items are counted as damaged and are not sold again.</p>
          {request.lines.map((line) => (
            <label key={line.orderItemId} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>{line.quantity} × {line.name}{line.variantLabel ? ` (${line.variantLabel})` : ''}</span>
              <select name={`cond:${line.orderItemId}`} defaultValue="restock" className="rounded-control border border-line bg-card px-3 py-2">
                <option value="restock">Back to stock</option>
                <option value="damaged">Damaged</option>
              </select>
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            Note to the customer (optional)
            <input name="note" maxLength={500} className="rounded-control border border-line bg-card px-3 py-2" />
          </label>
          <p className="text-xs text-ink-muted">
            Approval refunds the items through the standard refund process. Stock and the order update as for any refund.
          </p>
          <div><Button type="submit">Approve and refund</Button></div>
        </form>
      ) : null}

      {decidable ? (
        <form action={rejectRefundRequestAction} className="grid gap-3 rounded-card border border-line bg-card p-6">
          <input type="hidden" name="requestId" value={request.id} />
          <h2 className="font-display text-xl text-burgundy">Reject</h2>
          <label className="grid gap-1 text-sm">
            Reason the customer will see (required)
            <textarea name="note" required minLength={3} maxLength={500} rows={3} className="rounded-control border border-line bg-card px-3 py-2" />
          </label>
          <div><Button type="submit" variant="secondary">Reject request</Button></div>
        </form>
      ) : null}

      {!decidable ? (
        <p className="text-sm text-ink-muted">
          This request has already been decided.
        </p>
      ) : null}

      <section className="grid gap-2 text-sm">
        <h2 className="font-display text-xl text-burgundy">Items requested</h2>
        <ul className="grid gap-1">
          {request.lines.map((line) => (
            <li key={line.orderItemId}>{line.quantity} × {line.name}{line.variantLabel ? ` (${line.variantLabel})` : ''} · line {formatINR(line.lineTotalPaise)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
