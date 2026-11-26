'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { CheckField, TextField } from '@/components/owner/field';
import type { SupplierState } from './actions';

export interface SupplierDefaults {
  name?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  paymentTermsDays?: number;
  isActive?: boolean;
}

export function SupplierForm({
  action,
  defaults,
  submitLabel,
  showActive = false,
}: {
  action: (prev: SupplierState, fd: FormData) => Promise<SupplierState>;
  defaults: SupplierDefaults;
  submitLabel: string;
  showActive?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as SupplierState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-2" noValidate>
      <TextField name="name" label="Supplier name" defaultValue={defaults.name} error={e.name} />
      <TextField name="contactPerson" label="Contact person" defaultValue={defaults.contactPerson} error={e.contactPerson} />
      <TextField name="phone" label="Phone" inputMode="tel" defaultValue={defaults.phone} error={e.phone} />
      <TextField name="email" label="Email" type="email" defaultValue={defaults.email} error={e.email} />
      <TextField name="gstin" label="GSTIN" defaultValue={defaults.gstin} error={e.gstin} />
      <TextField name="paymentTermsDays" label="Payment terms (days)" inputMode="numeric" defaultValue={defaults.paymentTermsDays ?? 30} error={e.paymentTermsDays} />
      <TextField name="address" label="Address" defaultValue={defaults.address} error={e.address} className="md:col-span-2" />
      {showActive ? <CheckField name="isActive" label="Active supplier" defaultChecked={defaults.isActive ?? true} /> : null}
      <div className="md:col-span-2"><FormMessage ok={state.ok} message={state.message} /></div>
      <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button></div>
    </form>
  );
}
