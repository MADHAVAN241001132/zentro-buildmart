import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { requireEnv } from '@/lib/env';
import { cleanupOrphanUploads } from '@/lib/services/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerMatches(header: string | null, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Called by Vercel Cron. Removes unclaimed image objects older than 24 hours. */
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), requireEnv('CRON_SECRET'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  try {
    const removed = await cleanupOrphanUploads(24, 200);
    return NextResponse.json({ ok: true, removed }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'cleanup failed' }, { status: 500 });
  }
}
