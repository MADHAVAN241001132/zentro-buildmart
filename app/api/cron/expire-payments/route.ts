import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { requireEnv } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerMatches(header: string | null, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Called by Vercel Cron every 15 minutes. Releases reservations for unpaid, expired attempts. */
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), requireEnv('CRON_SECRET'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  const { data, error } = await createSupabaseAdminClient().rpc('expire_stale_payments');
  if (error) return NextResponse.json({ error: 'expiry failed' }, { status: 500 });
  return NextResponse.json({ ok: true, result: data }, { status: 200 });
}
