import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const CONTROL = 'rounded-control border border-line bg-white px-3 py-2.5 text-ink focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40';

type Common = { name: string; label: string; error?: string; hint?: string; className?: string };

function Wrap({ id, label, error, hint, className, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ''}`}>
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

export function SelectField({ name, label, error, hint, className, children, ...props }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `f-${name}`;
  return (
    <Wrap id={id} name={name} label={label} error={error} hint={hint} className={className}>
      <select id={id} name={name} aria-invalid={Boolean(error)} className={CONTROL} suppressHydrationWarning {...props}>
        {children}
      </select>
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
