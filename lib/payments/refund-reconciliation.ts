/**
 * Pure rules for gateway refunds. No server-only imports, so the unit tests can run them directly.
 *
 * Razorpay gives every refund we create a receipt equal to our refund id. The receipt is therefore the persistent
 * key that links a gateway refund back to our record, even when the response that carried the gateway id was lost.
 */

export interface GatewayRefundRecord {
  id: string;
  amount: number;
  status: string;
  receipt?: string | null;
  payment_id?: string | null;
}

export type ReconcileDecision =
  | { action: 'settle_success'; gatewayRefundId: string; amountPaise: number }
  | { action: 'settle_failed'; gatewayRefundId: string; amountPaise: number; reason: string }
  | { action: 'await_webhook'; gatewayRefundId: string; amountPaise: number }
  | { action: 'not_found' }
  | { action: 'conflict'; message: string };

/**
 * Decides what the gateway's own list says about one of our refunds.
 * - Exactly one record matches our receipt (or the gateway id we already hold): act on its status.
 * - No match: the gateway holds nothing for this request.
 * - More than one match, a different amount or a different id: refuse to act and ask for a person to look.
 */
export function decideReconciliation(input: {
  refundId: string;
  amountPaise: number;
  knownGatewayRefundId: string | null;
  records: GatewayRefundRecord[];
}): ReconcileDecision {
  const { refundId, amountPaise, knownGatewayRefundId, records } = input;
  const matches = records.filter(
    (record) => record.receipt === refundId || (knownGatewayRefundId !== null && record.id === knownGatewayRefundId),
  );
  if (matches.length === 0) return { action: 'not_found' };
  if (matches.length > 1) {
    return { action: 'conflict', message: 'Razorpay holds more than one refund for this request. Check the payment in the Razorpay dashboard.' };
  }
  const match = matches[0]!;
  if (knownGatewayRefundId !== null && match.id !== knownGatewayRefundId) {
    return { action: 'conflict', message: 'The gateway refund id does not match the id recorded for this refund.' };
  }
  if (Number(match.amount) !== amountPaise) {
    return { action: 'conflict', message: 'The amount Razorpay holds differs from this refund. Nothing was changed.' };
  }
  if (match.status === 'processed') return { action: 'settle_success', gatewayRefundId: match.id, amountPaise };
  if (match.status === 'failed') {
    return { action: 'settle_failed', gatewayRefundId: match.id, amountPaise, reason: 'refused by Razorpay' };
  }
  return { action: 'await_webhook', gatewayRefundId: match.id, amountPaise };
}

/**
 * Decides whether a failed call to Razorpay definitely did not create a refund ('refused'), or whether the outcome
 * is unknown ('ambiguous'). Only a clear client-side rejection is treated as refused. Timeouts, network errors,
 * rate limits and server errors are ambiguous, because the refund may have been created anyway.
 */
export function classifyGatewayFailure(cause: unknown): 'refused' | 'ambiguous' {
  const status = (cause as { status?: unknown })?.status;
  if (typeof status === 'number' && [400, 401, 403, 404, 422].includes(status)) return 'refused';
  return 'ambiguous';
}
