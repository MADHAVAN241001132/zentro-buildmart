'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField, SelectField } from '@/components/owner/field';
import { createPurchaseOrderAction, receiveGoodsAction, type PoFormState } from './actions';

const INITIAL = { ok: false } as PoFormState;

export function NewPoForm({
  suppliers,
  variants,
}: {
  suppliers: { id: string; name: string }[];
  variants: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(createPurchaseOrderAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField name="supplierId" label="Supplier" error={e.supplierId}>
          <option value="">Choose a supplier</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
        <TextField name="expectedOn" label="Expected delivery" type="date" />
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-medium text-ink">Lines (up to 8)</p>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr]">
            <SelectField name={`variant_${i}`} label={`Product ${i + 1}`}>
              <option value="">—</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </SelectField>
            <TextField name={`quantity_${i}`} label="Quantity" inputMode="numeric" />
            <TextField name={`cost_${i}`} label="Unit cost (₹)" inputMode="decimal" />
          </div>
        ))}
      </div>
      <FormMessage ok={state.ok} message={state.message} />
      <div><Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create purchase order'}</Button></div>
    </form>
  );
}

export interface ReceivableItem {
  id: string;
  label: string;
  remaining: number;
}

export function ReceiveForm({ poId, items }: { poId: string; items: ReceivableItem[] }) {
  const [state, action, pending] = useActionState(receiveGoodsAction, INITIAL);
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6" noValidate>
      <input type="hidden" name="poId" value={poId} />
      <p className="text-sm text-ink-muted">Enter what arrived. Leave a line blank to skip it. Batch numbers are optional but recommended for tiles.</p>
      {items.map((it) => (
        <div key={it.id} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1.5fr]">
          <p className="self-end text-sm text-ink">{it.label}<span className="block text-xs text-ink-muted">{it.remaining} outstanding</span></p>
          <TextField name={`qty_${it.id}`} label="Received now" inputMode="numeric" />
          <TextField name={`dmg_${it.id}`} label="Damaged" inputMode="numeric" />
          <TextField name={`batch_${it.id}`} label="Batch number" />
        </div>
      ))}
      <TextField name="notes" label="Delivery note or remarks (optional)" />
      <FormMessage ok={state.ok} message={state.message} />
      <div><Button type="submit" disabled={pending}>{pending ? 'Recording…' : 'Record goods receipt'}</Button></div>
    </form>
  );
}
