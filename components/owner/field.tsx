import type { ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ScrollableSelect } from '@/components/ui/scrollable-select';

const CONTROL = 'rounded-control border border-line bg-white px-3 py-2.5 text-base text-ink focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40 md:text-sm';

type Common = { name: string; label: string; error?: string; hint?: string; className?: string };

function Wrap({ id, label, error, hint, className, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div className={`grid min-w-0 gap-1.5 ${className ?? ''}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function TextField({ name, label, error, hint, className, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <Wrap id={id} name={name} label={label} error={error} hint={hint} className={className}>
      <input id={id} name={name} aria-invalid={Boolean(error)} className={CONTROL} suppressHydrationWarning {...props} />
    </Wrap>
  );
}

export function SelectField({
  name,
  label,
  error,
  hint,
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `f-${name}`;
  return (
    <Wrap id={id} name={name} label={label} error={error} hint={hint} className={className}>
      <ScrollableSelect
        id={id}
        name={name}
        value={value !== undefined ? String(value) : undefined}
        defaultValue={defaultValue !== undefined ? String(defaultValue) : undefined}
        disabled={disabled}
        required={required}
        ariaInvalid={Boolean(error)}
        onValueChange={
          onChange
            ? (next) => {
                onChange({ target: { value: next, name } } as ChangeEvent<HTMLSelectElement>);
              }
            : undefined
        }
      >
        {children}
      </ScrollableSelect>
    </Wrap>
  );
}

export function TextAreaField({ name, label, error, hint, className, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `f-${name}`;
  return (
    <Wrap id={id} name={name} label={label} error={error} hint={hint} className={className}>
      <textarea id={id} name={name} aria-invalid={Boolean(error)} className={CONTROL} rows={3} suppressHydrationWarning {...props} />
    </Wrap>
  );
}

export function CheckField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-ink">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-burgundy" suppressHydrationWarning />
      {label}
    </label>
  );
}
