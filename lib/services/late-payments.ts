import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendToGateway, type RefundOutcome } from '@/lib/services/refunds';

export class LatePaymentError extends Error {}

function friendly(message: string): string {
  const cleaned = message.replace(/^.*?: /, '');
  return cleaned.length > 0 ? cleaned : 'This late payment could not be updated.';
}

/** Records the owner's (or a platform administrator's) decision. Moves no money. */
export async function decideLatePayment(input: {
  actorId: string;
  lateId: string;
  decision: 'refund' | 'fulfil' | 'dismiss';
  note: string;
}): Promise<void> {
  const note = input.note.trim();
  if (note.length < 3 || note.length > 500) throw new LatePaymentError('Give a note of 3 to 500 characters');
  const { error } = await createSupabaseAdminClient().rpc('late_payment_decide', {
    p_id: input.lateId,
    p_actor: input.actorId,
    p_decision: input.decision,
    p_note: note,
  });
  if (error) throw new LatePaymentError(friendly(error.message));
}

/**
 * Creates the refund for a late payment decided as 'refund', then sends it through the existing gateway path.
 * The request key is derived from the late payment, so repeated clicks or notifications reuse one refund.
 * The refund is reported as succeeded only after the provider confirms it through the refund engine.
 */
export async function requestLatePaymentRefund(input: { actorId: string; lateId: string }): Promise<RefundOutcome> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('late_payment_refund_request', {
    p_late: input.lateId,
    p_actor: input.actorId,
    p_request_key: `late-refund-${input.lateId}`,
  });
  if (error) throw new LatePaymentError(friendly(error.message));
  const created = data as { refund_id: string; status: string };
  // sendToGateway claims the send in the database first, so a replay cannot send a second time.
  return sendToGateway(created.refund_id);
}
