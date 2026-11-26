import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdvanceOrderForm } from './advance-form';

export const dynamic = 'force-dynamic';

const FILTERS = ['ALL', 'PAID', 'CASH_PENDING', 'PENDING', 'CANCELLED'] as const;
const NEXT_LABEL: Record<string, string> = {
  CONFIRMED: 'Start processing',
  PROCESSING: 'Mark packed',
  PACKED: 'Ready for pickup',
  READY_FOR_PICKUP: 'Mark collected',
};

export default async function OwnerOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const owner = await requireOwnerPermission('order_management');
  const { status } = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(status ?? '') ? (status as string) : 'ALL';
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('orders')
    .select('id, order_number, customer_name, customer_mobile, payment_method, payment_status, order_status, total_paise, created_at')
    .eq('store_id', owner.storeId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (filter !== 'ALL') query = query.eq('payment_status', filter);
  const { data, error } = await query;
  const rows = (data ?? []) as {
    id: string;
    order_number: string;
    customer_name: string;
    customer_mobile: string | null;
    payment_method: string;
    payment_status: string;
    order_status: string;
    total_paise: number;
    created_at: string;
  }[];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Latest 100</p>
          <h1 className="font-display text-3xl text-burgundy">Orders</h1>
        </div>
        <nav aria-label="Filter orders" className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === 'ALL' ? '/owner/orders' : `/owner/orders?status=${f}`}
              aria-current={f === filter ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 ${f === filter ? 'border-burgundy bg-burgundy text-cream' : 'border-line bg-card text-ink'}`}
            >
              {f.replace(/_/g, ' ').toLowerCase()}
            </Link>
          ))}
        </nav>
      </header>

      {error ? (
        <EmptyState title="Could not load orders" body="Refresh the page to try again." />
      ) : rows.length === 0 ? (
        <EmptyState title="No orders" body="Orders placed by customers will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3 font-medium text-ink">{row.order_number}<div className="text-xs text-ink-muted">{new Date(row.created_at).toLocaleString('en-IN')}</div></td>
                  <td className="px-4 py-3">{row.customer_name}<div className="text-xs text-ink-muted">{row.customer_mobile ?? ''}</div></td>
                  <td className="px-4 py-3 font-medium">{formatINR(row.total_paise)}</td>
                  <td className="px-4 py-3"><StatusBadge status={row.payment_status} /><div className="mt-1 text-xs text-ink-muted">{row.payment_method}</div></td>
                  <td className="px-4 py-3"><StatusBadge status={row.order_status} /></td>
                  <td className="px-4 py-3">
                    {NEXT_LABEL[row.order_status] && row.payment_status === 'PAID' ? (
                      <AdvanceOrderForm orderId={row.id} currentStatus={row.order_status} nextLabel={NEXT_LABEL[row.order_status] ?? 'Advance'} />
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                    {(row.payment_status === 'PAID' || row.payment_status === 'PARTIALLY_REFUNDED') && row.order_status !== 'CANCELLED' ? (
                      <div className="mt-2">
                        <Link href={`/owner/orders/${row.id}/refund`} className="text-xs font-semibold text-burgundy underline">
                          Refund
                        </Link>
                      </div>
                    ) : null}
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
