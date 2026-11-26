import { NextResponse } from 'next/server';
import { ownerQuotationView } from '@/lib/services/quotations';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';
import { isUuid, quotationErrorResponse, quotationPdfResponse } from '@/lib/quotations/pdf-response';

export const dynamic = 'force-dynamic';

/** Owner, manager and staff download of a quotation. Staff of the store only. */
export async function GET(_request: Request, { params }: { params: Promise<{ quotationId: string }> }) {
  let owner;
  try {
    owner = await ownerPermissionForRoute('quotations');
  } catch (error) {
    return routeDeniedResponse(error);
  }
  const { quotationId } = await params;
  if (!isUuid(quotationId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const view = await ownerQuotationView(owner.storeId, quotationId);
    if (!view) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return await quotationPdfResponse(owner.storeId, view, { kind: 'owner', id: owner.userId });
  } catch (caught) {
    return quotationErrorResponse(caught);
  }
}
