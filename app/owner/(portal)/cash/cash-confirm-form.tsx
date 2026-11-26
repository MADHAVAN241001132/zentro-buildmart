'use client';

import { useActionState } from 'react';
import { confirmCashAction, type CashActionState } from './actions';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { formatINR } from '@/lib/money';

const INITIAL: CashActionState = { ok: false };

export function CashConfirmForm({ orderId, amountDuePaise }: { orderId: string; amountDuePaise: number }) {
  const [state, formAction, pending] = useActionState(confirmCashAction, INITIAL);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="grid gap-1 text-sm font-medium">
        Amount received (₹)
        <input
          name="amountReceived"
          type="text"
          inputMode="decimal"
          defaultValue={(amountDuePaise / 100).toFixed(2)}
          required
          className="rounded-control border border-line bg-white px-3 py-2 font-normal"
          aria-describedby={`due-${orderId}`}
        />
        <span id={`due-${orderId}`} className="text-xs text-ink-muted">Due: {formatINR(amountDuePaise)}</span>
        {state.fieldErrors?.amountReceived ? <span className="text-xs text-danger">{state.fieldErrors.amountReceived}</span> : null}
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Note (optional)
        <input name="note" maxLength={300} className="rounded-control border border-line bg-white px-3 py-2 font-normal" />
      </label>
      <Button type="submit" disabled={pending}>{pending ? 'Confirming…' : 'Confirm cash received'}</Button>
      <div className="sm:col-span-3">
        <FormMessage ok={state.ok} message={state.message} />
      </div>
    </form>
  );
}
