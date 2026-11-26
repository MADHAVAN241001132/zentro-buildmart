import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatPlainInr } from '@/lib/invoices/invoice-math';
import { QUOTE_STATUS_LABEL } from '@/lib/quotations/quotation-input';
import { requireOwnerPermission } from '@/lib/services/owner';
import { ownerListQuotations } from '@/lib/services/quotations';

export const dynamic = 'force-dynamic';

const TABS = ['', 'REQUESTED', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'];

export default async function OwnerQuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const owner = await requireOwnerPermission('quotations');
  const { status } = await searchParams;
  const active = TABS.includes(status ?? '') ? (status ?? '') : '';
  const { rows, counts } = await ownerListQuotations(owner.storeId, active || null);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Sales"
        title="Quotations"
        description="Customer requests, drafts and sent quotations. Accepted quotations convert into orders."
        actions={<Link href="/owner/quotations/new" className={buttonClass('primary')}>New quotation</Link>}
      />
      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab || 'all'}
            href={tab ? `/owner/quotations?status=${tab}` : '/owner/quotations'}
            className={`rounded-control px-3 py-1.5 ${active === tab ? 'bg-burgundy text-cream' : 'border border-line text-ink'}`}
          >
            {tab ? QUOTE_STATUS_LABEL[tab] ?? tab : 'All'} {tab ? `(${counts[tab] ?? 0})` : ''}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No quotations here" body="Requests from customers appear as Requested. New quotations start as drafts." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2">Number</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">Valid until</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-2"><Link className="text-burgundy underline" href={`/owner/quotations/${row.id}`}>{row.number}</Link></td>
                  <td className="px-4 py-2">{row.customerName}</td>
                  <td className="px-4 py-2">{row.projectName ?? '-'}</td>
                  <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-2 text-right">{row.totalPaise > 0 ? `Rs. ${formatPlainInr(row.totalPaise)}` : 'Not priced'}</td>
                  <td className="px-4 py-2">{row.validUntil ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
