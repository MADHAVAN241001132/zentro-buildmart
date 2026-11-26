'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { formatINR } from '@/lib/money';
import { saveBillAction, type PosState } from '../actions';

export interface EditorLine {
  variantId: string;
  sku: string;
  label: string;
  productName: string;
  quantity: number;
  discountPaise: number;
  unitPricePaise: number;
  lineTotalPaise: number | null;
}

export interface CustomerOption {
  id: string;
  full_name: string;
  is_credit_approved: boolean;
}

const INITIAL: PosState = { ok: false };
const FIELD = 'rounded-control border border-line bg-card px-3 py-2 text-sm';

export function BillEditor({
  billId,
  editable,
  customerId,
  note,
  customers,
  lines,
}: {
  billId: string;
  editable: boolean;
  customerId: string | null;
  note: string | null;
  customers: CustomerOption[];
  lines: EditorLine[];
}) {
  const [state, action, pending] = useActionState(saveBillAction, INITIAL);

  if (!editable) {
    return (
      <section className="grid gap-3 rounded-card border border-line bg-card p-5">
        <ReadOnlyTable lines={lines} />
        {note ? <p className="text-sm text-ink-muted">Note: {note}</p> : null}
      </section>
    );
  }

  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-5" noValidate>
      <input type="hidden" name="billId" value={billId} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Customer
          <select name="customerId" defaultValue={customerId ?? ''} className={FIELD}>
            <option value="">Walk-in customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.full_name}{customer.is_credit_approved ? ' (credit approved)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Note
          <input name="note" defaultValue={note ?? ''} maxLength={300} className={FIELD} />
        </label>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-ink-muted">No items yet. Scan a SKU or search for a product above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3 text-right">Unit price</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">Discount (₹)</th>
                <th className="py-2 pr-3 text-right">Line total</th>
                <th className="py-2">Remove</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.variantId} className="border-t border-line align-top">
                  <td className="py-3 pr-3">
                    <div>{line.productName}</div>
                    <div className="text-xs text-ink-muted">{line.sku} · {line.label}</div>
                  </td>
                  <td className="py-3 pr-3 text-right">{formatINR(line.unitPricePaise)}</td>
                  <td className="py-3 pr-3">
                    <input name={`qty:${line.variantId}`} defaultValue={line.quantity} inputMode="decimal" className={`${FIELD} w-24`} />
                  </td>
                  <td className="py-3 pr-3">
                    <input name={`disc:${line.variantId}`} defaultValue={(line.discountPaise / 100).toFixed(2)} inputMode="decimal" className={`${FIELD} w-28`} />
                  </td>
                  <td className="py-3 pr-3 text-right">{line.lineTotalPaise === null ? '—' : formatINR(line.lineTotalPaise)}</td>
                  <td className="py-3">
                    <input type="checkbox" name={`remove:${line.variantId}`} aria-label={`Remove ${line.productName}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormMessage ok={state.ok} message={state.message} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Holding…' : 'Hold bill (save changes)'}</Button>
      </div>
    </form>
  );
}

function ReadOnlyTable({ lines }: { lines: EditorLine[] }) {
  if (lines.length === 0) return <p className="text-sm text-ink-muted">No items on this bill.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
        <tr>
          <th className="py-2 pr-3">Item</th>
          <th className="py-2 pr-3">Qty</th>
          <th className="py-2 pr-3 text-right">Discount</th>
          <th className="py-2 text-right">Line total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.variantId} className="border-t border-line">
            <td className="py-2 pr-3">{line.productName} <span className="text-xs text-ink-muted">{line.sku}</span></td>
            <td className="py-2 pr-3">{line.quantity}</td>
            <td className="py-2 pr-3 text-right">{formatINR(line.discountPaise)}</td>
            <td className="py-2 text-right">{line.lineTotalPaise === null ? '—' : formatINR(line.lineTotalPaise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
