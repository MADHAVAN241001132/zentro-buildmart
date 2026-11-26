import { formatGstRate, formatPlainInr, formatQuantity } from '@/lib/invoices/invoice-math';
import type { QuotationView } from '@/lib/services/quotations';

const rs = (paise: number) => `Rs. ${formatPlainInr(paise)}`;

/** Lines and totals for a customer-facing quotation. Unpriced requests show quantities only. */
export function QuotationSummary({ view }: { view: QuotationView }) {
  return (
    <div className="grid gap-4">
      <section className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Qty</th>
              {view.priced ? <><th className="px-4 py-2 text-right">Unit</th><th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">GST</th><th className="px-4 py-2 text-right">Total</th></> : null}
            </tr>
          </thead>
          <tbody>
            {view.lines.map((line) => (
              <tr key={`${line.sku}-${line.name}`} className="border-t border-line">
                <td className="px-4 py-2">{line.name}{line.variantLabel ? ` (${line.variantLabel})` : ''}<div className="text-xs text-ink-muted">{line.sku}</div></td>
                <td className="px-4 py-2 text-right">{formatQuantity(line.quantity)}</td>
                {view.priced ? (
                  <>
                    <td className="px-4 py-2 text-right">{rs(line.unitPricePaise)}</td>
                    <td className="px-4 py-2 text-right">{rs(line.discountPaise)}</td>
                    <td className="px-4 py-2 text-right">{formatGstRate(line.gstRateBps)} / {rs(line.taxPaise)}</td>
                    <td className="px-4 py-2 text-right">{rs(line.lineTotalPaise)}</td>
                  </>
                ) : null}
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
        <p className="text-sm text-ink-muted">The store is preparing prices for this request.</p>
      )}
      {view.validUntil ? <p className="text-sm">Valid until {view.validUntil}.</p> : null}
      {view.terms ? <p className="whitespace-pre-line rounded-card border border-line bg-cream p-4 text-sm">{view.terms}</p> : null}
    </div>
  );
}
