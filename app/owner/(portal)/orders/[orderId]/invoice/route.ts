import { NextResponse } from 'next/server';
import { loadInvoiceForOrder } from '@/lib/invoices/invoice-data';
import { invoiceErrorResponse, invoicePdfResponse, isUuid } from '@/lib/invoices/respond';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Owner, manager and staff download of an order's tax invoice (online, POS, or cash and credit POS bills).
 * The signed-in user must be an active member of the store, and the order must be visible to that user through RLS.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  let owner;
  try {
    owner = await ownerPermissionForRoute('order_management');
  } catch (error) {
    return routeDeniedResponse(error);
  }

  const { orderId } = await params;
  if (!isUuid(orderId)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data: visible, error } = await supabase.from('orders').select('id, store_id').eq('id', orderId).maybeSingle();
  if (error) return invoiceErrorResponse(error);
  if (!visible || visible.store_id !== owner.storeId) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    const data = await loadInvoiceForOrder(owner.storeId, orderId);
    return await invoicePdfResponse(data);
  } catch (caught) {
    return invoiceErrorResponse(caught);
  }
}
