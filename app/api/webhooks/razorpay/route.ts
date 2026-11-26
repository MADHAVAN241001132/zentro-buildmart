import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireEnv } from '@/lib/env';
import { verifyWebhookSignature } from '@/lib/payments/signatures';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  error_description?: string | null;
}

interface RazorpayRefundEntity {
  id: string;
  amount: number;
  payment_id?: string;
  receipt?: string | null;
  status?: string;
  failure_reason?: string | null;
}

interface RazorpayEvent {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    refund?: { entity?: RazorpayRefundEntity };
  };
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Applies one payment event. The database function it calls is idempotent: a repeat cannot capture a payment twice,
 * invoice it twice or return stock twice. Throws when the database refuses the outcome, so the event is marked failed.
 */
async function settlePaymentEvent(event: RazorpayEvent, eventType: string, admin: AdminClient): Promise<string> {
  const payment = event.payload?.payment?.entity;
  const isCaptured = eventType === 'payment.captured';
  const isFailed = eventType === 'payment.failed';
  if (!payment || (!isCaptured && !isFailed)) return 'ignored';

  const { data, error } = await admin.rpc('settle_online_payment', {
    p_provider: 'razorpay',
    p_provider_order_id: payment.order_id,
    p_provider_payment_id: payment.id,
    p_amount_paise: payment.amount,
    p_success: isCaptured,
    p_failure_reason: isFailed ? (payment.error_description ?? 'payment failed') : null,
  });
  if (error) throw new Error(`settle_online_payment: ${error.message}`);
  return String(data);
}

/**
 * Applies a refund event. processed and failed change state; other refund events are recorded and ignored.
 * The event is matched by Razorpay's refund id, or by our receipt if the send's response was lost.
 */
async function settleRefundEvent(event: RazorpayEvent, eventType: string, admin: AdminClient): Promise<string> {
  const refund = event.payload?.refund?.entity;
  const isProcessed = eventType === 'refund.processed';
  const isFailed = eventType === 'refund.failed';
  if (!refund || (!isProcessed && !isFailed)) return 'ignored';

  const { data, error } = await admin.rpc('settle_refund_gateway_event', {
    p_gateway_refund_id: refund.id,
    p_receipt: refund.receipt ?? null,
    p_success: isProcessed,
    p_failure_reason: isFailed ? (refund.failure_reason ?? 'refund failed at Razorpay') : null,
    p_amount_paise: refund.amount,
  });
  if (error) throw new Error(`settle_refund_gateway_event: ${error.message}`);
  return String(data);
}

/**
 * Razorpay webhook receiver.
 * 1. Verify the HMAC of the raw body. Unsigned or mis-signed requests are rejected before any work.
 * 2. Take the event under a lease (begin_payment_event). A processed event is acknowledged; an event being processed
 *    by another worker returns 409 so Razorpay retries it later.
 * 3. Apply the event through the idempotent database function.
 * 4. Mark the event processed only after that succeeds. On failure, record the error and return 500 so Razorpay retries.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const secret = requireEnv('RAZORPAY_WEBHOOK_SECRET');

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const eventType = event.event ?? 'unknown';
  const eventId =
    request.headers.get('x-razorpay-event-id') ?? createHash('sha256').update(rawBody).digest('hex');
  const admin = createSupabaseAdminClient();

  const { data: lease, error: beginError } = await admin.rpc('begin_payment_event', {
    p_provider: 'razorpay',
    p_event_id: eventId,
    p_event_type: eventType,
    p_payload: JSON.parse(rawBody) as never,
    p_signature_valid: true,
  });
  if (beginError) return NextResponse.json({ error: 'could not record event' }, { status: 500 });

  const taken = lease as { action: 'process' | 'processed' | 'busy'; event_id: string; attempts: number };
  if (taken.action === 'processed') return NextResponse.json({ status: 'duplicate' }, { status: 200 });
  if (taken.action === 'busy') return NextResponse.json({ status: 'in_progress' }, { status: 409 });

  let outcome: string;
  try {
    outcome = eventType.startsWith('refund.')
      ? await settleRefundEvent(event, eventType, admin)
      : await settlePaymentEvent(event, eventType, admin);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'settlement failed';
    await admin.rpc('fail_payment_event', { p_event: taken.event_id, p_error: message });
    return NextResponse.json({ error: 'settlement failed' }, { status: 500 });
  }

  const { error: completeError } = await admin.rpc('complete_payment_event', { p_event: taken.event_id });
  if (completeError) return NextResponse.json({ error: 'could not complete event' }, { status: 500 });

  // An 'unknown' refund outcome means no refund of ours matches the event. It is recorded, not retried.
  return NextResponse.json({ status: outcome, attempt: taken.attempts }, { status: 200 });
}
