import 'server-only';
import { InvoiceError, type InvoiceData } from '@/lib/invoices/invoice-data';
import { renderInvoicePdf } from '@/lib/invoices/invoice-pdf';
import { fetchStoreLogo } from '@/lib/invoices/store-logo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Renders the invoice and returns it as a private, non-cached PDF download. */
export async function invoicePdfResponse(data: InvoiceData): Promise<Response> {
  const logo = await fetchStoreLogo(data.store.logoUrl);
  const bytes = await renderInvoicePdf(data, logo);
  const safeNumber = data.invoiceNumber.replace(/[^A-Za-z0-9-]/g, '') || 'invoice';
  return new Response(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${safeNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Maps a failure to a JSON error. Internal details are logged, not returned. */
export function invoiceErrorResponse(error: unknown): Response {
  if (error instanceof InvoiceError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const detail = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : 'unknown error';
  console.error('invoice generation failed', detail);
  return Response.json({ error: 'The invoice could not be created. Please try again.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
}
