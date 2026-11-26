import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { ownerListRefundRequests, REFUND_REASON_LABEL, type RefundReasonCode } from '@/lib/services/refund-requests';

export const dynamic = 'force-dynamic';

const FILTERS = ['submitted', 'approved', 'rejected', 'withdrawn', 'ALL'] as const;

export default async function RefundRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const owner = await requireOwnerPermission('refund_management');
  const sp = await searchParams;
  const status = (FILTERS as readonly string[]).includes(sp.status ?? '') ? (sp.status as string) : 'submitted';
  const rows = await ownerListRefundRequests(owner.storeId, status);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Orders"
        title="Refund requests"
        description="Guest requests for refunds of items. Approving creates the refund through the same process as every other refund. Nothing is refunded until a request is approved."
      />
      <nav className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'submitted' ? '/owner/refund-requests' : `/owner/refund-requests?status=${f}`}
            className={`rounded-control border px-3 py-1.5 ${status === f ? 'border-burgundy bg-burgundy text-cream' : 'border-line bg-card text-ink'}`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No refund requests here.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Order total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-4 py-3 font-medium">{row.orderNumber}</td>
                  <td className="px-4 py-3">{row.customerName}</td>
                  <td className="px-4 py-3">{REFUND_REASON_LABEL[row.reasonCode as RefundReasonCode] ?? 'Other'}</td>
                  <td className="px-4 py-3">{formatINR(row.orderTotalPaise)}</td>
                  <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3">
                    <Link href={`/owner/refund-requests/${row.id}`} className="font-semibold text-burgundy underline">Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
