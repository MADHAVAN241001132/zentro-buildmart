import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { GstBreakdown, type BreakdownLabels } from '@/components/guest/gst-breakdown';
import { friendly } from '@/lib/errors';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/pos';
import { ScanForm } from '../scan-form';
import { BillEditor, type CustomerOption, type EditorLine } from './bill-editor';
import { CouponForm } from './coupon-form';
import { TaxDetailsForm } from './tax-details-form';
import { PlacePanel } from './place-panel';

export const dynamic = 'force-dynamic';

interface QuoteLine {
  variant_id: string;
  sku: string;
  product_name: string;
  variant_label: string;
  quantity: number;
  unit_price_paise: number;
  discount_paise: number;
  gst_rate_bps: number;
  taxable_paise: number;
  tax_paise: number;
  line_total_paise: number;
}

interface Quote {
  lines: QuoteLine[];
  line_count: number;
  subtotal_paise: number;
  discount_paise: number;
  coupon_discount_paise: number;
  coupon_code: string | null;
  taxable_paise: number;
  tax_paise: number;
  total_paise: number;
  pricing_mode: 'inclusive' | 'exclusive' | 'not_collected';
  is_interstate: boolean | null;
  supply_state_code: string | null;
  store_state_code: string | null;
  cgst_paise: number;
  sgst_paise: number;
  utgst_paise: number;
  igst_paise: number;
}

const BREAKDOWN_LABELS: BreakdownLabels = {
  subtotal: 'Subtotal',
  valueBeforeGst: 'Value before GST',
  discount: 'Discount',
  taxable: 'Taxable value',
  gst: 'GST',
  gstIncluded: 'GST included',
  delivery: 'Delivery',
  total: 'Total',
  totalPayable: 'Total payable',
  noteInclusive: 'Prices include GST. The GST shown is part of the price.',
  noteExclusive: 'GST is added to the taxable value.',
  noteNotCollected: 'This showroom does not collect GST on this sale.',
};

const STATUS_TEXT: Record<string, string> = {
  HELD: 'Held. No stock has moved and nothing is recorded as a sale.',
  AWAITING_PAYMENT: 'Waiting for the online payment. This bill completes once the payment is confirmed.',
  CANCELLED: 'Cancelled. No stock or revenue was recorded.',
  EXPIRED: 'Expired after 7 days on hold. No stock or revenue was recorded.',
};

