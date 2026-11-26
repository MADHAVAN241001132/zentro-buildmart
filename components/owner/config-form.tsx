'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { CheckField, SelectField, TextField } from './field';

export interface ConfigField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'url' | 'checkbox' | 'select';
  defaultValue?: string | number;
  defaultChecked?: boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Shared form for simple catalogue records (categories, subcategories, brands).
 * The action is a bound server action; the field list describes the inputs.
 */
export function ConfigForm({
  action,
  fields,
  submitLabel,
  compact = false,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  fields: ConfigField[];
  submitLabel: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ActionResult);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className={`grid gap-3 ${compact ? 'md:grid-cols-[1fr_1fr_auto] md:items-end' : ''}`} noValidate>
      {fields.map((f) => {
        if (f.type === 'checkbox') return <CheckField key={f.name} name={f.name} label={f.label} defaultChecked={f.defaultChecked} />;
        if (f.type === 'select')
          return (
            <SelectField key={f.name} name={f.name} label={f.label} defaultValue={String(f.defaultValue ?? '')} error={errors[f.name]} hint={f.hint}>
              {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectField>
          );
        return (
          <TextField
            key={f.name}
            name={f.name}
            label={f.label}
            type={f.type === 'url' ? 'url' : f.type === 'number' ? 'number' : 'text'}
            inputMode={f.type === 'number' ? 'numeric' : undefined}
            defaultValue={f.defaultValue}
            required={f.required}
            error={errors[f.name]}
            hint={f.hint}
          />
        );
      })}
      <div className="grid gap-2">
        <FormMessage ok={state.ok} message={state.message} />
        <div>
          <Button type="submit" variant={compact ? 'secondary' : 'primary'} disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button>
        </div>
      </div>
    </form>
  );
}
