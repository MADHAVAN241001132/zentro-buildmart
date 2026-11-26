import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEnv } from '@/lib/env';
import { verifyCheckoutSignature } from '@/lib/payments/signatures';
import { fetchRazorpayPayment } from '@/lib/payments/razorpay';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  razorpay_order_id: z.string().min(3).max(64),
  razorpay_payment_id: z.string().min(3).max(64),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/i),
});

/**
 * Browser callback after Razorpay Checkout. It verifies the checkout signature and, if valid,
 * settles the payment through the same idempotent function the webhook uses. A forged callback
 * fails the signature check and changes nothing.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const valid = verifyCheckoutSignature(
    { orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature },
    requireEnv('RAZORPAY_KEY_SECRET'),
  );
  if (!valid) return NextResponse.json({ error: 'signature mismatch' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: payment, error } = await admin
    .from('payments')
    .select('amount_paise')
    .eq('provider', 'razorpay')
    .eq('provider_order_id', razorpay_order_id)
    .maybeSingle();
  if (error || !payment) return NextResponse.json({ error: 'unknown order' }, { status: 404 });

  // The signature proves the callback came from Razorpay Checkout. The provider's record must also show a captured
  // payment for this order and this amount before anything is settled here.
  let providerPayment;
  try {
    providerPayment = await fetchRazorpayPayment(razorpay_payment_id);
  } catch {
    return NextResponse.json({ error: 'payment not confirmed yet' }, { status: 202 });
  }
  if (
    providerPayment.order_id !== razorpay_order_id ||
    providerPayment.status !== 'captured' ||
    providerPayment.currency !== 'INR' ||
    providerPayment.amount !== (payment.amount_paise as number)
  ) {
    return NextResponse.json({ error: 'payment not confirmed' }, { status: 409 });
  }

  const { data: outcome, error: settleError } = await admin.rpc('settle_online_payment', {
    p_provider: 'razorpay',
    p_provider_order_id: razorpay_order_id,
    p_provider_payment_id: razorpay_payment_id,
    p_amount_paise: payment.amount_paise as number,
    p_success: true,
    p_failure_reason: null,
  });
  if (settleError) return NextResponse.json({ error: 'settlement failed' }, { status: 500 });
  return NextResponse.json({ status: outcome }, { status: 200 });
}
