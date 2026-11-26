'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { SelectField, TextField } from '@/components/owner/field';
import { createOwnerAction, type OwnerFormState } from './actions';

export function OwnerForm({ stores }: { stores: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createOwnerAction, { ok: false } as OwnerFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-2" noValidate>
      <SelectField name="storeId" label="Store" error={e.storeId}>
        <option value="">Choose a store</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </SelectField>
      <SelectField name="role" label="Role" defaultValue="owner" error={e.role}>
        <option value="owner">Owner</option>
        <option value="manager">Manager</option>
        <option value="staff">Staff</option>
      </SelectField>
      <TextField name="fullName" label="Full name" error={e.fullName} />
      <TextField name="phone" label="Phone" inputMode="tel" error={e.phone} />
      <TextField name="email" label="Login email" type="email" autoComplete="off" error={e.email} />
      <TextField name="password" label="Temporary password" type="password" autoComplete="new-password" error={e.password} hint="At least 10 characters. The owner can change it after first sign-in." />
      <div className="md:col-span-2">
        <FormMessage ok={state.ok} message={state.message} />
      </div>
      <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create owner account'}</Button></div>
    </form>
  );
}
