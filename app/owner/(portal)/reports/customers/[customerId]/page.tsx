import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { requireOwnerPermission } from '@/lib/services/owner';
import { customerOrders } from '@/lib/services/reports';
import { SectionNav, SimpleTable, rs } from '../../report-views';
import { PrintButton } from '../../report-shell';
import { pageOf, type PeriodParams } from '../../period';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

export default async function CustomerOrdersPage({ params, searchParams }: { params: Promise<{ customerId: string }>; searchParams: Promise<PeriodParams> }) {
  const owner = await requireOwnerPermission('reports_exports');
  const { customerId } = await params;
  if (!UUID.test(customerId)) notFound();
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const { rows, hasNext } = await customerOrders(owner.storeId, customerId, page, PAGE_SIZE);
  const back = '/owner/reports/customers';
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Reports" title="Customer orders" description="All orders for one customer, newest first, across every period." actions={<PrintButton />} />
      <SectionNav current={back} />
      <p className="text-sm"><Link className="text-burgundy underline" href={back}>Back to customers and credit</Link></p>
      <SimpleTable
        columns={[{ label: 'Order' }, { label: 'Placed' }, { label: 'Channel' }, { label: 'Payment' }, { label: 'Payment status' }, { label: 'Order status' }, { label: 'Total', right: true }]}
        rows={rows.map((o) => [o.orderNumber, o.createdAt.slice(0, 16).replace('T', ' '), o.channel, o.paymentMethod, o.paymentStatus, o.orderStatus, rs(o.totalPaise)])}
        empty="No orders for this customer."
      />
      <nav className="flex items-center gap-3 text-sm">
        {page > 1 ? <Link className="text-burgundy underline" href={`/owner/reports/customers/${customerId}?page=${page - 1}`}>Previous</Link> : <span className="text-ink-muted">Previous</span>}
        <span>Page {page}</span>
        {hasNext ? <Link className="text-burgundy underline" href={`/owner/reports/customers/${customerId}?page=${page + 1}`}>Next</Link> : <span className="text-ink-muted">Next</span>}
      </nav>
    </div>
  );
}