export default async function BillPage({
  params,
  searchParams,
}: {
  params: Promise<{ billId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const owner = await requireOwnerPermission('pos_billing');
  const { billId } = await params;
  if (!uuidSchema.safeParse(billId).success) notFound();
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: bill } = await supabase
    .from('pos_bills')
    .select('id, bill_reference, status, note, customer_id, order_id, cancel_reason, fulfilment_mode, delivery_state_code, buyer_gstin, customers(full_name, is_credit_approved)')
    .eq('id', billId)
    .maybeSingle();
  if (!bill) notFound();

  // Online bills move to COMPLETED here once the webhook or verify route has marked the order PAID.
  if (bill.status === 'AWAITING_PAYMENT') {
    const { data: synced } = await supabase.rpc('pos_sync_bill', { p_bill: billId });
    if (synced === 'COMPLETED' && bill.order_id) redirect(`/owner/pos/sales/${bill.order_id}`);
  }
  if (bill.status === 'COMPLETED' && bill.order_id) redirect(`/owner/pos/sales/${bill.order_id}`);

  const editable = bill.status === 'HELD';
  const [{ data: items }, { data: customers }, quoteResult] = await Promise.all([
    supabase
      .from('pos_bill_items')
      .select('variant_id, quantity, line_discount_paise, product_variants(sku, label, products(name))')
      .eq('bill_id', billId)
      .order('sort_order'),
    supabase.from('customers').select('id, full_name, is_credit_approved').order('full_name').limit(500),
    supabase.rpc('pos_quote_bill', { p_bill: billId }),
  ]);

  const quote = (quoteResult.data ?? null) as Quote | null;
  const quoteError = quoteResult.error ? friendly(quoteResult.error.message) : null;
  const quoteLines = new Map((quote?.lines ?? []).map((line) => [line.variant_id, line]));

  const lines: EditorLine[] = (items ?? []).map((row: Record<string, unknown>) => {
    const variant = (Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants) as
      | { sku: string; label: string; products: { name: string } | { name: string }[] | null }
      | null;
    const product = variant && (Array.isArray(variant.products) ? variant.products[0] : variant.products);
    const variantId = String(row.variant_id);
    const priced = quoteLines.get(variantId);
    return {
      variantId,
      sku: variant?.sku ?? '',
      label: variant?.label ?? '',
      productName: product?.name ?? '',
      quantity: Number(row.quantity),
      discountPaise: Number(row.line_discount_paise),
      unitPricePaise: priced?.unit_price_paise ?? 0,
      lineTotalPaise: priced ? priced.line_total_paise : null,
    };
  });

  const customerRow = Array.isArray(bill.customers) ? bill.customers[0] : bill.customers;
  const creditAllowed = Boolean(bill.customer_id && customerRow?.is_credit_approved);
  const customerOptions: CustomerOption[] = (customers ?? []) as CustomerOption[];

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Point of sale"
        title={`Bill ${bill.bill_reference}`}
        description={STATUS_TEXT[bill.status] ?? bill.status}
        actions={<StatusBadge status={bill.status} />}
      />
      {sp.error ? <p role="alert" className="text-sm text-danger">{sp.error}</p> : null}
      {quoteError ? <p role="alert" className="text-sm text-danger">{quoteError}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          {editable ? <ScanForm billId={billId} /> : null}
          <TaxDetailsForm
            billId={billId}
            editable={editable}
            fulfilment={bill.fulfilment_mode === 'delivery' ? 'delivery' : 'in_store'}
            deliveryState={bill.delivery_state_code}
            buyerGstin={bill.buyer_gstin}
            storeStateCode={quote?.store_state_code ?? null}
          />
          <CouponForm billId={billId} editable={editable} appliedCode={quote?.coupon_code ?? null} />
          <BillEditor
            billId={billId}
            editable={editable}
            customerId={bill.customer_id}
            note={bill.note}
            customers={customerOptions}
            lines={lines}
          />
        </div>

        <aside className="grid gap-4 self-start">
          <section className="grid gap-2 rounded-card border border-line bg-card p-5 text-sm">
            <h2 className="font-display text-lg text-burgundy">Totals</h2>
            {quote ? (
              <>
                <Row label="Items" value={String(quote.line_count)} />
                {quote.coupon_code ? (
                  <Row label={`Coupon ${quote.coupon_code}`} value={`− ${formatINR(quote.coupon_discount_paise)}`} />
                ) : null}
                <GstBreakdown
                  labels={BREAKDOWN_LABELS}
                  pricingMode={quote.pricing_mode}
                  subtotalPaise={quote.subtotal_paise}
                  discountPaise={quote.discount_paise}
                  taxPaise={quote.tax_paise}
                  deliveryPaise={0}
                  totalPaise={quote.total_paise}
                  componentRows={[
                    { label: 'CGST', paise: quote.cgst_paise },
                    { label: 'SGST', paise: quote.sgst_paise },
                    { label: 'UTGST', paise: quote.utgst_paise },
                    { label: 'IGST', paise: quote.igst_paise },
                  ].filter((row) => row.paise > 0)}
                />
                <p className="text-xs text-ink-muted">Prices and GST are recalculated from the catalogue when you place the bill.</p>
              </>
            ) : (
              <p className="text-ink-muted">Totals are unavailable until every item can be priced.</p>
            )}
          </section>
          <PlacePanel
            billId={billId}
            status={bill.status}
            editable={editable}
            canPlace={true}
            hasItems={lines.length > 0}
            creditAllowed={creditAllowed}
            totalPaise={quote?.total_paise ?? 0}
            keyId={process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null}
            cancelReason={bill.cancel_reason}
          />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? 'font-semibold text-burgundy' : ''}`}>
      <span className={strong ? '' : 'text-ink-muted'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
