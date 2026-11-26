'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField } from '@/components/owner/field';
import { recordCashMovementAction, type CashCloseState } from './actions';

const INITIAL: CashCloseState = { ok: false };

/** Bank deposits, withdrawals and other cash in or out for today. Shown only while today's day is open. */
export function CashMovementForm() {
  const [state, action, pending] = useActionState(recordCashMovementAction, INITIAL);
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-2" noValidate>
      <label className="grid gap-1 text-sm">
        Movement type
        <select name="type" defaultValue="deposit" className="rounded-control border border-line bg-card px-3 py-2 text-sm">
          <option value="deposit">Cash deposited to bank</option>
          <option value="withdrawal">Cash withdrawn from bank</option>
          <option value="manual_in">Other cash in</option>
          <option value="manual_out">Other cash out</option>
        </select>
      </label>
      <TextField name="amountRupees" label="Amount (₹)" inputMode="decimal" />
      <div className="md:col-span-2">
        <TextField name="reason" label="Reason" hint="For example, daily bank deposit or petty cash for courier." />
      </div>
      <div className="md:col-span-2"><FormMessage ok={state.ok ? true : state.message ? false : null} message={state.message} /></div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? 'Recording…' : 'Record movement'}</Button>
      </div>
    </form>
  );
}
