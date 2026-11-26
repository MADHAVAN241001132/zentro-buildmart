import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { confirmNotSentAction, reconcileRefundAction, retryRefundAction } from './actions';
import { RefundForm, type RefundableLine } from './refund-form';

export const dynamic = 'force-dynamic';

interface ItemRow {
  id: string;
  product_name_snapshot: string;
  variant_label_snapshot: string;
  quantity: number;
  line_total_paise: number;
  refund_items: { quantity: number; amount_paise: number; refunds: { status: string } | { status: string }[] | null }[];
}

interface RefundRow {
  id: string;
  amount_paise: number;
  status: string;
  refund_method: string | null;
  refund_type: string | null;
  reason: string;
  created_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  gateway_state: string | null;
  gateway_error: string | null;
}

const LIVE = new Set(['requested', 'processing', 'succeeded']);

function liveRefundedOf(item: ItemRow): { qty: number; paise: number } {
  let qty = 0;
  let paise = 0;
  for (const ri of item.refund_items ?? []) {
    const parent = Array.isArray(ri.refunds) ? ri.refunds[0] : ri.refunds;
    if (parent && LIVE.has(parent.status)) {
      qty += Number(ri.quantity);
      paise += Number(ri.amount_paise);
    }
  }
  return { qty, paise };
}

export default async function RefundPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const owner = await requireOwnerPermission('refund_management');
  const { orderId } = await params;
  if (!uuidSchema.safeParse(orderId).success) notFound();
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from('orders')
    .select(
      `id, order_number, channel, payment_method, payment_status, order_status, total_paise, customer_name,
       order_items(id, product_name_snapshot, variant_label_snapshot, quantity, line_total_paise,
         refund_items(quantity, amount_paise, refunds(status)))`,
    )
    .eq('id', orderId)
    .eq('store_id', owner.storeId)
    .maybeSingle();
  if (!order) notFound();

  const { data: refundRows } = await supabase
    .from('refunds')
    .select('id, amount_paise, status, refund_method, refund_type, reason, created_at, processed_at, failure_reason, gateway_state, gateway_error')
    .eq('order_id', orderId)
    .eq('store_id', owner.storeId)
    .order('created_at', { ascending: false });
  const refunds = (refundRows ?? []) as RefundRow[];

  const items = (order.order_items ?? []) as unknown as ItemRow[];
  const lines: RefundableLine[] = items.map((item) => {
    const live = liveRefundedOf(item);
    return {
      id: item.id,
      name: item.product_name_snapshot,
      variantLabel: item.variant_label_snapshot,
      remaining: Math.max(0, Number(item.quantity) - live.qty),
      lineTotalPaise: Number(item.line_total_paise),
      refundedPaise: live.paise,
    };
  });

  const refundedPaise = refunds.filter((r) => LIVE.has(r.status)).reduce((sum, r) => sum + Number(r.amount_paise), 0);
  const notPaid = !['PAID', 'PARTIALLY_REFUNDED'].includes(order.payment_status as string) && order.payment_method !== 'credit';
  const disabledReason =
    order.order_status === 'CANCELLED'
        ? 'This order is cancelled. Cancelled orders are not refunded here.'
        : notPaid
          ? 'Only paid orders can be refunded.'
          : lines.every((l) => l.remaining === 0)
            ? 'Every unit on this order has already been returned.'
            : null;

  // Each form render gets a fresh key. A double submit of the same form reuses it, so the database records one refund.
  const requestKey = crypto.randomUUID();

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Refunds"
        title={`Refund for order ${order.order_number}`}
        description={`${order.customer_name} · ${order.channel === 'pos' ? 'Point of sale' : 'Online order'} · refunded ${formatINR(refundedPaise)} of ${formatINR(Number(order.total_paise))}`}
        actions={<StatusBadge status={order.payment_status as string} />}
      />
      {sp.notice ? <p role="status" className="text-sm text-ink">{sp.notice}</p> : null}
      <p className="text-sm">
        <Link href={order.channel === 'pos' ? `/owner/pos/sales/${order.id}` : '/owner/orders'} className="font-semibold text-burgundy">
          ← Back to the order
        </Link>
      </p>

      <section className="grid gap-3">
        <h2 className="font-display text-xl text-burgundy">Return items</h2>
        <RefundForm orderId={orderId} requestKey={requestKey} lines={lines} disabledReason={disabledReason} />
        <p className="text-xs text-ink-muted">
          Stock returns to the shelf only when a refund succeeds. A damaged return is counted as damaged stock and is not sold again.
          A refund of the whole order also releases any coupon used on it.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-xl text-burgundy">Refund history</h2>
        {refunds.length === 0 ? (
          <p className="text-sm text-ink-muted">No refunds recorded on this order.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Recorded</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => (
                  <tr key={refund.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">{new Date(refund.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                    <td className="px-3 py-2">{formatINR(Number(refund.amount_paise))}</td>
                    <td className="px-3 py-2">{refund.refund_method ?? '—'}</td>
                    <td className="px-3 py-2">{refund.refund_type ?? '—'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={refund.status} />
                      {refund.failure_reason ? <div className="text-xs text-danger">{refund.failure_reason}</div> : null}
                    </td>
                    <td className="px-3 py-2">{refund.reason}</td>
                    <td className="px-3 py-2">
                      {refund.refund_method === 'online' && refund.status === 'requested' ? (
                        refund.gateway_state === 'ambiguous' ? (
                          <div className="grid gap-2">
                            <p className="text-xs text-ink-muted">
                              Razorpay did not answer clearly. This refund is not sent again automatically.
                              {refund.gateway_error ? ` (${refund.gateway_error})` : ''}
                            </p>
                            <form action={reconcileRefundAction}>
                              <input type="hidden" name="orderId" value={orderId} />
                              <input type="hidden" name="refundId" value={refund.id} />
                              <button type="submit" className="text-xs font-semibold text-burgundy underline">
                                Check with Razorpay
                              </button>
                            </form>
                            <form action={confirmNotSentAction} className="grid gap-1">
                              <input type="hidden" name="orderId" value={orderId} />
                              <input type="hidden" name="refundId" value={refund.id} />
                              <label className="grid gap-1 text-xs">
                                Reason for confirming it was not sent
                                <input name="reason" minLength={3} maxLength={200} required className="rounded-control border border-line bg-card px-2 py-1 text-xs" />
                              </label>
                              <label className="flex items-start gap-2 text-xs">
                                <input type="checkbox" name="dashboardChecked" value="yes" required className="mt-0.5" />
                                <span>I checked the Razorpay dashboard for this payment and found no refund for this request. An empty list is not proof on its own; this confirmation is my decision.</span>
                              </label>
                              <button type="submit" className="justify-self-start text-xs font-semibold text-danger underline">
                                Confirm not sent and release units
                              </button>
                            </form>
                          </div>
                        ) : refund.gateway_state === 'none' ? (
                          <form action={retryRefundAction}>
                            <input type="hidden" name="orderId" value={orderId} />
                            <input type="hidden" name="refundId" value={refund.id} />
                            <button type="submit" className="text-xs font-semibold text-burgundy underline">
                              Send to Razorpay
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-ink-muted">Sent. Waiting for Razorpay.</span>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
