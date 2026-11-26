'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { setCouponAction, type PosState } from '../actions';

const INITIAL: PosState = { ok: false };
const FIELD = 'rounded-control border border-line bg-card px-3 py-2 text-sm';

/**
 * Coupon picker for a held POS bill. Applying a code calls pos_set_coupon, which validates it on the server
 * and reprices the bill. Removing the coupon submits an empty code. Once the bill is placed the form is read-only.
 */
export function CouponForm({
  billId,
  editable,
  appliedCode,
}: {
  billId: string;
  editable: boolean;
  appliedCode: string | null;
}) {
  const [state, action, pending] = useActionState(setCouponAction, INITIAL);

  if (!editable) {
    return appliedCode ? (
      <p className="text-sm text-ink-muted">
        Coupon <span className="font-medium text-ink">{appliedCode}</span> was applied when this bill was placed.
      </p>
    ) : null;
  }

  return (
    <section className="grid gap-3 rounded-card border border-line bg-card p-5">
      <h2 className="font-display text-lg text-burgundy">Coupon</h2>
      <form action={action} className="flex flex-wrap items-end gap-2" noValidate>
        <input type="hidden" name="billId" value={billId} />
        <label className="grid gap-1 text-sm">
          Coupon code
          <input
            name="code"
            defaultValue={appliedCode ?? ''}
            maxLength={40}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="e.g. DIWALI10"
            className={`${FIELD} w-56 uppercase`}
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Checking…' : 'Apply coupon'}
        </Button>
      </form>
      {appliedCode ? (
        <form action={action}>
          <input type="hidden" name="billId" value={billId} />
          <input type="hidden" name="code" value="" />
          <Button type="submit" variant="ghost" disabled={pending}>
            Remove coupon {appliedCode}
          </Button>
        </form>
      ) : null}
      <FormMessage ok={state.ok} message={state.message} />
    </section>
  );
}
