import { NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { getStoreBySlug } from '@/lib/services/storefront';
import { sharedQuotationView } from '@/lib/services/quotations';
import { quotationErrorResponse, quotationPdfResponse } from '@/lib/quotations/pdf-response';

export const dynamic = 'force-dynamic';

/** Download through a share link. The token alone grants access, and only to this store's quotation. */
export async function GET(_request: Request, { params }: { params: Promise<{ storeSlug: string; token: string }> }) {
  const { storeSlug, token } = await params;
  try {
    const store = await getStoreBySlug(storeSlug);
    if (!store || !(await isFeatureEnabled(store.id, 'quotations'))) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const view = await sharedQuotationView(store.id, token);
    if (!view) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return await quotationPdfResponse(store.id, view, { kind: 'share', id: null });
  } catch (caught) {
    return quotationErrorResponse(caught);
  }
}
