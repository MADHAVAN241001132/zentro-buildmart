'use client';

import { useActionState } from 'react';
import { advanceOrderAction, type OrderActionState } from './actions';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';

const INITIAL: OrderActionState = { ok: false };

export function AdvanceOrderForm({ orderId, currentStatus, nextLabel }: { orderId: string; currentStatus: string; nextLabel: string }) {
  const [state, formAction, pending] = useActionState(advanceOrderAction, INITIAL);
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="currentStatus" value={currentStatus} />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Updating…' : nextLabel}</Button>
      <FormMessage ok={state.ok} message={state.message} />
    </form>
  );
}
