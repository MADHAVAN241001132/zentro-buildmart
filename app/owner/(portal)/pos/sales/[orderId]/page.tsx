import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { buttonClass } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/pos';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export default async function PosInvoicePage({ params }: { params: Promise<{ orderId: string }> }) {
  const owner = await requireOwnerPermission('pos_billing');
  const { orderId } = await params;
  if (!uuidSchema.safeParse(orderId).success) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: order }, { data: items }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, channel, created_at, customer_name, customer_mobile, payment_method, payment_status, order_status, subtotal_paise, discount_paise, taxable_paise, tax_paise, total_paise, invoices(invoice_number, invoice_date)')
      .eq('id', orderId)
      .maybeSingle(),
    supabase
      .from('order_items')
      .select('product_name_snapshot, variant_label_snapshot, sku_snapshot, hsn_code_snapshot, quantity, unit_price_paise, discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise')
      .eq('order_id', orderId),
  ]);
  if (!order || order.channel !== 'pos') notFound();

  const invoice = Array.isArray(order.invoices) ? order.invoices[0] : order.invoices;
  const paid = order.payment_status === 'PAID';

  return (
    <div className="grid gap-6">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Point of sale"
          title={invoice ? `Invoice ${invoice.invoice_number}` : `Order ${order.order_number}`}
          description={paid ? 'Payment received.' : 'Payment is not yet confirmed. An invoice is issued when payment is received.'}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={order.payment_status} />
              <Link href="/owner/pos/sales" className={buttonClass('ghost')}>All sales</Link>
              {invoice ? (
                <a href={`/owner/orders/${order.id}/invoice`} className={buttonClass('secondary')}>Download PDF invoice</a>
              ) : null}
              <PrintButton />
            </div>
          }
        />
      </div>

      <article className="grid gap-6 rounded-card border border-line bg-card p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 className="font-display text-2xl text-burgundy">{owner.storeName}</h2>
            <p className="text-sm text-ink-muted">Tax invoice</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-muted">Order</dt><dd>{order.order_number}</dd>
            <dt className="text-ink-muted">Invoice</dt><dd>{invoice?.invoice_number ?? 'Not issued yet'}</dd>
            <dt className="text-ink-muted">Date</dt><dd>{new Date(invoice?.invoice_date ?? order.created_at).toLocaleDateString('en-IN')}</dd>
            <dt className="text-ink-muted">Payment</dt><dd className="capitalize">{order.payment_method}</dd>
          </dl>
        </header>

        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Billed to</p>
          <p>{order.customer_name}{order.customer_mobile ? ` · ${order.customer_mobile}` : ''}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">HSN</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Rate</th>
                <th className="py-2 pr-3 text-right">Discount</th>
                <th className="py-2 pr-3 text-right">Taxable</th>
                <th className="py-2 pr-3 text-right">GST</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item, index: number) => (
                <tr key={index} className="border-t border-line">
                  <td className="py-2 pr-3">
                    {item.product_name_snapshot}
                    <div className="text-xs text-ink-muted">{item.sku_snapshot} · {item.variant_label_snapshot}</div>
                  </td>
                  <td className="py-2 pr-3">{item.hsn_code_snapshot ?? '—'}</td>
                  <td className="py-2 pr-3 text-right">{Number(item.quantity)}</td>
                  <td className="py-2 pr-3 text-right">{formatINR(Number(item.unit_price_paise))}</td>
                  <td className="py-2 pr-3 text-right">{formatINR(Number(item.discount_paise))}</td>
                  <td className="py-2 pr-3 text-right">{formatINR(Number(item.taxable_paise))}</td>
                  <td className="py-2 pr-3 text-right">
                    {formatINR(Number(item.tax_paise))}
                    <div className="text-xs text-ink-muted">{(Number(item.gst_rate_bps) / 100).toFixed(2)}%</div>
                  </td>
                  <td className="py-2 text-right">{formatINR(Number(item.line_total_paise))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-muted">Subtotal</dt><dd className="text-right">{formatINR(order.subtotal_paise)}</dd>
          <dt className="text-ink-muted">Discounts</dt><dd className="text-right">− {formatINR(order.discount_paise)}</dd>
          <dt className="text-ink-muted">Taxable value</dt><dd className="text-right">{formatINR(order.taxable_paise)}</dd>
          <dt className="text-ink-muted">GST</dt><dd className="text-right">{formatINR(order.tax_paise)}</dd>
          <dt className="border-t border-line pt-2 font-semibold text-burgundy">Total</dt>
          <dd className="border-t border-line pt-2 text-right font-semibold text-burgundy">{formatINR(order.total_paise)}</dd>
        </dl>
      </article>
    </div>
  );
}
