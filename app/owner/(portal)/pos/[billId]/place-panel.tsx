'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { RazorpayPayButton } from '@/components/guest/razorpay-pay-button';
import { formatINR } from '@/lib/money';
import { cancelBillAction, placeBillAction, type PosState } from '../actions';

const INITIAL: PosState = { ok: false };
const FIELD = 'rounded-control border border-line bg-card px-3 py-2 text-sm';

export function PlacePanel({
  billId,
  status,
  editable,
  canPlace,
  hasItems,
  creditAllowed,
  totalPaise,
  keyId,
  cancelReason,
}: {
  billId: string;
  status: string;
  editable: boolean;
  canPlace: boolean;
  hasItems: boolean;
  creditAllowed: boolean;
  totalPaise: number;
  keyId: string | null;
  cancelReason: string | null;
}) {
  const [placeState, placeAction, placing] = useActionState(placeBillAction, INITIAL);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelBillAction, INITIAL);
  const canPay = editable && canPlace && hasItems && totalPaise > 0;

  return (
    <section className="grid gap-4 rounded-card border border-line bg-card p-5">
      <h2 className="font-display text-lg text-burgundy">Payment</h2>

      {status === 'AWAITING_PAYMENT' ? (
        <p className="text-sm text-ink-muted">
          Waiting for the online payment. This bill completes automatically once the payment is confirmed.{' '}
          <a href={`/owner/pos/${billId}`} className="text-burgundy underline-offset-2 hover:underline">Refresh status</a>
        </p>
      ) : null}
      {status === 'CANCELLED' ? <p className="text-sm text-ink-muted">Reason: {cancelReason ?? '—'}</p> : null}
      {editable && !canPlace ? (
        <p className="text-sm text-ink-muted">Hold the bill to finish it later, or take payment now.</p>
      ) : null}

      {canPay ? (
        <div className="grid gap-3">
          <p className="text-sm">Amount due <span className="font-semibold text-burgundy">{formatINR(totalPaise)}</span></p>
          <PlaceForm billId={billId} method="cash" label="Take cash" disabled={placing} action={placeAction} />
          {creditAllowed ? (
            <PlaceForm billId={billId} method="credit" label="Add to customer credit" disabled={placing} action={placeAction} variant="secondary" />
          ) : (
            <p className="text-xs text-ink-muted">Credit sales need a customer who is approved for credit.</p>
          )}
          {keyId ? (
            <PlaceForm billId={billId} method="online" label={placing ? 'Preparing payment…' : 'Pay online'} disabled={placing} action={placeAction} variant="secondary" />
          ) : (
            <p className="text-xs text-ink-muted">Online payment is not configured for this store yet.</p>
          )}
        </div>
      ) : null}

      <FormMessage ok={placeState.ok && !placeState.checkout} message={placeState.message} />
      {placeState.checkout ? (
        <RazorpayPayButton
          keyId={placeState.checkout.keyId}
          providerOrderId={placeState.checkout.providerOrderId}
          amountPaise={placeState.checkout.amountPaise}
          orderNumber={placeState.checkout.orderNumber}
          customerName="Walk-in customer"
          customerMobile=""
        />
      ) : null}

      {editable ? (
        <form action={cancelAction} className="grid gap-2 border-t border-line pt-4">
          <input type="hidden" name="billId" value={billId} />
          <label className="grid gap-1 text-sm">
            Cancel this bill (reason)
            <input name="reason" minLength={3} maxLength={200} className={FIELD} required />
          </label>
          <FormMessage ok={cancelState.ok} message={cancelState.message} />
          <div>
            <Button type="submit" variant="danger" disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel bill'}</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function PlaceForm({
  billId,
  method,
  label,
  disabled,
  action,
  variant = 'primary',
}: {
  billId: string;
  method: 'cash' | 'credit' | 'online';
  label: string;
  disabled: boolean;
  action: (payload: FormData) => void;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <form action={action}>
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="method" value={method} />
      <Button type="submit" variant={variant} disabled={disabled} className="w-full">{label}</Button>
    </form>
  );
}
