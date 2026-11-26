'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { scanSkuAction, type PosState } from './actions';

const INITIAL: PosState = { ok: false };

/** Barcode scanners send the code followed by Enter, which submits this form. */
export function ScanForm({ billId }: { billId: string }) {
  const [state, action, pending] = useActionState(scanSkuAction, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-card p-4" autoComplete="off">
      <input type="hidden" name="billId" value={billId} />
      <label className="grid min-w-[220px] flex-1 gap-1 text-sm">
        Scan or type SKU
        <input name="sku" autoFocus className="rounded-control border border-line bg-card px-3 py-2 font-mono text-sm" />
      </label>
      <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add by SKU'}</Button>
      <div className="w-full">
        <FormMessage ok={state.ok} message={state.message} />
      </div>
    </form>
  );
}
