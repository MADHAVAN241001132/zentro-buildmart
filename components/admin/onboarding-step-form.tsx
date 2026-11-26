'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { activateOnboardingAction, saveOnboardingStepAction, type OnboardingState } from '@/app/admin/(portal)/onboarding/actions';
import { STEP_TITLES } from '@/lib/onboarding/rules';
import { FEATURE_KEYS } from '@/lib/validation/admin';

type Draft = Record<string, Record<string, unknown> | undefined>;

export interface PlanOption {
  id: string;
  name: string;
  billing_interval: string;
  price_paise: number;
  max_products: number | null;
}

interface Props {
  onboardingId: string;
  step: number;
  draft: Draft;
  plans: PlanOption[];
  storeSlug: string | null;
  issues: string[];
  completed: boolean;
  ownerLinked: boolean;
}

const INITIAL: OnboardingState = { ok: false };

const FEATURE_LABELS: Record<(typeof FEATURE_KEYS)[number], string> = {
  online_payments: 'Online payments',
  pos_billing: 'POS billing',
  quotations: 'Quotations',
  credit_ledger: 'Customer credit',
  delivery: 'Delivery',
  coupons: 'Coupons',
  tile_batches: 'Tile batches',
  purchase_orders: 'Purchase orders',
  room_visualiser: 'Room Visualizer',
  qr_scan_analytics: 'QR scan analytics',
  house_project_planner: 'House Project Planner',
  bulk_imports: 'Bulk imports',
  reports: 'Reports and exports',
};

const BUSINESS_CATEGORIES = ['Tiles and flooring', 'Building materials', 'Sanitaryware', 'Paints and finishes', 'Hardware', 'Other'];

const input = 'w-full rounded-control border border-line bg-white px-3 py-2.5';

function value(draft: Draft, section: string, key: string): string {
  const v = draft[section]?.[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-ink">
      {label}
      {children}
      {error ? <span role="alert" className="text-xs font-normal text-danger">{error}</span> : null}
    </label>
  );
}

