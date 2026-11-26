import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { paginate } from '@/lib/reports/report-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import { gstByRate, invoiceRecords, refundTax } from '@/lib/services/reports';
import { Card, ExportBar, Pager, SectionNav, SimpleTable, rs } from '../report-views';
import { PrintButton } from '../report-shell';
import { PeriodLinks } from '../period-links';
import { pageOf, periodFrom, periodQuery, type PeriodParams } from '../period';

export const dynamic = 'force-dynamic';

const PATH = '/owner/reports/gst';

export default async function GstReportPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const owner = await requireOwnerPermission('reports_exports');
  const sp = await searchParams;
  const built = periodFrom(sp);
  if (!built.ok) return <EmptyState title="Choose a valid period" body={built.error} />;
  const range = built.range;
  const query = periodQuery(range);
  const [rates, refunds, invoices] = await Promise.all([
    gstByRate(owner.storeId, range),
    refundTax(owner.storeId, range),
    invoiceRecords(owner.storeId, range),
  ]);
  const taxable = rates.reduce((t, r) => t + r.taxablePaise, 0);
  const gst = rates.reduce((t, r) => t + r.gstPaise, 0);
  const invoicePage = paginate(invoices, pageOf(sp.page), 25);
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Reports" title="GST" description="Rate-wise sales, invoice-level tax and refund tax adjustments." actions={<PrintButton />} />
      <SectionNav current={PATH} />
      <PeriodLinks base={PATH} active={range.preset} from={range.fromDate} to={range.toDate} />
      <ExportBar query={query} items={[
        { type: 'gst-rates', label: 'GST by rate' },
        { type: 'invoices', label: 'Invoices' },
        { type: 'refund-tax', label: 'Refund tax' },
      ]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Taxable value" value={rs(taxable)} note="Sales in the selected period" />
        <Card label="GST collected" value={rs(gst)} note="Tax on sales, one figure per invoice" />
        <Card label="Refunds" value={rs(refunds.refundsPaise)} note="Refunds issued in the period" />
        <Card label="Estimated refund tax" value={rs(refunds.estimatedTaxPaise)} note="Pro rata estimate, not a filed figure" />
      </div>
      <div className="grid gap-1 rounded-card border border-line bg-cream p-4 text-sm text-ink">
        <p><strong>Scope of this report.</strong> Tax is shown as one figure per invoice for intrastate supply. CGST, SGST and IGST are not split, and place of supply is not recorded.</p>
        <p><strong>Purchase GST.</strong> Supplier invoices do not capture a tax field, so GST paid on purchases is not available in this report.</p>
      </div>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Sales by GST rate</h2>
        <SimpleTable
          columns={[{ label: 'GST rate', right: true }, { label: 'Lines', right: true }, { label: 'Taxable value', right: true }, { label: 'GST', right: true }, { label: 'Line totals', right: true }]}
          rows={rates.map((r) => [`${(r.rateBps / 100).toFixed(2)}%`, r.lines, rs(r.taxablePaise), rs(r.gstPaise), rs(r.lineTotalPaise)])}
          empty="No taxable sales in this period."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Invoice-level GST</h2>
        <SimpleTable
          columns={[{ label: 'Invoice' }, { label: 'Date' }, { label: 'Order' }, { label: 'Taxable', right: true }, { label: 'GST', right: true }, { label: 'Total', right: true }]}
          rows={invoicePage.items.map((i) => [i.invoiceNumber, i.invoiceDate, i.orderNumber, rs(i.taxablePaise), rs(i.taxPaise), rs(i.totalPaise)])}
          empty="No invoices in this period."
        />
        <Pager base={`${PATH}?${query}`} page={invoicePage.page} pages={invoicePage.pages} />
      </section>
    </div>
  );
}
