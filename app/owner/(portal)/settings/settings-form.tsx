'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { CheckField, SelectField, TextField } from '@/components/owner/field';
import { saveSettingsAction, type SettingsState } from './actions';

const INITIAL: SettingsState = { ok: false };

export interface SettingsDefaults {
  orderPrefix: string;
  invoicePrefix: string;
  reservationMinutes: number;
  paymentExpiryMinutes: number;
  defaultLanguage: string;
  notificationEmail: string;
  onlineEnabled: boolean;
  cashEnabled: boolean;
  catalogueVisible: boolean;
  deliveryChargeRupees: string;
  freeDeliveryAboveRupees: string;
}

export function SettingsForm({ defaults }: { defaults: SettingsDefaults }) {
  const [state, action, pending] = useActionState(saveSettingsAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-6 rounded-card border border-line bg-card p-6" noValidate>
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 font-display text-xl text-burgundy">Payments and visibility</legend>
        <CheckField name="onlineEnabled" label="Accept online payments (Razorpay)" defaultChecked={defaults.onlineEnabled} />
        <CheckField name="cashEnabled" label="Accept cash at the showroom" defaultChecked={defaults.cashEnabled} />
        <CheckField name="catalogueVisible" label="Show the catalogue to customers" defaultChecked={defaults.catalogueVisible} />
        <TextField name="reservationMinutes" label="Stock hold for cash orders (minutes)" inputMode="numeric" defaultValue={defaults.reservationMinutes} error={e.reservationMinutes} />
        <TextField name="paymentExpiryMinutes" label="Payment window (minutes)" inputMode="numeric" defaultValue={defaults.paymentExpiryMinutes} error={e.paymentExpiryMinutes} />
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 font-display text-xl text-burgundy">Delivery</legend>
        <TextField name="deliveryChargeRupees" label="Delivery charge (₹)" inputMode="decimal" defaultValue={defaults.deliveryChargeRupees} error={e.deliveryChargeRupees} hint="Applies to delivery orders only" />
        <TextField name="freeDeliveryAboveRupees" label="Free delivery above (₹, optional)" inputMode="decimal" defaultValue={defaults.freeDeliveryAboveRupees} error={e.freeDeliveryAboveRupees} />
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 font-display text-xl text-burgundy">Documents and language</legend>
        <TextField name="orderPrefix" label="Order number prefix" defaultValue={defaults.orderPrefix} error={e.orderPrefix} hint="Capital letters, for example ZBM" />
        <TextField name="invoicePrefix" label="Invoice number prefix" defaultValue={defaults.invoicePrefix} error={e.invoicePrefix} />
        <SelectField name="defaultLanguage" label="Default storefront language" defaultValue={defaults.defaultLanguage} error={e.defaultLanguage}>
          <option value="en">English</option>
          <option value="ta">Tamil (labels pending translation)</option>
        </SelectField>
        <TextField name="notificationEmail" label="Notification email" type="email" defaultValue={defaults.notificationEmail} error={e.notificationEmail} />
      </fieldset>

      <FormMessage ok={state.ok} message={state.message} />
      <div><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</Button></div>
    </form>
  );
}
