import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface BillRow {
  id: string;
  bill_reference: string;
  status: string;
  note: string | null;
  created_at: string;
  customers: { full_name: string } | { full_name: string }[] | null;
}

export default async function PosPage() {
  await requireOwnerPermission('pos_billing');
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('pos_bills')
    .select('id, bill_reference, status, note, created_at, customers(full_name)')
    .in('status', ['HELD', 'AWAITING_PAYMENT'])
    .order('created_at', { ascending: false })
    .limit(100);
  const bills = (data ?? []) as BillRow[];

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Point of sale"
        title="Bills"
        description="Held bills do not move stock and are not counted as sales. Placing a bill takes payment."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/owner/pos/new" className={buttonClass('primary')}>New bill</Link>
            <Link href="/owner/pos/sales" className={buttonClass('secondary')}>Sales history</Link>
          </div>
        }
      />
      {bills.length === 0 ? (
        <EmptyState title="No open bills" body="Start a new bill to scan or search products. Held bills stay here until they are placed or cancelled." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Opened</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const customer = Array.isArray(bill.customers) ? bill.customers[0] : bill.customers;
                return (
                  <tr key={bill.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link href={`/owner/pos/${bill.id}`} className="font-medium text-burgundy underline-offset-2 hover:underline">
                        {bill.bill_reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{customer?.full_name ?? 'Walk-in customer'}</td>
                    <td className="px-4 py-3 text-ink-muted">{bill.note ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={bill.status} /></td>
                    <td className="px-4 py-3 text-ink-muted">{new Date(bill.created_at).toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
