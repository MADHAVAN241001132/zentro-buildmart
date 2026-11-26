import 'server-only';
import { fetchStoreLogo } from '@/lib/invoices/store-logo';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { QuotationError, recordDocumentDownload, type QuotationView } from '@/lib/services/quotations';
import { renderQuotationPdf, type QuotationPdfData } from '@/lib/quotations/quotation-pdf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

async function loadStoreBranding(storeId: string): Promise<{ name: string; address: string | null; gstin: string | null; phone: string | null; logoUrl: string | null }> {
  const { data, error } = await createSupabaseAdminClient()
    .from('stores')
    .select('name, gstin, address_line, city, state, pincode, phone, logo_url')
    .eq('id', storeId)
    .maybeSingle();
  if (error || !data) throw new QuotationError('Store not found.', 404);
  const row = data as Record<string, string | null>;
  const address = [row.address_line, row.city, row.state, row.pincode].filter(Boolean).join(', ') || null;
  return { name: row.name as string, address, gstin: row.gstin ?? null, phone: row.phone ?? null, logoUrl: row.logo_url ?? null };
}

interface QuotationSeller {
  legalName: string;
  billingAddress: string | null;
  gstin: string | null;
}

async function loadQuotationSeller(storeId: string, quotationId: string): Promise<QuotationSeller | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('quotations')
    .select('seller_legal_name, seller_billing_address, seller_gstin, seller_state')
    .eq('id', quotationId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw new QuotationError('Could not load the quotation.', 500);
  const row = data as Record<string, string | null> | null;
  if (!row || row.seller_legal_name === null || row.seller_legal_name === undefined) return null;
  const billingAddress = [row.seller_billing_address, row.seller_state].filter(Boolean).join(', ') || null;
  return { legalName: row.seller_legal_name, billingAddress, gstin: row.seller_gstin ?? null };
}

/**
 * Renders a quotation view as a PDF response and records the download. Callers must already have decided
 * that the requester may see this view. A quotation with no prices is refused with a 409.
 */
export async function quotationPdfResponse(
  storeId: string,
  view: QuotationView,
  actor: { kind: 'owner' | 'guest' | 'share'; id: string | null },
): Promise<Response> {
  if (!view.priced || view.lines.length === 0) {
    return Response.json({ error: 'This quotation is not priced yet, so it cannot be downloaded.' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const branding = await loadStoreBranding(storeId);
  const seller = await loadQuotationSeller(storeId, view.id);
  const logo = await fetchStoreLogo(branding.logoUrl);
  // Seller details come from the snapshot taken when the quotation was created. Current store details are used
  // only when no snapshot exists.
  const data: QuotationPdfData = {
    storeName: seller ? seller.legalName : branding.name,
    storeAddress: seller ? seller.billingAddress : branding.address,
    storeGstin: seller ? seller.gstin : branding.gstin,
    storePhone: branding.phone,
    number: view.number,
    status: view.status,
    createdAt: view.sentAt ?? view.createdAt,
    validUntil: view.validUntil,
    customerName: view.customerName,
    customerMobile: view.customerMobile,
    customerEmail: view.customerEmail,
    projectName: view.projectName,
    deliveryAddress: view.deliveryAddress,
    deliveryPaise: view.deliveryPaise,
    subtotalPaise: view.subtotalPaise,
    discountPaise: view.discountPaise,
    taxablePaise: view.taxablePaise,
    taxPaise: view.taxPaise,
    totalPaise: view.totalPaise,
    terms: view.terms,
    lines: view.lines.map((line) => ({
      name: line.name,
      variantLabel: line.variantLabel,
      sku: line.sku,
      hsnCode: line.hsnCode,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      discountPaise: line.discountPaise,
      gstRateBps: line.gstRateBps,
      taxablePaise: line.taxablePaise,
      taxPaise: line.taxPaise,
      lineTotalPaise: line.lineTotalPaise,
    })),
  };
  const bytes = await renderQuotationPdf(data, logo);
  await recordDocumentDownload(storeId, 'quotation', view.id, actor.kind, actor.id);
  const safeNumber = view.number.replace(/[^A-Za-z0-9-]/g, '') || 'quotation';
  return new Response(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="quotation-${safeNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function quotationErrorResponse(error: unknown): Response {
  if (error instanceof QuotationError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const detail = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : 'unknown error';
  console.error('quotation pdf failed', detail);
  return Response.json({ error: 'The quotation could not be created. Please try again.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
}
