import 'server-only';
import { friendly } from '@/lib/errors';
import { classifyGatewayFailure, decideReconciliation, type ReconcileDecision } from '@/lib/payments/refund-reconciliation';
import { createRazorpayRefund, listRazorpayPaymentRefunds } from '@/lib/payments/razorpay';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export class RefundError extends Error {}

export interface RefundLineInput {
  orderItemId: string;
  quantity: number;
  condition: 'restock' | 'damaged';
}

export interface RefundOutcome {
  refundId: string;
  status: 'requested' | 'processing' | 'succeeded' | 'failed';
  /** True when a gateway send has an unknown outcome. Automatic resubmission is blocked until it is reconciled. */
  ambiguous: boolean;
  amountPaise: number;
  method: 'cash' | 'online' | 'credit';
  message: string;
}

interface CreatedRefund {
  replayed: boolean;
  refund_id: string;
  status: string;
  amount_paise: number;
  method: 'cash' | 'online' | 'credit';
  gateway_refund_needed?: boolean;
}

interface BeginResult {
  action: 'send' | 'busy' | 'blocked' | 'none';
  status: string;
  gateway_state: string;
  amount_paise?: number;
  provider_payment_id?: string;
  attempt?: number;
}

function outcomeOf(refundId: string, status: string, amountPaise: number, method: RefundOutcome['method'], ambiguous: boolean, message: string): RefundOutcome {
  return {
    refundId,
    status: status as RefundOutcome['status'],
    ambiguous,
    amountPaise,
    method,
    message,
  };
}

/**
 * Records a refund for an order. The database validates the lines, reserves the quantities and amount, and finalises
 * cash and credit refunds at once. Online refunds stay 'requested' until Razorpay confirms them through a signed event,
 * or until reconciliation finds the outcome.
 */
export async function createOrderRefund(input: {
  actorId: string;
  orderId: string;
  lines: RefundLineInput[];
  reason: string;
  requestKey: string;
}): Promise<RefundOutcome> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('create_refund', {
    p_order: input.orderId,
    p_lines: input.lines.map((line) => ({
      order_item_id: line.orderItemId,
      quantity: line.quantity,
      condition: line.condition,
    })),
    p_reason: input.reason,
    p_request_key: input.requestKey,
    p_actor: input.actorId,
  });
  if (error) throw new RefundError(friendly(error.message));
  const created = data as CreatedRefund;

  if (created.replayed) {
    return outcomeOf(created.refund_id, created.status, Number(created.amount_paise), created.method, false,
      'This refund was already recorded. Nothing was changed.');
  }
  if (created.gateway_refund_needed) return sendToGateway(created.refund_id);
  return outcomeOf(created.refund_id, created.status, Number(created.amount_paise), created.method, false,
    created.method === 'credit' ? 'Refund recorded and the customer ledger reduced.' : 'Refund recorded and the units returned to stock.');
}

/**
 * Sends a gateway refund once. The database grants the send before the call is made, so two requests cannot both
 * send. Then:
 * - Razorpay accepts: the gateway id is stored and the refund waits for its signed event.
 * - Razorpay refuses with a client error: the refund is failed and the units are released.
 * - Anything else (timeout, network, 5xx): the outcome is unknown. The refund is marked ambiguous and is never
 *   sent again automatically; it is reconciled against Razorpay's own list of refunds instead.
 */
export async function sendToGateway(refundId: string): Promise<RefundOutcome> {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return outcomeOf(refundId, 'requested', 0, 'online', false,
      'Razorpay is not configured. The refund is pending and can be sent once the keys are set.');
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('begin_gateway_refund', { p_refund: refundId });
  if (error) throw new RefundError(friendly(error.message));
  const step = data as BeginResult;
  const amount = Number(step.amount_paise ?? 0);

  if (step.action === 'busy') {
    return outcomeOf(refundId, 'requested', amount, 'online', false,
      'A send of this refund is already in progress. Refresh the page in a moment.');
  }
  if (step.action === 'blocked') {
    return outcomeOf(refundId, 'requested', amount, 'online', true,
      'Razorpay has not confirmed an earlier send of this refund. Check it with Razorpay before anything else is sent.');
  }
  if (step.action === 'none') {
    return outcomeOf(refundId, step.status, amount, 'online', false, 'This refund has already been sent to Razorpay.');
  }

  let gatewayId: string;
  try {
    const gateway = await createRazorpayRefund({
      paymentId: step.provider_payment_id as string,
      amountPaise: amount,
      receipt: refundId,
    });
    gatewayId = gateway.id;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 300) : 'Razorpay request failed';
    if (classifyGatewayFailure(cause) === 'refused') {
      const { error: failError } = await admin.rpc('fail_refund', { p_refund: refundId, p_reason: message });
      if (failError) throw new RefundError(friendly(failError.message));
      return outcomeOf(refundId, 'failed', amount, 'online', false,
        `Razorpay refused the refund: ${message}. Nothing was returned to stock.`);
    }
    await admin.rpc('mark_refund_ambiguous', { p_refund: refundId, p_error: message });
    return outcomeOf(refundId, 'requested', amount, 'online', true,
      'Razorpay did not answer clearly, so the refund may or may not exist there. It will not be sent again automatically. Use "Check with Razorpay" to reconcile it.');
  }

  const { error: markError } = await admin.rpc('mark_refund_processing', { p_refund: refundId, p_provider_refund_id: gatewayId });
  if (markError) {
    // Razorpay accepted the refund but we could not store its id. Treat it as unknown so it is reconciled, not resent.
    await admin.rpc('mark_refund_ambiguous', {
      p_refund: refundId,
      p_error: `Razorpay accepted ${gatewayId} but the id could not be stored`,
    });
    return outcomeOf(refundId, 'requested', amount, 'online', true,
      'Razorpay accepted the refund but its id could not be saved. Use "Check with Razorpay" to link it.');
  }
  return outcomeOf(refundId, 'processing', amount, 'online', false,
    'Sent to Razorpay. Stock and the order complete when Razorpay confirms the refund.');
}

