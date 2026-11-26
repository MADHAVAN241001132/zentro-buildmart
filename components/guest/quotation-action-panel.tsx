'use client';

import { useActionState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';

export interface QuoteActionButton {
  intent: string;
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  confirm?: string;
}

interface Props {
  action: (prev: { ok: boolean; message?: string }, formData: FormData) => Promise<{ ok: boolean; message?: string }>;
  hidden: Record<string, string>;
  buttons: QuoteActionButton[];
  noteField?: boolean;
}

/** Runs one customer quotation action (accept, reject, withdraw, convert) and shows the outcome. */
export function QuotationActionPanel({ action, hidden, buttons, noteField }: Props) {
  const [state, submit, pending] = useActionState(action, { ok: true });
  return (
    <form action={submit} className="grid gap-3">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {noteField ? (
        <label className="grid gap-1 text-sm">Note to the store (optional)
          <textarea name="note" rows={2} maxLength={500} className="rounded-control border border-line px-3 py-2 text-sm" />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {buttons.map((button) => (
          <button
            key={button.intent}
            name="intent"
            value={button.intent}
            disabled={pending}
            className={buttonClass(button.variant)}
            onClick={(event) => {
              if (button.confirm && !window.confirm(button.confirm)) event.preventDefault();
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
      <FormMessage ok={state.ok} message={state.message} />
    </form>
  );
}
