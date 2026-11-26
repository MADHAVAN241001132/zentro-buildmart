'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { SelectField, TextField } from '@/components/owner/field';
import { adjustBatchAction, createBatchAction, updateBatchAction, type BatchState } from './actions';

const INITIAL = { ok: false } as BatchState;

export function NewBatchForm({
  variants,
  suppliers,
}: {
  variants: { id: string; label: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createBatchAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-2" noValidate>
      <SelectField name="variantId" label="Product variant" error={e.variantId} className="md:col-span-2">
        <option value="">Choose a variant</option>
        {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </SelectField>
      <TextField name="batchNumber" label="Batch number" error={e.batchNumber} />
      <TextField name="openingQuantity" label="Opening stock (units)" inputMode="numeric" error={e.openingQuantity} hint="Added to the variant's stock" />
      <TextField name="shadeCode" label="Shade code" error={e.shadeCode} />
      <TextField name="calibre" label="Calibre" error={e.calibre} />
      <TextField name="manufacturingDate" label="Manufacturing date" type="date" error={e.manufacturingDate} />
      <SelectField name="supplierId" label="Supplier (optional)" defaultValue="">
        <option value="">None</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <div className="md:col-span-2"><FormMessage ok={state.ok} message={state.message} /></div>
      <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create batch'}</Button></div>
    </form>
  );
}

export function EditBatchForm({ batch, suppliers }: { batch: { id: string; shade: string; calibre: string; date: string; supplierId: string }; suppliers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(updateBatchAction, INITIAL);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-5 md:items-end">
      <input type="hidden" name="batchId" value={batch.id} />
      <TextField name="shadeCode" label="Shade" defaultValue={batch.shade} />
      <TextField name="calibre" label="Calibre" defaultValue={batch.calibre} />
      <TextField name="manufacturingDate" label="Mfg date" type="date" defaultValue={batch.date} />
      <SelectField name="supplierId" label="Supplier" defaultValue={batch.supplierId}>
        <option value="">None</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <div className="flex items-center gap-2"><Button type="submit" variant="secondary" disabled={pending}>Save</Button>{state.message ? <span className={`text-xs ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</span> : null}</div>
    </form>
  );
}

export function AdjustBatchForm({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState(adjustBatchAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-2 md:grid-cols-[1fr_2fr_auto] md:items-end">
      <input type="hidden" name="batchId" value={batchId} />
      <TextField name="delta" label="Change (+ or −)" inputMode="numeric" error={e.delta} />
      <TextField name="reason" label="Reason" error={e.reason} />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Adjust'}</Button>
      {state.message && !state.ok ? <p className="text-xs text-danger md:col-span-3">{state.message}</p> : null}
    </form>
  );
}
