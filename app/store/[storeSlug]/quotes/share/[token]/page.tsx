import { notFound } from 'next/navigation';
import { QuotationActionPanel, type QuoteActionButton } from '@/components/guest/quotation-action-panel';
import { QuotationSummary } from '@/components/guest/quotation-summary';
import { StatusBadge } from '@/components/ui/status-badge';
import { CUSTOMER_QUOTE_STATUS_LABEL } from '@/lib/quotations/quotation-input';
import { getStoreBySlug } from '@/lib/services/storefront';
import { sharedQuotationView } from '@/lib/services/quotations';
import { quotationCustomerAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/** A quotation opened from a share link. No login is needed; the token is the only credential. */
export default async function SharedQuotationPage({ params }: { params: Promise<{ storeSlug: string; token: string }> }) {
  const { storeSlug, token } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const view = await sharedQuotationView(store.id, token);
  if (!view) notFound();

  const buttons: QuoteActionButton[] = [];
  if (view.canRespond) {
    buttons.push({ intent: 'accept', label: 'Accept quotation', variant: 'primary' });
    buttons.push({ intent: 'reject', label: 'Reject', variant: 'danger', confirm: 'Reject this quotation?' });
  }
  if (view.canConvert) {
    buttons.push({ intent: 'convert-online', label: 'Pay online and place order', variant: 'primary' });
    buttons.push({ intent: 'convert-cash', label: 'Place order, pay cash on delivery', variant: 'secondary' });
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl text-burgundy">Quotation {view.number}</h1>
          <p className="text-sm text-ink-muted">Prepared for {view.customerName}{view.projectName ? ` · ${view.projectName}` : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={view.status} />
          {view.priced ? <a href={`/store/${storeSlug}/quotes/share/${token}/pdf`} className="text-sm text-burgundy underline">Download PDF</a> : null}
        </div>
      </div>
      <p className="text-sm">{CUSTOMER_QUOTE_STATUS_LABEL[view.status] ?? ''}</p>
      <QuotationSummary view={view} />
      {buttons.length > 0 ? (
        <QuotationActionPanel action={quotationCustomerAction} hidden={{ storeSlug, quotationId: view.id, token }} buttons={buttons} noteField={view.canRespond} />
      ) : null}
    </div>
  );
}