interface OwnedRefund {
  id: string;
  store_id: string;
  status: string;
  refund_method: string;
  amount_paise: number;
  gateway_state: string;
  provider_refund_id: string | null;
  payment_id: string;
}

async function loadOwnedGatewayRefund(storeId: string, refundId: string): Promise<{ refund: OwnedRefund; paymentRef: string }> {
  const admin = createSupabaseAdminClient();
  const { data: refund, error } = await admin
    .from('refunds')
    .select('id, store_id, status, refund_method, amount_paise, gateway_state, provider_refund_id, payment_id')
    .eq('id', refundId)
    .maybeSingle();
  if (error || !refund || refund.store_id !== storeId) throw new RefundError('That refund could not be found');
  if (refund.refund_method !== 'online') throw new RefundError('Only gateway refunds are checked with Razorpay');
  const { data: payment } = await admin
    .from('payments')
    .select('provider_payment_id')
    .eq('id', refund.payment_id as string)
    .maybeSingle();
  const paymentRef = (payment?.provider_payment_id as string | null) ?? null;
  if (!paymentRef) throw new RefundError('This payment has no Razorpay payment id');
  return { refund: refund as OwnedRefund, paymentRef };
}

/** Asks Razorpay what it holds for this refund request and acts on the answer. Writes an audit entry for every check. */
export async function reconcileGatewayRefund(input: {
  storeId: string;
  actorId: string;
  refundId: string;
}): Promise<{ decision: ReconcileDecision; message: string }> {
  const { refund, paymentRef } = await loadOwnedGatewayRefund(input.storeId, input.refundId);
  if (refund.status === 'succeeded' || refund.status === 'failed') {
    return { decision: { action: 'conflict', message: 'This refund is already finished.' }, message: 'This refund is already finished.' };
  }

  let records;
  try {
    records = await listRazorpayPaymentRefunds(paymentRef);
  } catch {
    throw new RefundError('Razorpay could not be reached to check this refund. Nothing was changed. Try again shortly.');
  }

  const decision = decideReconciliation({
    refundId: refund.id,
    amountPaise: Number(refund.amount_paise),
    knownGatewayRefundId: refund.provider_refund_id,
    records,
  });
  const admin = createSupabaseAdminClient();

  let message: string;
  switch (decision.action) {
    case 'settle_success':
    case 'settle_failed': {
      const { data, error } = await admin.rpc('settle_refund_gateway_event', {
        p_gateway_refund_id: decision.gatewayRefundId,
        p_receipt: refund.id,
        p_success: decision.action === 'settle_success',
        p_failure_reason: decision.action === 'settle_failed' ? decision.reason : null,
        p_amount_paise: decision.amountPaise,
      });
      if (error) throw new RefundError(friendly(error.message));
      message = data === 'succeeded'
        ? 'Razorpay has processed this refund. The units and the order are updated.'
        : 'Razorpay refused this refund. The units are released.';
      break;
    }
    case 'await_webhook': {
      if (!refund.provider_refund_id) {
        const { error } = await admin.rpc('mark_refund_processing', { p_refund: refund.id, p_provider_refund_id: decision.gatewayRefundId });
        if (error) throw new RefundError(friendly(error.message));
      }
      message = 'Razorpay still shows this refund as pending. It completes when Razorpay sends its confirmation.';
      break;
    }
    case 'not_found':
      message = 'Razorpay holds no refund for this request. Stock is still held. Confirm it was not sent once it has been at least 15 minutes, or check again later.';
      break;
    case 'conflict':
      message = decision.message;
      break;
  }

  await admin.rpc('log_refund_reconciliation', {
    p_refund: refund.id,
    p_actor: input.actorId,
    p_outcome: decision.action,
    p_detail: { gateway_refunds_seen: records.length },
  });
  return { decision, message };
}

/**
 * Confirms that Razorpay holds no refund for an ambiguous request, so the units can be released. The gateway list is
 * checked again here, immediately before the confirmation, and the database enforces a waiting period.
 */
export async function confirmRefundNotSent(input: {
  storeId: string;
  actorId: string;
  refundId: string;
  reason: string;
  /** The operator attests they checked the Razorpay dashboard for this payment. Required; an empty list alone is not proof. */
  dashboardChecked: boolean;
}): Promise<string> {
  const { decision } = await reconcileGatewayRefund(input);
  if (decision.action !== 'not_found') {
    throw new RefundError(
      decision.action === 'conflict'
        ? decision.message
        : 'Razorpay now shows a refund for this request, so it cannot be confirmed as not sent. Use "Check with Razorpay" instead.',
    );
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc('reconcile_refund_not_sent', {
    p_refund: input.refundId,
    p_actor: input.actorId,
    p_reason: input.reason,
    p_dashboard_checked: input.dashboardChecked,
  });
  if (error) throw new RefundError(friendly(error.message));
  return 'Confirmed not sent. The units are back on the refund form and can be refunded again.';
}

/** Sends a pending gateway refund again. Only refunds that have never been sent, for the owner's own store. */
export async function retryPendingRefund(storeId: string, refundId: string): Promise<RefundOutcome> {
  const { refund } = await loadOwnedGatewayRefund(storeId, refundId);
  if (refund.status !== 'requested' || refund.gateway_state !== 'none') {
    throw new RefundError('Only a gateway refund that has never been sent can be sent again. Check an unknown one with Razorpay.');
  }
  return sendToGateway(refundId);
}
