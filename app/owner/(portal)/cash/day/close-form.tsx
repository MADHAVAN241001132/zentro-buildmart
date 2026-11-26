'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField } from '@/components/owner/field';
import { closeCashDayAction, type CashCloseState } from './actions';

const INITIAL: CashCloseState = { ok: false };

export function CloseDayForm({ date, showOpening, closed }: { date: string; showOpening: boolean; closed: boolean }) {
  const [state, action, pending] = useActionState(closeCashDayAction, INITIAL);
  if (closed) {
    return <p className="text-sm text-ink-muted">This day is already closed. A closed day cannot be changed.</p>;
  }
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-2" noValidate>
      <input type="hidden" name="date" value={date} />
      {showOpening ? (
        <TextField name="openingRupees" label="Opening cash (₹)" inputMode="decimal" hint="No earlier day is closed, so enter the opening float." />
      ) : (
        <p className="text-sm text-ink-muted md:col-span-2">Opening cash carries forward from the previous closing.</p>
      )}
      <TextField name="countedRupees" label="Counted cash in drawer (₹)" inputMode="decimal" hint="Record bank deposits and withdrawals above before you count." />
      <div className="md:col-span-2"><FormMessage ok={state.ok ? true : state.message ? false : null} message={state.message} /></div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? 'Closing…' : 'Close this day'}</Button>
      </div>
    </form>
  );
}
