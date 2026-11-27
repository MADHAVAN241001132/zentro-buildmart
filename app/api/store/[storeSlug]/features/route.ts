import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getStoreEnabledFeatures } from '@/lib/services/entitlements';
import { getStoreBySlug } from '@/lib/services/storefront';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

/** Public feature fingerprint for a store so open storefront tabs refresh when Super Admin toggles flags. */
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE });

  const enabled = Array.from(await getStoreEnabledFeatures(store.id)).sort();
  const fingerprint = createHash('sha256').update(JSON.stringify(enabled)).digest('hex').slice(0, 24);
  return NextResponse.json({ fingerprint }, { headers: NO_STORE });
}
