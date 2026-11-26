import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { buttonClass } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatPlainInr, formatGstRate, formatQuantity } from '@/lib/invoices/invoice-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import { ownerQuotationHistory, ownerQuotationView } from '@/lib/services/quotations';
import { QuotationControls } from '../quotation-controls';

export const dynamic = 'force-dynamic';

const rs = (paise: number) => `Rs. ${formatPlainInr(paise)}`;

export default async function OwnerQuotationDetail({ params }: { params: Promise<{ quotationId: string }> }) {
  const owner = await requireOwnerPermission('quotations');
  const { quotationId } = await params;
  const view = await ownerQuotationView(owner.storeId, quotationId);
  if (!view) notFound();
  const history = await ownerQuotationHistory(owner.storeId, quotationId);
  const editable = ['REQUESTED', 'DRAFT'].includes(view.status);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={`Quotation ${view.number}`}
        title={view.customerName}
        description={view.projectName ?? undefined}
        actions={
          <>
            {editable ? <Link href={`/owner/quotations/${view.id}/edit`} className={buttonClass('secondary')}>Edit</Link> : null}
            {view.priced ? <a href={`/owner/quotations/${view.id}/pdf`} className={buttonClass('secondary')}>Download PDF</a> : null}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={view.status} />
        <span>Revision {view.revision}</span>
        {view.validUntil ? <span>Valid until {view.validUntil}</span> : null}
        {view.convertedOrderNumber ? <Link className="text-burgundy underline" href={`/owner/orders`}>Order {view.convertedOrderNumber}</Link> : null}
      </div>
      <QuotationControls quotationId={view.id} status={view.status} canConvert={view.canConvert} />
      <section className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit</th>
              <th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Taxable</th>
              <th className="px-4 py-2 text-right">GST</th><th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {view.lines.map((line) => (
              <tr key={`${line.sku}-${line.name}`} className="border-t border-line">
                <td className="px-4 py-2">{line.name}{line.variantLabel ? ` (${line.variantLabel})` : ''}<div className="text-xs text-ink-muted">{line.sku}</div></td>
                <td className="px-4 py-2 text-right">{formatQuantity(line.quantity)}</td>
                <td className="px-4 py-2 text-right">{line.unitPricePaise > 0 ? rs(line.unitPricePaise) : '-'}</td>
                <td className="px-4 py-2 text-right">{rs(line.discountPaise)}</td>
                <td className="px-4 py-2 text-right">{rs(line.taxablePaise)}</td>
                <td className="px-4 py-2 text-right">{formatGstRate(line.gstRateBps)} / {rs(line.taxPaise)}</td>
                <td className="px-4 py-2 text-right">{rs(line.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {view.priced ? (
        <dl className="ml-auto grid w-full max-w-sm gap-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{rs(view.subtotalPaise)}</dd></div>
          <div className="flex justify-between"><dt>Discount</dt><dd>-{rs(view.discountPaise)}</dd></div>
          <div className="flex justify-between"><dt>Taxable</dt><dd>{rs(view.taxablePaise)}</dd></div>
          <div className="flex justify-between"><dt>GST</dt><dd>{rs(view.taxPaise)}</dd></div>
          <div className="flex justify-between"><dt>Delivery</dt><dd>{rs(view.deliveryPaise)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold text-burgundy"><dt>Grand total</dt><dd>{rs(view.totalPaise)}</dd></div>
        </dl>
      ) : (
        <p className="text-sm text-ink-muted">Not priced yet. Edit the request to set prices before sending.</p>
      )}
      {view.responseNote ? <p className="rounded-card border border-line bg-cream p-4 text-sm">Customer note: {view.responseNote}</p> : null}
      <section className="grid gap-2">
        <h2 className="font-display text-xl text-burgundy">History</h2>
        {history.length === 0 ? <p className="text-sm text-ink-muted">No changes recorded yet.</p> : (
          <ul className="grid gap-1 text-sm">
            {history.map((entry) => (
              <li key={`${entry.at}-${entry.action}`}>{new Date(entry.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}: {entry.action.replace(/^quotation_/, '').replace(/_/g, ' ')} ({entry.actor})</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
