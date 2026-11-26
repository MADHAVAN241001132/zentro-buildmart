'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { GST_STATE_CODES } from '@/lib/gst/policy';
import { setTaxDetailsAction, type PosState } from '../actions';

const INITIAL: PosState = { ok: false };
const FIELD = 'rounded-control border border-line bg-card px-3 py-2 text-sm';

/**
 * Supply and buyer details for a held POS bill: in-store sale or delivery, the delivery state (place of supply) and the
 * buyer's GSTIN. Read-only once the bill is placed. The server decides every tax consequence.
 */
export function TaxDetailsForm({
  billId,
  editable,
  fulfilment,
  deliveryState,
  buyerGstin,
  storeStateCode,
}: {
  billId: string;
  editable: boolean;
  fulfilment: 'in_store' | 'delivery';
  deliveryState: string | null;
  buyerGstin: string | null;
  storeStateCode: string | null;
}) {
  const [state, action, pending] = useActionState(setTaxDetailsAction, INITIAL);
  const storeName = GST_STATE_CODES.find((s) => s.code === storeStateCode)?.name ?? null;

  if (!editable) {
    return (
      <p className="text-sm text-ink-muted">
        {fulfilment === 'delivery'
          ? `Delivery to ${GST_STATE_CODES.find((s) => s.code === deliveryState)?.name ?? 'the recorded state'}`
          : 'In-store sale'}
        {buyerGstin ? ` · Buyer GSTIN ${buyerGstin}` : ''}
      </p>
    );
  }

  return (
    <section className="grid gap-3 rounded-card border border-line bg-card p-5">
      <h2 className="font-display text-lg text-burgundy">Supply and buyer</h2>
      <form action={action} className="grid gap-3 text-sm" noValidate>
        <input type="hidden" name="billId" value={billId} />
        <fieldset className="grid gap-2">
          <legend className="text-ink-muted">How the goods leave the showroom</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="fulfilment" value="in_store" defaultChecked={fulfilment === 'in_store'} />
            In-store sale{storeName ? ` (supplied from ${storeName})` : ''}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="fulfilment" value="delivery" defaultChecked={fulfilment === 'delivery'} />
            Delivery to another state
          </label>
        </fieldset>
        <label className="grid gap-1">
          Delivery state (for delivery)
          <select name="deliveryState" defaultValue={deliveryState ?? ''} className={FIELD}>
            <option value="">Choose a state</option>
            {GST_STATE_CODES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Buyer GSTIN (optional, for registered buyers)
          <input
            name="buyerGstin"
            defaultValue={buyerGstin ?? ''}
            maxLength={15}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="e.g. 33AAAAA1234A1ZV"
            className={`${FIELD} uppercase`}
          />
        </label>
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? 'Saving…' : 'Save supply details'}
          </Button>
        </div>
      </form>
      <FormMessage ok={state.ok} message={state.message} />
    </section>
  );
}
