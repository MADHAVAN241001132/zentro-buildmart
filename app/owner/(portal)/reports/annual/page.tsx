import { PageHeader } from '@/components/owner/page-header';
import type { ReportRange } from '@/lib/reports/report-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import { reportTrend } from '@/lib/services/reports';
import { Card, ExportBar, SectionNav, SimpleTable, TrendChart, rs } from '../report-views';
import { PrintButton } from '../report-shell';

export const dynamic = 'force-dynamic';

const PATH = '/owner/reports/annual';

/** Annual view covers every year on record, matching the annual export. */
const ALL_YEARS: ReportRange = {
  preset: 'custom',
  fromDate: '2000-01-01',
  toDate: '2099-12-31',
  startIso: '2000-01-01T00:00:00Z',
  endIso: '2100-01-01T00:00:00Z',
};

export default async function AnnualReportPage() {
  const owner = await requireOwnerPermission('reports_exports');
  const years = await reportTrend(owner.storeId, ALL_YEARS, 'year');
  const sum = (key: 'orderValuePaise' | 'collectedPaise' | 'refundsPaise' | 'taxablePaise') =>
    years.reduce((t, y) => t + y[key], 0);
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Reports" title="Annual sales" description="Sales by calendar year across all years on record." actions={<PrintButton />} />
      <SectionNav current={PATH} />
      <ExportBar query="" items={[{ type: 'annual', label: 'Annual sales' }]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Order value, all years" value={rs(sum('orderValuePaise'))} note="Gross order value" />
        <Card label="Taxable value, all years" value={rs(sum('taxablePaise'))} note="Before GST" />
        <Card label="Collected, all years" value={rs(sum('collectedPaise'))} note="Payments received" />
        <Card label="Refunds, all years" value={rs(sum('refundsPaise'))} note="Refunds issued" />
      </div>
      <TrendChart points={years} label="Order value by year" />
      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Year-wise figures</h2>
        <SimpleTable
          columns={[{ label: 'Year starting' }, { label: 'Orders', right: true }, { label: 'Order value', right: true }, { label: 'Taxable', right: true }, { label: 'Collected', right: true }, { label: 'Credit', right: true }, { label: 'Online', right: true }, { label: 'POS', right: true }, { label: 'Refunds', right: true }]}
          rows={years.map((y) => [y.bucketStart, y.orders, rs(y.orderValuePaise), rs(y.taxablePaise), rs(y.collectedPaise), rs(y.creditPaise), rs(y.onlineValuePaise), rs(y.posValuePaise), rs(y.refundsPaise)])}
          empty="No sales on record yet."
        />
      </section>
    </div>
  );
}
