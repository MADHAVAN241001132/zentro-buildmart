'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import type { GuestRefundState } from '@/app/store/[storeSlug]/orders/[orderNumber]/refund/actions';
import { formatINR } from '@/lib/money';

export interface RefundableItem {
  orderItemId: string;
  name: string;
  variantLabel: string;
  remaining: number;
  lineTotalPaise: number;
}

const INITIAL: GuestRefundState = { ok: false };

/** Guest refund request. Quantities are limited to what remains; the database enforces the same limit. */
export function RefundRequestForm({
  submit,
  items,
  reasonOptions,
}: {
  submit: (prev: GuestRefundState, fd: FormData) => Promise<GuestRefundState>;
  items: RefundableItem[];
  reasonOptions: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(submit, INITIAL);
  return (
    <form action={action} className="grid gap-5 rounded-card border border-line bg-card p-6" noValidate>
      <fieldset className="grid gap-3">
        <legend className="font-semibold text-ink">Items and quantities</legend>
        {items.map((item) => (
          <label key={item.orderItemId} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3 text-sm">
            <span>
              <span className="font-medium text-ink">{item.name}</span>
              <span className="block text-xs text-ink-muted">
                {item.variantLabel} · {formatINR(item.lineTotalPaise)} for the line · up to {item.remaining} can be requested
              </span>
            </span>
            <select name={`qty:${item.orderItemId}`} defaultValue="0" className="rounded-control border border-line bg-card px-3 py-2">
              {Array.from({ length: item.remaining + 1 }, (_, n) => (
                <option key={n} value={n}>{n === 0 ? 'Not returning' : `Return ${n}`}</option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1 text-sm">
        Reason
        <select name="reasonCode" defaultValue={reasonOptions[0]?.value} className="rounded-control border border-line bg-card px-3 py-2">
          {reasonOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Tell us what happened
        <textarea name="reason" required minLength={3} maxLength={500} rows={3} className="rounded-control border border-line bg-card px-3 py-2" />
      </label>
      <FormMessage ok={state.message ? state.ok : null} message={state.message} />
      <div>
        <Button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send refund request'}</Button>
      </div>
    </form>
  );
}