export function OnboardingStepForm({ onboardingId, step, draft, plans, storeSlug, issues, completed, ownerLinked }: Props) {
  const save = saveOnboardingStepAction.bind(null, onboardingId, step);
  const [state, formAction, pending] = useActionState(save, INITIAL);
  const [activateState, activateAction, activating] = useActionState(activateOnboardingAction.bind(null, onboardingId), INITIAL);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const errors = state.fieldErrors ?? {};

  const message = (s: OnboardingState) =>
    s.message ? (
      <p role={s.ok ? 'status' : 'alert'} className={`text-sm ${s.ok ? 'text-success' : 'text-danger'}`}>{s.message}</p>
    ) : null;

  if (step === 8) {
    const info = draft.info ?? {};
    return (
      <div className="grid gap-6">
        <section className="grid gap-2 rounded-card border border-line bg-card p-5 text-sm">
          <h2 className="font-display text-xl text-burgundy">Review</h2>
          <p><span className="text-ink-muted">Store:</span> {String(info.name ?? '–')} ({String(info.slug ?? '–')})</p>
          <p><span className="text-ink-muted">Owner linked:</span> {ownerLinked ? 'Yes' : 'No'}</p>
          <p><span className="text-ink-muted">Business state:</span> {value(draft, 'tax', 'businessState') || '–'}</p>
          <p><span className="text-ink-muted">GST registration:</span> {value(draft, 'tax', 'gstRegistration') || 'Not registered for GST'}</p>
          <p><span className="text-ink-muted">Subscription:</span> {draft.subscription ? 'Assigned' : 'Not assigned'}</p>
          <p><span className="text-ink-muted">Features:</span> {draft.features ? 'Configured' : 'Not configured'}</p>
        </section>
        {completed ? (
          <p className="rounded-card bg-success/10 p-4 text-sm text-success">Onboarding is complete and the store is active.</p>
        ) : (
          <form action={activateAction} className="grid gap-3 rounded-card border border-line bg-card p-5">
            {issues.length > 0 ? (
              <ul className="list-disc pl-5 text-sm text-danger">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Every requirement is met. Activating makes the storefront live.</p>
            )}
            {message(activateState)}
            <button
              type="submit"
              disabled={activating || issues.length > 0}
              className="justify-self-start rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream disabled:opacity-50"
            >
              {activating ? 'Activating…' : 'Activate store'}
            </button>
          </form>
        )}
      </div>
    );
  }

  if (step === 7) {
    return (
      <form action={formAction} className="grid gap-4 rounded-card border border-line bg-card p-5">
        <p className="text-sm text-ink-muted">Creates the showroom QR for this store. It is safe to repeat: an existing QR is reused.</p>
        {storeSlug ? (
          <div className="grid gap-2 text-sm">
            <p>Storefront: <span className="font-mono">/store/{storeSlug}</span></p>
            <a className="font-semibold text-burgundy" href={`/api/store/${storeSlug}/qr?target=showroom&download=1`}>Download the QR image (available once generated)</a>
          </div>
        ) : null}
        {message(state)}
        <button type="submit" disabled={pending} className="justify-self-start rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream disabled:opacity-50">
          {pending ? 'Generating…' : 'Generate store QR'}
        </button>
        <StepNav step={step} onboardingId={onboardingId} pending={pending} showSubmit={false} />
      </form>
    );
  }

  return (
    <form action={formAction} className="grid gap-5 rounded-card border border-line bg-card p-5">
      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name" error={errors.name}><input name="name" defaultValue={value(draft, 'info', 'name')} className={input} required /></Field>
          <Field label="Store slug" error={errors.slug}><input name="slug" defaultValue={value(draft, 'info', 'slug')} className={input} required /></Field>
          <Field label="Business category" error={errors.category}>
            <select name="category" defaultValue={value(draft, 'info', 'category')} className={input} required>
              <option value="">Choose a category</option>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Contact phone" error={errors.phone}><input name="phone" defaultValue={value(draft, 'info', 'phone')} className={input} /></Field>
          <Field label="Contact email" error={errors.email}><input name="email" type="email" defaultValue={value(draft, 'info', 'email')} className={input} /></Field>
          <Field label="Brand colour" error={errors.brandColour}><input name="brandColour" defaultValue={value(draft, 'info', 'brandColour') || '#6A0D2A'} className={input} /></Field>
          <Field label="Store address" error={errors.addressLine}><input name="addressLine" defaultValue={value(draft, 'info', 'addressLine')} className={input} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" error={errors.city}><input name="city" defaultValue={value(draft, 'info', 'city')} className={input} /></Field>
            <Field label="Pincode" error={errors.pincode}><input name="pincode" defaultValue={value(draft, 'info', 'pincode')} className={input} /></Field>
          </div>
          <Field label="State" error={errors.state}><input name="state" defaultValue={value(draft, 'info', 'state')} className={input} /></Field>
          <Field label="Business description" error={errors.description}><textarea name="description" rows={3} defaultValue={value(draft, 'info', 'description')} className={input} /></Field>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {ownerLinked ? (
            <p className="sm:col-span-2 rounded-control bg-cream p-3 text-sm text-ink-muted">
              An owner account is already linked to this store. It will not be created again. Save to continue.
            </p>
          ) : null}
          <Field label="Owner name" error={errors.fullName}><input name="fullName" defaultValue={value(draft, 'owner', 'fullName')} className={input} disabled={ownerLinked} /></Field>
          <Field label="Owner email" error={errors.email}><input name="email" type="email" defaultValue={value(draft, 'owner', 'email')} className={input} disabled={ownerLinked} /></Field>
          <Field label="Owner mobile" error={errors.phone}><input name="phone" defaultValue={value(draft, 'owner', 'phone')} className={input} disabled={ownerLinked} /></Field>
          <Field label="Role" error={errors.role}>
            <select name="role" defaultValue={value(draft, 'owner', 'role') || 'owner'} className={input} disabled={ownerLinked}>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </Field>
          {ownerLinked ? null : (
            <Field label="Temporary password" error={errors.password}>
              <input name="password" type="password" autoComplete="new-password" className={input} />
            </Field>
          )}
          {ownerLinked ? null : <p className="sm:col-span-2 text-xs text-ink-muted">The password is not saved in the draft. Share it with the owner through a secure channel.</p>}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registered business name" error={errors.legalName}><input name="legalName" defaultValue={value(draft, 'tax', 'legalName')} className={input} /></Field>
          <Field label="GSTIN (required for a registered business)" error={errors.gstin}><input name="gstin" defaultValue={value(draft, 'tax', 'gstin')} className={input} /></Field>
          <Field label="GST registration" error={errors.gstRegistration}>
            <select name="gstRegistration" defaultValue={value(draft, 'tax', 'gstRegistration') || 'unregistered'} className={input}>
              <option value="regular">Regular taxpayer</option>
              <option value="composition">Composition scheme</option>
              <option value="unregistered">Not registered for GST</option>
            </select>
          </Field>
          <Field label="Business state" error={errors.businessState}><input name="businessState" defaultValue={value(draft, 'tax', 'businessState')} className={input} /></Field>
          <Field label="Billing address" error={errors.billingAddress}><textarea name="billingAddress" rows={2} defaultValue={value(draft, 'tax', 'billingAddress')} className={input} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="pricesIncludeGst" defaultChecked={draft.tax?.pricesIncludeGst === true} className="accent-burgundy" />
            Listed prices already include GST
          </label>
          <p className="sm:col-span-2 text-xs text-ink-muted">
            Tax calculations on invoices follow the place-of-supply rules in a later release. The GSTIN and state are stored now; please have a tax adviser confirm the settings before go-live.
          </p>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Store logo (optional)" error={errors.logo}>
            <input name="logo" type="file" accept="image/*" className={input} onChange={(e) => setLogoUrl(e.target.files?.[0] ? URL.createObjectURL(e.target.files[0]) : null)} />
          </Field>
          <Field label="Store banner (optional)" error={errors.banner}>
            <input name="banner" type="file" accept="image/*" className={input} onChange={(e) => setBannerUrl(e.target.files?.[0] ? URL.createObjectURL(e.target.files[0]) : null)} />
          </Field>
          {logoUrl ? <img src={logoUrl} alt="Logo preview" className="h-24 w-24 rounded-control bg-cream object-contain p-2" /> : null}
          {bannerUrl ? <img src={bannerUrl} alt="Banner preview" className="h-24 w-full rounded-control bg-cream object-cover" /> : null}
          <p className="sm:col-span-2 text-xs text-ink-muted">Uploads use the existing secure Storage pipeline. Skip this step if the branding is not ready.</p>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Plan" error={errors.planId}>
            <select name="planId" defaultValue={value(draft, 'subscription', 'planId')} className={input} required>
              <option value="">Choose a plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.billing_interval} · ₹{(p.price_paise / 100).toLocaleString('en-IN')}
                  {p.max_products ? ` · up to ${p.max_products} products` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date" error={errors.periodStart}><input name="periodStart" type="date" defaultValue={value(draft, 'subscription', 'periodStart')} className={input} /></Field>
          <Field label="Expiry date" error={errors.periodEnd}><input name="periodEnd" type="date" defaultValue={value(draft, 'subscription', 'periodEnd')} className={input} /></Field>
          <p className="sm:col-span-3 text-xs text-ink-muted">User limits are not yet part of the plan model; only the product limit shown above applies.</p>
        </div>
      ) : null}

      {step === 6 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURE_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={key} defaultChecked={draft.features?.[key] === true} className="accent-burgundy" />
              {FEATURE_LABELS[key]}
            </label>
          ))}
        </div>
      ) : null}

      {message(state)}
      <StepNav step={step} onboardingId={onboardingId} pending={pending} />
    </form>
  );
}

function StepNav({ step, onboardingId, pending, showSubmit = true }: { step: number; onboardingId: string; pending: boolean; showSubmit?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      {step > 1 ? (
        <Link href={`/admin/onboarding/${onboardingId}?step=${step - 1}`} className="text-sm font-semibold text-burgundy">
          Previous: {STEP_TITLES[step - 2]}
        </Link>
      ) : <span />}
      {showSubmit ? (
        <button type="submit" disabled={pending} className="rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream disabled:opacity-50">
          {pending ? 'Saving…' : 'Save draft and continue'}
        </button>
      ) : null}
    </div>
  );
}
