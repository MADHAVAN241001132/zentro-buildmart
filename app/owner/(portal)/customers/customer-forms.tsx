'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { CheckField, SelectField, TextField } from '@/components/owner/field';
import { createCustomerAction, recordCreditEntryAction, type CustomerState } from './actions';

const INITIAL = { ok: false } as CustomerState;

export interface CustomerDefaults {
  fullName?: string;
  mobile?: string;
  email?: string;
  gstin?: string;
  creditLimitRupees?: string;
  isCreditApproved?: boolean;
}

export function CustomerForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (prev: CustomerState, fd: FormData) => Promise<CustomerState>;
  defaults?: CustomerDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-2" noValidate>
      <TextField name="fullName" label="Full name" defaultValue={defaults.fullName} error={e.fullName} />
      <TextField name="mobile" label="Mobile (10 digits)" inputMode="numeric" defaultValue={defaults.mobile} error={e.mobile} />
      <TextField name="email" label="Email" type="email" defaultValue={defaults.email} error={e.email} />
      <TextField name="gstin" label="GSTIN (business customers)" defaultValue={defaults.gstin} error={e.gstin} />
      <TextField name="creditLimitRupees" label="Credit limit (₹)" inputMode="decimal" defaultValue={defaults.creditLimitRupees ?? '0'} error={e.creditLimitRupees} />
      <CheckField name="isCreditApproved" label="Approved for credit" defaultChecked={defaults.isCreditApproved} />
      <div className="md:col-span-2"><FormMessage ok={state.ok} message={state.message} /></div>
      <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button></div>
    </form>
  );
}

export function CreditEntryForm({ customerId, creditApproved }: { customerId: string; creditApproved: boolean }) {
  const [state, action, pending] = useActionState(recordCreditEntryAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-3 rounded-card border border-line bg-card p-5 md:grid-cols-2" noValidate>
      <input type="hidden" name="customerId" value={customerId} />
      <SelectField name="entryType" label="Entry" defaultValue="payment" error={e.entryType}>
        {creditApproved ? <option value="sale">Credit sale</option> : null}
        <option value="payment">Payment received</option>
        <option value="adjustment">Adjustment (use − for a credit note)</option>
      </SelectField>
      <TextField name="amountRupees" label="Amount (₹)" inputMode="decimal" error={e.amountRupees} />
      <TextField name="dueOn" label="Due date (credit sales)" type="date" error={e.dueOn} />
      <TextField name="note" label="Note" />
      <div className="md:col-span-2"><FormMessage ok={state.ok} message={state.message} /></div>
      <div className="md:col-span-2"><Button type="submit" disabled={pending} variant="secondary">{pending ? 'Recording…' : 'Record entry'}</Button></div>
    </form>
  );
}
