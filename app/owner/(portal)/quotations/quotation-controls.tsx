'use client';

import { useActionState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { quotationAction, type QuotationActionState } from './actions';

const initial: QuotationActionState = { ok: true };

export function QuotationControls({ quotationId, status, canConvert }: { quotationId: string; status: string; canConvert: boolean }) {
  const [state, action, pending] = useActionState<QuotationActionState, FormData>(quotationAction, initial);
  const canSend = status === 'DRAFT' || status === 'REQUESTED';
  const canShare = status === 'SENT';
  const canRevise = status === 'SENT' || status === 'REJECTED' || status === 'EXPIRED';
  const canCancel = !['CONVERTED', 'CANCELLED'].includes(status);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <button name="intent" value="send" form="send-form" disabled={pending} className={buttonClass('primary')}>Send to customer</button>
        ) : null}
        {canShare ? (
          <button name="intent" value="rotate" form="send-form" disabled={pending} className={buttonClass('secondary')}>New share link</button>
        ) : null}
        {canRevise ? (
          <button name="intent" value="revise" form="send-form" disabled={pending} className={buttonClass('secondary')}>Revise as draft</button>
        ) : null}
        {canConvert ? (
          <>
            <button name="intent" value="convert-cash" form="send-form" disabled={pending} className={buttonClass('primary')}>Convert to order (cash)</button>
            <button name="intent" value="convert-credit" form="send-form" disabled={pending} className={buttonClass('secondary')}>Convert to order (credit)</button>
          </>
        ) : null}
      </div>
      <form id="send-form" action={action}>
        <input type="hidden" name="quotationId" value={quotationId} />
      </form>
      {canCancel ? (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="quotationId" value={quotationId} />
          <label className="grid gap-1 text-sm">Cancel reason<input name="reason" required minLength={3} className="rounded-control border border-line px-3 py-2 text-sm" /></label>
          <button name="intent" value="cancel" disabled={pending} className={buttonClass('danger')}>Cancel quotation</button>
        </form>
      ) : null}
      <FormMessage ok={state.ok} message={state.message} />
      {state.shareUrl ? (
        <div className="grid gap-1 rounded-card border border-gold bg-cream p-4 text-sm">
          <span className="font-semibold text-burgundy">Share link (shown once)</span>
          <code className="break-all font-mono text-xs">{state.shareUrl}</code>
        </div>
      ) : null}
    </div>
  );
}
