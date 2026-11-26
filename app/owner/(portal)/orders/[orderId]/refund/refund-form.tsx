'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { refundOrderAction, type RefundState } from './actions';

const INITIAL: RefundState = { ok: false };
const FIELD = 'rounded-control border border-line bg-card px-3 py-2 text-sm';

export interface RefundableLine {
  id: string;
  name: string;
  variantLabel: string;
  remaining: number;
  lineTotalPaise: number;
  refundedPaise: number;
}

/**
 * Returned quantities and conditions for one order. The page sends the request key; the server checks each line
 * against what is still returnable before it writes anything.
 */
export function RefundForm({
  orderId,
  requestKey,
  lines,
  disabledReason,
}: {
  orderId: string;
  requestKey: string;
  lines: RefundableLine[];
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState(refundOrderAction, INITIAL);

  if (disabledReason) {
    return <p className="text-sm text-ink-muted">{disabledReason}</p>;
  }

  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-5" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3 text-right">Still returnable</th>
              <th className="py-2 pr-3">Return qty</th>
              <th className="py-2">Condition</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-line">
                <td className="py-2 pr-3">
                  <div>{line.name}</div>
                  <div className="text-xs text-ink-muted">{line.variantLabel}</div>
                </td>
                <td className="py-2 pr-3 text-right">{line.remaining}</td>
                <td className="py-2 pr-3">
                  <input
                    name={`qty:${line.id}`}
                    inputMode="numeric"
                    defaultValue=""
                    placeholder="0"
                    disabled={line.remaining === 0}
                    aria-label={`Return quantity for ${line.name}`}
                    className={`${FIELD} w-24`}
                  />
                </td>
                <td className="py-2">
                  <select name={`cond:${line.id}`} defaultValue="restock" disabled={line.remaining === 0} className={FIELD}>
                    <option value="restock">Back to stock</option>
                    <option value="damaged">Damaged (not sellable)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="grid gap-1 text-sm">
        Reason for the refund
        <input name="reason" maxLength={200} className={FIELD} placeholder="e.g. Wrong size; damaged on arrival" />
      </label>
      <FormMessage ok={state.message ? state.ok : null} message={state.message} />
      <div>
        <Button type="submit" disabled={pending}>{pending ? 'Recording…' : 'Record refund'}</Button>
      </div>
    </form>
  );
}
