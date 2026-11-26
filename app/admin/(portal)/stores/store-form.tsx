'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { SelectField, TextField } from '@/components/owner/field';
import type { StoreFormState } from './actions';

export interface StoreDefaults {
  legalName?: string;
  businessCategory?: string;
  businessDescription?: string;
  billingAddress?: string;
  gstRegistration?: string;
  pricesIncludeGst?: boolean;
  name?: string;
  slug?: string;
  status?: string;
  gstin?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  brandColour?: string;
}

export function StoreForm({
  action,
  defaults,
  submitLabel,
  showLegal = false,
}: {
  action: (prev: StoreFormState, fd: FormData) => Promise<StoreFormState>;
  defaults: StoreDefaults;
  submitLabel: string;
  /** Edit screens show the legal and tax profile. Creation leaves it to the onboarding wizard. */
  showLegal?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as StoreFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-6 rounded-card border border-line bg-card p-6" noValidate>
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 font-display text-xl text-burgundy">Store identity</legend>
        <TextField name="name" label="Store name" defaultValue={defaults.name} error={e.name} />
        <TextField name="slug" label="URL slug" defaultValue={defaults.slug} error={e.slug} hint="Used in the storefront address, for example /store/ambattur" />
        <SelectField name="status" label="Status" defaultValue={defaults.status ?? 'draft'} error={e.status}>
          <option value="draft">Draft (not visible to customers)</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </SelectField>
        <TextField name="brandColour" label="Brand colour" defaultValue={defaults.brandColour ?? '#6A0D2A'} error={e.brandColour} />
        <TextField name="gstin" label="GSTIN" defaultValue={defaults.gstin} error={e.gstin} />
      </fieldset>
      {showLegal ? (
        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="mb-2 font-display text-xl text-burgundy">Legal and tax profile</legend>
          <TextField name="legalName" label="Registered business name" defaultValue={defaults.legalName} error={e.legalName} />
          <TextField name="businessCategory" label="Business category" defaultValue={defaults.businessCategory} error={e.businessCategory} />
          <TextField name="businessDescription" label="Business description" defaultValue={defaults.businessDescription} error={e.businessDescription} className="md:col-span-2" />
          <TextField name="billingAddress" label="Billing address" defaultValue={defaults.billingAddress} error={e.billingAddress} className="md:col-span-2" />
          <SelectField name="gstRegistration" label="GST registration" defaultValue={defaults.gstRegistration ?? 'unregistered'} error={e.gstRegistration}>
            <option value="regular">Regular taxpayer</option>
            <option value="composition">Composition scheme</option>
            <option value="unregistered">Not registered for GST</option>
          </SelectField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pricesIncludeGst" defaultChecked={defaults.pricesIncludeGst === true} className="accent-burgundy" />
            Listed prices already include GST
          </label>
          <p className="md:col-span-2 text-xs text-ink-muted">The GSTIN and State fields in this form are part of this profile. Invoices and quotations keep the details in force when they are issued.</p>
        </fieldset>
      ) : null}
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 font-display text-xl text-burgundy">Address and contact</legend>
        <TextField name="addressLine" label="Address" defaultValue={defaults.addressLine} error={e.addressLine} className="md:col-span-2" />
        <TextField name="city" label="City" defaultValue={defaults.city} error={e.city} />
        <TextField name="state" label="State" defaultValue={defaults.state} error={e.state} />
        <TextField name="pincode" label="Pincode" inputMode="numeric" defaultValue={defaults.pincode} error={e.pincode} />
        <TextField name="phone" label="Phone" inputMode="tel" defaultValue={defaults.phone} error={e.phone} />
        <TextField name="email" label="Email" type="email" defaultValue={defaults.email} error={e.email} />
      </fieldset>
      <FormMessage ok={state.ok} message={state.message} />
      <div><Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button></div>
    </form>
  );
}
