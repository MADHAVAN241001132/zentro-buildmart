'use client';

import { useActionState, useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { CreditCard, Store, Check } from 'lucide-react';
import { placeOrderAction, type ActionState } from '@/app/store/[storeSlug]/actions';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { GST_STATE_CODES } from '@/lib/gst/policy';

const INITIAL: ActionState = { ok: false };

/** One input style for every checkout control, so validation and focus states match. */
const CONTROL =
  'w-full rounded-control border border-line bg-white px-3 py-2.5 text-ink placeholder:text-ink-muted/70 ' +
  'focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40 aria-[invalid=true]:border-danger';

interface Props {
  storeSlug: string;
  onlineEnabled: boolean;
  cashEnabled: boolean;
  totalLabel: string;
}

export function CheckoutForm({ storeSlug, onlineEnabled, cashEnabled, totalLabel }: Props) {
  const action = placeOrderAction.bind(null, storeSlug);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const errors = state.fieldErrors ?? {};
  const defaultMethod = onlineEnabled ? 'online' : 'cash';
  // One key per checkout attempt: a double submit or a retry of the same details replays, never duplicates.
  const [clientKey, setClientKey] = useState('');
  useEffect(() => setClientKey(crypto.randomUUID()), []);
  const requestKey = state.requestKey ?? clientKey;

  return (
    <form action={formAction} className="grid gap-8" noValidate>
      <FormSection step="1" title="Your details" description="We use these to contact you about your order and to produce the invoice.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="customerName" label="Full name" error={errors.customerName} autoComplete="name" required />
          <Field name="customerMobile" label="Mobile number" error={errors.customerMobile} inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" required />
          <Field name="customerEmail" label="Email" optional error={errors.customerEmail} type="email" autoComplete="email" />
          <SelectField name="supplyStateCode" label="State where the order will be delivered" error={errors.supplyStateCode} required defaultValue="">
            <option value="" disabled>Choose a state</option>
            {GST_STATE_CODES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </SelectField>
        </div>
      </FormSection>

      <FormSection step="2" title="Payment method" description="Choose how you would like to pay. Totals include GST as shown in your summary.">
        <fieldset className="grid gap-3" aria-describedby={errors.method ? 'method-error' : undefined}>
          <legend className="sr-only">Payment method</legend>
          {onlineEnabled ? (
            <PaymentOption
              name="method"
              value="online"
              defaultChecked={defaultMethod === 'online'}
              icon={<CreditCard className="h-5 w-5" aria-hidden />}
              title="Pay online"
              body="UPI, cards and netbanking through Razorpay. Your order is confirmed when the payment succeeds."
              badge="Instant confirmation"
            />
          ) : null}
          {cashEnabled ? (
            <PaymentOption
              name="method"
              value="cash"
              defaultChecked={defaultMethod === 'cash'}
              icon={<Store className="h-5 w-5" aria-hidden />}
              title="Pay at the showroom"
              body="Your items are held for 30 minutes. Pay the cashier, who confirms your payment."
            />
          ) : null}
          {errors.method ? <p id="method-error" className="text-sm text-danger">{errors.method}</p> : null}
        </fieldset>
      </FormSection>

      <input type="hidden" name="request_key" value={requestKey} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="grid gap-2">
        <Button type="submit" disabled={pending || requestKey === ''} className="w-full py-3.5 text-base">
          {pending ? 'Placing order…' : `Place order · ${totalLabel}`}
        </Button>
        <p className="text-center text-xs text-ink-muted">Prices and GST are calculated on the server when you place the order.</p>
      </div>
    </form>
  );
}

function FormSection({ step, title, description, children }: { step: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest sm:p-6">
      <header className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-burgundy text-xs font-semibold text-cream">
          {step}
        </span>
        <div className="grid gap-0.5">
          <h2 className="font-display text-xl text-burgundy">{title}</h2>
          {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function PaymentOption({
  name,
  value,
  defaultChecked,
  icon,
  title,
  body,
  badge,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  icon: ReactNode;
  title: string;
  body: string;
  badge?: string;
}) {
  return (
    <label className="group relative flex cursor-pointer items-start gap-4 rounded-card border border-line bg-cream/40 p-4 transition hover:border-burgundy/50 focus-within:ring-2 focus-within:ring-gold has-[:checked]:border-burgundy has-[:checked]:bg-card has-[:checked]:shadow-rest">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="sr-only" />
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-burgundy/10 text-burgundy">{icon}</span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{title}</span>
          {badge ? <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-burgundy">{badge}</span> : null}
        </span>
        <span className="text-sm text-ink-muted">{body}</span>
      </span>
      <span aria-hidden="true" className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-white text-cream group-has-[:checked]:border-burgundy group-has-[:checked]:bg-burgundy">
        <Check className="h-3 w-3 opacity-0 group-has-[:checked]:opacity-100" />
      </span>
    </label>
  );
}

function Field({
  name,
  label,
  error,
  optional = false,
  ...props
}: { name: string; label: string; error?: string; optional?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional ? <span className="ml-1 font-normal text-ink-muted">(optional)</span> : null}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={CONTROL}
        {...props}
      />
      {error ? <p id={`${id}-error`} className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function SelectField({
  name,
  label,
  error,
  children,
  ...props
}: { name: string; label: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `field-${name}`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <select
        id={id}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={CONTROL}
        {...props}
      >
        {children}
      </select>
      {error ? <p id={`${id}-error`} className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
