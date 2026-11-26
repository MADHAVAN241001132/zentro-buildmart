import { NextResponse } from 'next/server';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import { guestQuotationView } from '@/lib/services/quotations';
import { isUuid, quotationErrorResponse, quotationPdfResponse } from '@/lib/quotations/pdf-response';

export const dynamic = 'force-dynamic';

/** A guest's own quotation. The guest session must own the quotation within this store. */
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string; quotationId: string }> }) {
  const { storeSlug, quotationId } = await params;
  if (!isUuid(quotationId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const store = await getStoreBySlug(storeSlug);
    if (!store) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const session = await readGuestSession(store.id, storeSlug);
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const view = await guestQuotationView(store.id, session.id, quotationId);
    if (!view) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return await quotationPdfResponse(store.id, view, { kind: 'guest', id: null });
  } catch (caught) {
    return quotationErrorResponse(caught);
  }
}
