import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold transition ' +
  'disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-burgundy text-cream hover:bg-burgundy-deep',
  secondary: 'border border-line bg-card text-ink hover:bg-cream',
  ghost: 'text-burgundy hover:bg-burgundy/5',
  danger: 'bg-danger text-white hover:opacity-90',
};

export function buttonClass(variant: ButtonVariant = 'primary', extra?: string): string {
  return [BASE, VARIANTS[variant], extra].filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} suppressHydrationWarning {...props} />;
}
