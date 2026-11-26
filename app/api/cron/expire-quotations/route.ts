import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { requireEnv } from '@/lib/env';
import { expireQuotations } from '@/lib/services/quotations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerMatches(header: string | null, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Called by Vercel Cron. Marks SENT quotations past their validity date as EXPIRED. */
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), requireEnv('CRON_SECRET'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  try {
    const expired = await expireQuotations();
    return NextResponse.json({ ok: true, expired }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'expiry failed' }, { status: 500 });
  }
}
