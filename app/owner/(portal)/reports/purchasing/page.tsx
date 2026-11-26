import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { paginate } from '@/lib/reports/report-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import { goodsReceipts, openSupplierInvoices, purchaseOrders, supplierPayments, supplierSummary } from '@/lib/services/reports';
import { Card, ExportBar, Pager, SectionNav, SimpleTable, rs } from '../report-views';
import { PrintButton } from '../report-shell';
import { PeriodLinks } from '../period-links';
import { pageOf, periodFrom, periodQuery, type PeriodParams } from '../period';

export const dynamic = 'force-dynamic';

const PATH = '/owner/reports/purchasing';

export default async function PurchasingReportPage({ searchParams }: { searchParams: Promise<PeriodParams & { open?: string }> }) {
  const owner = await requireOwnerPermission('reports_exports');
  const sp = await searchParams;
  const built = periodFrom(sp);
  if (!built.ok) return <EmptyState title="Choose a valid period" body={built.error} />;
  const range = built.range;
  const openOnly = sp.open === '1';
  const query = periodQuery(range);
  const [suppliers, orders, receipts, payments, balances] = await Promise.all([
    supplierSummary(owner.storeId, range),
    purchaseOrders(owner.storeId, range, openOnly),
    goodsReceipts(owner.storeId, range),
    supplierPayments(owner.storeId, range),
    openSupplierInvoices(owner.storeId, range.toDate),
  ]);
  const orderPage = paginate(orders, pageOf(sp.page), 25);
  const totals = suppliers.reduce((t, s) => ({ po: t.po + s.poValuePaise, paid: t.paid + s.paidPaise, out: t.out + s.outstandingPaise }), { po: 0, paid: 0, out: 0 });
  const overdue = balances.reduce((t, b) => (b.daysOverdue > 0 ? t + b.outstandingPaise : t), 0);
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Reports" title="Purchasing and suppliers" description="Supplier purchases, purchase orders, goods receipts, payments and open balances." actions={<PrintButton />} />
      <SectionNav current={PATH} />
      <PeriodLinks base={PATH} active={range.preset} from={range.fromDate} to={range.toDate} />
      <ExportBar query={query} items={[
        { type: 'suppliers', label: 'Suppliers' },
        { type: 'purchase-orders', label: 'Purchase orders' },
        { type: 'goods-receipts', label: 'Goods receipts' },
        { type: 'supplier-payments', label: 'Payments' },
        { type: 'open-invoices', label: 'Open invoices' },
      ]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Purchase order value" value={rs(totals.po)} note="Orders in the selected period" />
        <Card label="Paid to suppliers" value={rs(totals.paid)} note="Payments in the selected period" />
        <Card label="Supplier outstanding" value={rs(totals.out)} note="Balance at the end of the period" />
        <Card label="Overdue supplier invoices" value={rs(overdue)} note="Past due date under supplier terms" />
      </div>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Supplier-wise purchases</h2>
        <SimpleTable
          columns={[{ label: 'Supplier' }, { label: 'POs', right: true }, { label: 'PO value', right: true }, { label: 'Receipts', right: true }, { label: 'Invoiced', right: true }, { label: 'Paid', right: true }, { label: 'Outstanding', right: true }]}
          rows={suppliers.map((s) => [s.name, s.poCount, rs(s.poValuePaise), s.receiptCount, rs(s.invoicedPaise), rs(s.paidPaise), rs(s.outstandingPaise)])}
        />
      </section>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-burgundy">Purchase order history</h2>
          <a className="text-sm underline print:hidden" href={`${PATH}?${query}&open=${openOnly ? '0' : '1'}`}>
            {openOnly ? 'Show all orders' : 'Show pending orders only'}
          </a>
        </div>
        <SimpleTable
          columns={[{ label: 'PO' }, { label: 'Supplier' }, { label: 'Status' }, { label: 'Ordered units', right: true }, { label: 'Received units', right: true }, { label: 'Total', right: true }]}
          rows={orderPage.items.map((o) => [o.poNumber, o.supplierName, o.status, o.orderedUnits, o.receivedUnits, rs(o.totalPaise)])}
          empty="No purchase orders in this period."
        />
        <Pager base={`${PATH}?${query}&open=${openOnly ? '1' : '0'}`} page={orderPage.page} pages={orderPage.pages} />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Goods receipt history</h2>
        <SimpleTable
          columns={[{ label: 'GRN' }, { label: 'Received on' }, { label: 'Supplier' }, { label: 'PO' }, { label: 'Units', right: true }, { label: 'Damaged', right: true }, { label: 'Value', right: true }]}
          rows={receipts.map((g) => [g.grnNumber, g.receivedOn, g.supplierName, g.poNumber, g.unitsReceived, g.unitsDamaged, rs(g.valuePaise)])}
          empty="No goods receipts in this period."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Supplier payment history</h2>
        <SimpleTable
          columns={[{ label: 'Paid on' }, { label: 'Supplier' }, { label: 'Invoice' }, { label: 'Method' }, { label: 'Amount', right: true }]}
          rows={payments.map((p) => [p.paidOn, p.supplierName, p.invoiceNumber, p.method, rs(p.amountPaise)])}
          empty="No supplier payments in this period."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Open supplier invoices at period end</h2>
        <SimpleTable
          columns={[{ label: 'Invoice' }, { label: 'Supplier' }, { label: 'Due' }, { label: 'Outstanding', right: true }, { label: 'Days overdue', right: true }]}
          rows={balances.map((b) => [b.invoiceNumber, b.supplierName, b.dueDate, rs(b.outstandingPaise), b.daysOverdue])}
          empty="No open supplier invoices."
        />
      </section>
    </div>
  );
}
