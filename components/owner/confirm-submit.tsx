'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { buttonClass, type ButtonVariant } from '@/components/ui/button';

/**
 * Submit button that asks for confirmation before a destructive or financial action.
 * Uses the browser confirm dialog; the server action still performs its own checks.
 */
export function ConfirmSubmit({
  message,
  children,
  variant = 'secondary',
  name,
  value,
}: {
  message: string;
  children: ReactNode;
  variant?: ButtonVariant;
  /** Optional form field name and value, so a form can offer several confirmed choices. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant)}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}
