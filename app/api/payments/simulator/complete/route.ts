import { NextResponse } from 'next/server';
import { simulatorAllowed } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DEV-ONLY payment simulator. Marks a simulated UPI payment as paid or failed so the full
 * order flow can be exercised without Razorpay credentials.
 * Refused unless ZENTRO_PAYMENT_MODE=simulator and NODE_ENV/VERCEL_ENV are not production.
 * Simulated payments carry provider = 'simulator' and must never be presented as real money.
 */
export async function POST(request: Request) {
  if (!simulatorAllowed()) {
    return NextResponse.json({ error: 'simulator disabled' }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as {
    providerOrderId?: unknown;
    amountPaise?: unknown;
    outcome?: unknown;
  } | null;
  if (
    !body ||
    typeof body.providerOrderId !== 'string' ||
    typeof body.amountPaise !== 'number' ||
    !Number.isInteger(body.amountPaise) ||
    (body.outcome !== 'success' && body.outcome !== 'failure')
  ) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const providerPaymentId = `sim_pay_${body.providerOrderId}`;
  const { data, error } = await createSupabaseAdminClient().rpc('settle_online_payment', {
    p_provider: 'simulator',
    p_provider_order_id: body.providerOrderId,
    p_provider_payment_id: providerPaymentId,
    p_amount_paise: body.amountPaise,
    p_success: body.outcome === 'success',
    p_failure_reason: body.outcome === 'success' ? null : 'simulated failure',
  });
  if (error) return NextResponse.json({ error: 'settlement failed' }, { status: 500 });
  return NextResponse.json({ simulated: true, status: data }, { status: 200 });
}
