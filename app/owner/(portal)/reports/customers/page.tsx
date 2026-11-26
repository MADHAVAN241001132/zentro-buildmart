import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { paginate } from '@/lib/reports/report-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import { creditBalances, creditCollections, customerSales } from '@/lib/services/reports';
import { Card, ExportBar, Pager, SectionNav, SimpleTable, rs } from '../report-views';
import { PrintButton } from '../report-shell';
import { PeriodLinks } from '../period-links';
import { pageOf, periodFrom, periodQuery, type PeriodParams } from '../period';

export const dynamic = 'force-dynamic';

const PATH = '/owner/reports/customers';

export default async function CustomersReportPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const owner = await requireOwnerPermission('reports_exports');
  const sp = await searchParams;
  const built = periodFrom(sp);
  if (!built.ok) return <EmptyState title="Choose a valid period" body={built.error} />;
  const range = built.range;
  const query = periodQuery(range);
  const [customers, credit, collections] = await Promise.all([
    customerSales(owner.storeId, range),
    creditBalances(owner.storeId, range.toDate),
    creditCollections(owner.storeId, range),
  ]);
  const active = customers.filter((c) => c.ordersInPeriod > 0);
  const repeat = active.filter((c) => c.isRepeat).length;
  const sorted = [...active].sort((a, b) => b.valuePaise - a.valuePaise);
  const customerPage = paginate(sorted, pageOf(sp.page), 25);
  const creditSorted = [...credit].sort((a, b) => b.overduePaise - a.overduePaise || b.outstandingPaise - a.outstandingPaise);
  const outstanding = credit.reduce((t, c) => t + c.outstandingPaise, 0);
  const overdue = credit.reduce((t, c) => t + c.overduePaise, 0);
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Reports" title="Customers and credit" description="Customer sales, repeat customers, outstanding credit and collections." actions={<PrintButton />} />
      <SectionNav current={PATH} />
      <PeriodLinks base={PATH} active={range.preset} from={range.fromDate} to={range.toDate} />
      <ExportBar query={query} items={[
        { type: 'customers', label: 'Customers' },
        { type: 'credit', label: 'Credit balances' },
        { type: 'collections', label: 'Collections' },
      ]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Customers ordering" value={String(active.length)} note="Customers with orders in the period" />
        <Card label="Repeat customers" value={String(repeat)} note={`${active.length - repeat} first-time in the period`} />
        <Card label="Credit outstanding" value={rs(outstanding)} note="Balance at the end of the period" />
        <Card label="Credit overdue" value={rs(overdue)} note="Past due under first-in first-out allocation" />
      </div>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Customer-wise sales</h2>
        <SimpleTable
          columns={[{ label: 'Customer' }, { label: 'Mobile' }, { label: 'Orders', right: true }, { label: 'Value', right: true }, { label: 'Collected', right: true }, { label: 'Earlier orders', right: true }, { label: 'Type' }, { label: 'Last order' }]}
          rows={customerPage.items.map((c) => [c.customerId ? <Link className="text-burgundy underline" href={`/owner/reports/customers/${c.customerId}`}>{c.name}</Link> : c.name, c.mobile, c.ordersInPeriod, rs(c.valuePaise), rs(c.collectedPaise), c.ordersBefore, c.isRepeat ? 'Repeat' : 'New', c.lastOrderAt ? c.lastOrderAt.slice(0, 10) : '-'])}
          empty="No customer orders in this period."
        />
        <Pager base={`${PATH}?${query}`} page={customerPage.page} pages={customerPage.pages} />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Outstanding credit at period end</h2>
        <p className="text-xs text-ink-muted">Payments settle credit sales oldest due date first. Overdue means a credit sale past its due date with money still unpaid.</p>
        <SimpleTable
          columns={[{ label: 'Customer' }, { label: 'Mobile' }, { label: 'Balance', right: true }, { label: 'Outstanding', right: true }, { label: 'Overdue', right: true }, { label: 'Oldest unpaid due' }]}
          rows={creditSorted.map((c) => [c.name, c.mobile, rs(c.balancePaise), rs(c.outstandingPaise), rs(c.overduePaise), c.oldestUnpaidDue])}
          empty="No outstanding credit."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Credit collection history</h2>
        <SimpleTable
          columns={[{ label: 'Date' }, { label: 'Customer' }, { label: 'Amount', right: true }, { label: 'Note' }]}
          rows={collections.map((c) => [c.collectedOn, c.customerName, rs(c.amountPaise), c.note])}
          empty="No credit collections in this period."
        />
      </section>
    </div>
  );
}
