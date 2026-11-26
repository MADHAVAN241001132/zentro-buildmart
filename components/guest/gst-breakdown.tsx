import { formatINR } from '@/lib/money';
import type { PricingMode } from '@/lib/services/cart';

export interface GstComponentRow {
  label: string;
  paise: number;
}

export interface BreakdownLabels {
  subtotal: string;
  valueBeforeGst: string;
  discount: string;
  taxable: string;
  gst: string;
  gstIncluded: string;
  delivery: string;
  total: string;
  totalPayable: string;
  noteInclusive: string;
  noteExclusive: string;
  noteNotCollected: string;
}

interface Props {
  labels: BreakdownLabels;
  pricingMode: PricingMode;
  /** Tax-exclusive subtotal before discount (the ledger basis, see migration 0060). */
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryPaise: number;
  totalPaise: number;
  /** Optional CGST, SGST, UTGST or IGST rows, shown only when the split is known for this sale. */
  componentRows?: GstComponentRow[];
}

/**
 * Price breakdown for the Guest cart and checkout. Pure presentation: every figure comes from the authoritative
 * pricing (lib/pricing.ts, migration 0060). Rows that do not apply are not rendered: a store that cannot collect GST
 * shows no GST row at all.
 */
export function GstBreakdown({
  labels,
  pricingMode,
  subtotalPaise,
  discountPaise,
  taxPaise,
  deliveryPaise,
  totalPaise,
  componentRows,
}: Props) {
  const collects = pricingMode !== 'not_collected';
  const inclusive = pricingMode === 'inclusive';
  const taxable = subtotalPaise - discountPaise;
  const subtotalLabel = inclusive ? labels.valueBeforeGst : labels.subtotal;
  const note =
    pricingMode === 'inclusive'
      ? labels.noteInclusive
      : pricingMode === 'exclusive'
        ? labels.noteExclusive
        : labels.noteNotCollected;

  return (
    <div className="grid gap-3">
      <dl className="grid gap-2 text-sm">
        <Row label={subtotalLabel} value={formatINR(subtotalPaise)} />
        {discountPaise > 0 ? <Row label={labels.discount} value={`− ${formatINR(discountPaise)}`} /> : null}
        {collects && discountPaise > 0 ? <Row label={labels.taxable} value={formatINR(taxable)} /> : null}
        {collects ? (
          componentRows && componentRows.length > 0 ? (
            componentRows.map((row) => <Row key={row.label} label={row.label} value={formatINR(row.paise)} />)
          ) : (
            <Row label={inclusive ? labels.gstIncluded : labels.gst} value={formatINR(taxPaise)} />
          )
        ) : null}
        {deliveryPaise > 0 ? <Row label={labels.delivery} value={formatINR(deliveryPaise)} /> : null}
      </dl>
      <p className="text-xs text-ink-muted">{note}</p>
      <div className="flex justify-between border-t border-line pt-3 text-lg font-semibold text-ink">
        <span>{labels.totalPayable}</span>
        <span>{formatINR(totalPaise)}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted [overflow-wrap:anywhere]">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
