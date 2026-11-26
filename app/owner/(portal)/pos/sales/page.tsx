import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface SaleRow {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  total_paise: number;
}

export default async function PosSalesPage() {
  await requireOwnerPermission('pos_billing');
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('orders')
    .select('id, order_number, created_at, customer_name, payment_method, payment_status, order_status, total_paise')
    .eq('channel', 'pos')
    .order('created_at', { ascending: false })
    .limit(200);
  const sales = (data ?? []) as SaleRow[];

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Point of sale"
        title="Sales history"
        description="Placed POS sales. Held and cancelled bills are listed under Bills, not here."
        actions={<Link href="/owner/pos" className={buttonClass('secondary')}>Back to bills</Link>}
      />
      {sales.length === 0 ? (
        <EmptyState title="No POS sales yet" body="Placed bills appear here with their invoice." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link href={`/owner/pos/sales/${sale.id}`} className="font-medium text-burgundy underline-offset-2 hover:underline">
                      {sale.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{sale.customer_name}</td>
                  <td className="px-4 py-3 capitalize">{sale.payment_method}</td>
                  <td className="px-4 py-3"><StatusBadge status={sale.payment_status} /></td>
                  <td className="px-4 py-3"><StatusBadge status={sale.order_status} /></td>
                  <td className="px-4 py-3 text-right">{formatINR(sale.total_paise)}</td>
                  <td className="px-4 py-3 text-ink-muted">{new Date(sale.created_at).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
