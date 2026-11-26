'use client';
import { useActionState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import type { ProvisioningActionState } from '@/app/admin/(portal)/provisioning/actions';

type Action = (prev: ProvisioningActionState, formData: FormData) => Promise<ProvisioningActionState>;

/** Small form for one reconciliation decision. Password inputs are never echoed back into the form state. */
export function ProvisioningForm({
  action,
  requestId,
  label,
  fields,
  variant = 'secondary',
}: {
  action: Action;
  requestId: string;
  label: string;
  fields: { name: string; label: string; type?: 'text' | 'password' | 'email'; optional?: boolean; minLength?: number }[];
  variant?: 'primary' | 'secondary';
}) {
  const [state, formAction, pending] = useActionState(action, { ok: null } as ProvisioningActionState);
  return (
    <form action={formAction} className="grid gap-2 rounded-card border border-line bg-cream p-3">
      <input type="hidden" name="request_id" value={requestId} />
      {fields.map((f) => (
        <label key={f.name} className="grid gap-1 text-xs text-ink-muted">
          {f.label}
          <input
            name={f.name}
            type={f.type ?? 'text'}
            required={!f.optional}
            minLength={f.minLength}
            autoComplete="off"
            className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink"
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass(variant)}>
          {pending ? 'Working…' : label}
        </button>
        <FormMessage ok={state.ok} message={state.message} />
      </div>
    </form>
  );
}
