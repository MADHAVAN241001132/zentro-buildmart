import { NextResponse } from 'next/server';
import { readGuestSession } from '@/lib/services/guest';
import { guestStatusSnapshot } from '@/lib/services/status-snapshot';
import { getStoreBySlug } from '@/lib/services/storefront';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

/**
 * The signed-in guest's own order, quotation and refund statuses. Without a guest session cookie for this
 * store the response is empty, so the endpoint reveals nothing about other guests.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE });

  const session = await readGuestSession(store.id, storeSlug);
  if (!session) {
    return NextResponse.json({ session: false, orders: [], quotations: [], refunds: [], fingerprint: null }, { headers: NO_STORE });
  }

  try {
    const snapshot = await guestStatusSnapshot(store.id, session.id);
    return NextResponse.json({ session: true, ...snapshot }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  }
}
