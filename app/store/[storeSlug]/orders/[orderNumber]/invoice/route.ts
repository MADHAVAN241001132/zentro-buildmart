import { NextResponse } from 'next/server';
import { findGuestOrderId, loadInvoiceForOrder } from '@/lib/invoices/invoice-data';
import { invoiceErrorResponse, invoicePdfResponse } from '@/lib/invoices/respond';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

/**
 * Guest download of their own order's tax invoice. The guest cookie must belong to the session that placed the order.
 * Other guests, anonymous requests and unknown order numbers all get the same 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string; orderNumber: string }> }) {
  const { storeSlug, orderNumber } = await params;
  if (!/^[A-Za-z0-9-]{3,40}$/.test(orderNumber)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    const store = await getStoreBySlug(storeSlug);
    if (!store) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const session = await readGuestSession(store.id, storeSlug);
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const orderId = await findGuestOrderId(store.id, session.id, orderNumber);
    if (!orderId) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const data = await loadInvoiceForOrder(store.id, orderId);
    return await invoicePdfResponse(data);
  } catch (caught) {
    return invoiceErrorResponse(caught);
  }
}
