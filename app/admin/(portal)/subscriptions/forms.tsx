'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { CheckField, SelectField, TextField } from '@/components/owner/field';
import { PREMIUM_FEATURE_KEYS } from '@/lib/entitlements/rules';
import { assignSubscriptionAction, createPlanAction, grantAllowanceAction, renewSubscriptionAction, updatePlanAction, type SubscriptionState } from './actions';

const INITIAL = { ok: false } as SubscriptionState;

export const PLAN_FEATURE_LABELS: Record<(typeof PREMIUM_FEATURE_KEYS)[number], string> = {
  online_payments: 'Online payments',
  pos_billing: 'POS billing',
  quotations: 'Quotations',
  credit_ledger: 'Credit ledger',
  delivery: 'Delivery management',
  coupons: 'Coupons',
  tile_batches: 'Tile batches',
  purchase_orders: 'Purchase orders',
  room_visualiser: 'Room visualiser',
  qr_scan_analytics: 'QR scan analytics',
  house_project_planner: 'House project planner',
  bulk_imports: 'Bulk imports',
  reports: 'Reports and exports',
};

/** Shared plan fields for create and edit. Feature switches show enabled unless the plan explicitly disables them. */
function PlanFields({ values, errors, codeEditable }: {
  values?: { code?: string; name?: string; description?: string | null; priceRupees?: string; maxProducts?: number | null; productsUnlimited?: boolean; maxUsers?: number | null; usersUnlimited?: boolean; isActive?: boolean; billingInterval?: string; features?: Record<string, unknown> };
  errors: Record<string, string>;
  codeEditable: boolean;
}) {
  const features = values?.features ?? {};
  return (
    <>
      <TextField name="code" label="Code" defaultValue={values?.code} disabled={!codeEditable} error={errors.code} hint={codeEditable ? 'Lowercase, for example growth_monthly' : 'The code cannot be changed'} />
      <TextField name="name" label="Name" defaultValue={values?.name} error={errors.name} />
      <SelectField name="billingInterval" label="Billing" defaultValue={values?.billingInterval ?? 'monthly'} error={errors.billingInterval} hint="Applies to new assignments">
        <option value="monthly">Monthly</option>
        <option value="annual">Annual</option>
      </SelectField>
      <TextField name="priceRupees" label="Price (₹)" inputMode="decimal" defaultValue={values?.priceRupees} error={errors.priceRupees} hint="Applies to new assignments and renewals" />
      <TextField name="maxProducts" label="Product limit" inputMode="numeric" defaultValue={values?.maxProducts ? String(values.maxProducts) : ''} error={errors.maxProducts} hint="Required unless unlimited is ticked" />
      <CheckField name="productsUnlimited" label="Unlimited products (explicit)" defaultChecked={values?.productsUnlimited} />
      <TextField name="maxUsers" label="User limit" inputMode="numeric" defaultValue={values?.maxUsers ? String(values.maxUsers) : '5'} error={errors.maxUsers} hint="Owners, managers and staff. Default 5" />
      <CheckField name="usersUnlimited" label="Unlimited users (explicit)" defaultChecked={values?.usersUnlimited} />
      <div className="md:col-span-3">
        <TextField name="description" label="Description" defaultValue={values?.description ?? ''} error={errors.description} hint="Shown to the platform team. Up to 500 characters" />
      </div>
      <fieldset className="md:col-span-3 grid gap-2 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium text-ink">Premium features on this plan</legend>
        {PREMIUM_FEATURE_KEYS.map((key) => (
          <CheckField key={key} name={`feature_${key}`} label={PLAN_FEATURE_LABELS[key]} defaultChecked={features[key] !== false} />
        ))}
      </fieldset>
      <CheckField name="isActive" label="Active for new assignments" defaultChecked={values?.isActive ?? true} />
    </>
  );
}

export function PlanForm() {
  const [state, action, pending] = useActionState(createPlanAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-5 md:grid-cols-3" noValidate>
      <PlanFields errors={e} codeEditable />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="md:col-span-3"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Create plan'}</Button></div>
    </form>
  );
}

export interface EditablePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billing_interval: string;
  price_paise: number;
  max_products: number | null;
  products_unlimited: boolean;
  max_users: number | null;
  users_unlimited: boolean;
  is_active: boolean;
  features: Record<string, unknown> | null;
}

/**
 * Edits a plan. Limits and feature switches apply at once to every store on the plan.
 * The price applies to new assignments and renewals, not to payments already recorded.
 */
export function PlanEditForm({ plan }: { plan: EditablePlan }) {
  const [state, action, pending] = useActionState(updatePlanAction.bind(null, plan.id), INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 p-5 md:grid-cols-3" noValidate>
      <PlanFields
        codeEditable={false}
        errors={e}
        values={{
          code: plan.code,
          name: plan.name,
          description: plan.description,
          priceRupees: (plan.price_paise / 100).toFixed(2),
          maxProducts: plan.max_products,
          productsUnlimited: plan.products_unlimited,
          maxUsers: plan.max_users,
          usersUnlimited: plan.users_unlimited,
          isActive: plan.is_active,
          billingInterval: plan.billing_interval,
          features: plan.features ?? {},
        }}
      />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="md:col-span-3"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save plan'}</Button></div>
    </form>
  );
}

export function AssignForm({ stores, plans }: { stores: { id: string; name: string }[]; plans: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(assignSubscriptionAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-5 md:grid-cols-2" noValidate>
      <SelectField name="storeId" label="Store" error={e.storeId}>
        <option value="">Choose a store</option>
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <SelectField name="planId" label="Plan" error={e.planId}>
        <option value="">Choose a plan</option>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </SelectField>
      <SelectField name="status" label="Status" defaultValue="active" error={e.status}>
        <option value="trialing">Trialing</option>
        <option value="active">Active</option>
        <option value="grace">Grace</option>
      </SelectField>
      <div />
      <TextField name="periodStart" label="Period start" type="date" error={e.periodStart} />
      <TextField name="periodEnd" label="Period end" type="date" error={e.periodEnd} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending ? 'Assigning…' : 'Assign subscription'}</Button></div>
    </form>
  );
}

export function RenewForm({ id }: { id: string }) {
  const bound = renewSubscriptionAction;
  const [state, action, pending] = useActionState(bound, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <TextField name="periodEnd" label="New end date" type="date" error={state.fieldErrors?.periodEnd} className="min-w-40" />
      <Button type="submit" disabled={pending} variant="secondary">{pending ? 'Renewing…' : 'Renew'}</Button>
      {state.message ? <span className={`text-xs ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</span> : null}
    </form>
  );
}

export function AllowanceForm({ stores }: { stores: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(grantAllowanceAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-5 md:grid-cols-2" noValidate>
      <SelectField name="storeId" label="Store without a subscription" error={e.storeId}>
        <option value="">Choose a store</option>
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <TextField name="expiresOn" label="Allowance ends on" placeholder="YYYY-MM-DD" hint="Between tomorrow and 90 days from today" error={e.expiresOn} />
      <TextField name="reason" label="Reason" error={e.reason} hint="Recorded in the audit log" />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Grant allowance'}</Button></div>
    </form>
  );
}
