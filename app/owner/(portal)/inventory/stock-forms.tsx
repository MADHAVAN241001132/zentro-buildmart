'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField } from '@/components/owner/field';
import { adjustStockAction, markDamagedAction, setReorderLevelAction, type StockResult } from './actions';

const INITIAL: StockResult = { ok: false };

/** Compact per-variant forms: adjust, damage and reorder level. Each has its own action state. */
export function StockForms({ variantId, reorderLevel, onHand }: { variantId: string; reorderLevel: number; onHand: number }) {
  const [adj, adjAction, adjPending] = useActionState(adjustStockAction, INITIAL);
  const [dmg, dmgAction, dmgPending] = useActionState(markDamagedAction, INITIAL);
  const [reo, reoAction, reoPending] = useActionState(setReorderLevelAction, INITIAL);
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <form action={adjAction} className="grid gap-2" noValidate>
        <input type="hidden" name="variantId" value={variantId} />
        <TextField name="delta" label="Adjust on hand (+/−)" inputMode="numeric" error={adj.fieldErrors?.delta} hint={`Current on hand: ${onHand}`} />
        <TextField name="reason" label="Reason" error={adj.fieldErrors?.reason} />
        <Button type="submit" variant="secondary" disabled={adjPending}>{adjPending ? 'Saving…' : 'Apply adjustment'}</Button>
        <FormMessage ok={adj.ok} message={adj.message} />
      </form>
      <form action={dmgAction} className="grid gap-2" noValidate>
        <input type="hidden" name="variantId" value={variantId} />
        <TextField name="quantity" label="Units damaged" inputMode="numeric" error={dmg.fieldErrors?.quantity} />
        <TextField name="reason" label="Reason" error={dmg.fieldErrors?.reason} />
        <Button type="submit" variant="secondary" disabled={dmgPending}>{dmgPending ? 'Saving…' : 'Record damage'}</Button>
        <FormMessage ok={dmg.ok} message={dmg.message} />
      </form>
      <form action={reoAction} className="grid gap-2" noValidate>
        <input type="hidden" name="variantId" value={variantId} />
        <TextField name="reorderLevel" label="Reorder level" inputMode="numeric" defaultValue={reorderLevel} error={reo.fieldErrors?.reorderLevel} />
        <Button type="submit" variant="secondary" disabled={reoPending}>{reoPending ? 'Saving…' : 'Save reorder level'}</Button>
        <FormMessage ok={reo.ok} message={reo.message} />
      </form>
    </div>
  );
}
