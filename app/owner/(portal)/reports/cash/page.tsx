import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { requireOwnerPermission } from '@/lib/services/owner';
import { cashDays, cashMovementTotals } from '@/lib/services/reports';
import { Card, ExportBar, SectionNav, SimpleTable, rs } from '../report-views';
import { PrintButton } from '../report-shell';
import { PeriodLinks } from '../period-links';
import { periodFrom, periodQuery, type PeriodParams } from '../period';

export const dynamic = 'force-dynamic';

const PATH = '/owner/reports/cash';

export default async function CashReportPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const owner = await requireOwnerPermission('reports_exports');
  const sp = await searchParams;
  const built = periodFrom(sp);
  if (!built.ok) return <EmptyState title="Choose a valid period" body={built.error} />;
  const range = built.range;
  const query = periodQuery(range);
  const [days, movements] = await Promise.all([cashDays(owner.storeId, range), cashMovementTotals(owner.storeId, range)]);
  const shortage = days.reduce((t, d) => t + d.shortagePaise, 0);
  const excess = days.reduce((t, d) => t + d.excessPaise, 0);
  const cashSales = days.reduce((t, d) => t + d.cashSalesPaise, 0);
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Reports" title="Cash and reconciliation" description="Daily cash movement, expected against actual closing cash, shortages and excesses." actions={<PrintButton />} />
      <SectionNav current={PATH} />
      <PeriodLinks base={PATH} active={range.preset} from={range.fromDate} to={range.toDate} />
      <ExportBar query={query} items={[
        { type: 'cash-days', label: 'Daily cash' },
        { type: 'cash-movements', label: 'Cash movements' },
      ]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Cash sales" value={rs(cashSales)} note="Cash sales on closed days" />
        <Card label="Shortages" value={rs(shortage)} note="Sum of days closed below expected" />
        <Card label="Excesses" value={rs(excess)} note="Sum of days closed above expected" />
        <Card label="Closed days" value={String(days.length)} note="Only closed days are reconciled" />
      </div>
      <p className="text-xs text-ink-muted">Difference is actual closing cash minus expected closing cash. A negative difference is a shortage; a positive one is an excess. Days that are still open are not included.</p>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Daily reconciliation</h2>
        <SimpleTable
          columns={[
            { label: 'Date' }, { label: 'Opening', right: true }, { label: 'Cash sales', right: true }, { label: 'Refunds', right: true },
            { label: 'Expenses', right: true }, { label: 'Deposits', right: true }, { label: 'Withdrawals', right: true },
            { label: 'Manual in', right: true }, { label: 'Manual out', right: true }, { label: 'Expected', right: true },
            { label: 'Actual', right: true }, { label: 'Difference', right: true }, { label: 'Shortage', right: true }, { label: 'Excess', right: true },
          ]}
          rows={days.map((d) => [
            d.businessDate, rs(d.openingPaise), rs(d.cashSalesPaise), rs(d.cashRefundsPaise), rs(d.cashExpensesPaise),
            rs(d.depositsPaise), rs(d.withdrawalsPaise), rs(d.manualInPaise), rs(d.manualOutPaise), rs(d.expectedPaise),
            rs(d.actualPaise), rs(d.differencePaise), rs(d.shortagePaise), rs(d.excessPaise),
          ])}
          empty="No closed cash days in this period."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Cash movements by type</h2>
        <SimpleTable
          columns={[{ label: 'Movement type' }, { label: 'Count', right: true }, { label: 'Amount', right: true }]}
          rows={movements.map((m) => [m.type, m.count, rs(m.amountPaise)])}
          empty="No cash movements in this period."
        />
      </section>
    </div>
  );
}
