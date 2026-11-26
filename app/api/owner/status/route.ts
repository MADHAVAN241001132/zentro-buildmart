import { NextResponse } from 'next/server';
import { getOwnerContext, loadMyStorePermissions } from '@/lib/services/owner';
import { ownerStatusCounts } from '@/lib/services/status-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

/**
 * Notification counts for the signed-in owner's store. The store comes from the owner's active membership,
 * never from the request, so one owner cannot read another store's counts.
 */
export async function GET() {
  const context = await getOwnerContext();
  if (!context) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: NO_STORE });

  try {
    const held = await loadMyStorePermissions(context.storeId);
    const counts = await ownerStatusCounts(context.storeId, held);
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  }
}
