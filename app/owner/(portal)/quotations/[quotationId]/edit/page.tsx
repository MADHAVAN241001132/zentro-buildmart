import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { requireOwnerPermission } from '@/lib/services/owner';
import { ownerQuotationView } from '@/lib/services/quotations';
import { QuotationForm } from '../../quotation-form';

export const dynamic = 'force-dynamic';

export default async function EditQuotationPage({ params }: { params: Promise<{ quotationId: string }> }) {
  const owner = await requireOwnerPermission('quotations');
  const { quotationId } = await params;
  const view = await ownerQuotationView(owner.storeId, quotationId);
  if (!view || !['REQUESTED', 'DRAFT'].includes(view.status)) notFound();
  const lines = view.lines.map((line) => {
    const unit = line.unitPricePaise > 0 ? ` ${(line.unitPricePaise / 100).toFixed(2)}` : '';
    const discount = line.discountPaise > 0 ? ` ${(line.discountPaise / 100).toFixed(2)}` : '';
    return `${line.sku} ${line.quantity}${unit}${discount}`;
  }).join('\n');
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Quotations" title={`Edit ${view.number}`} description="Only drafts and requests can be edited. Sent quotations must be revised first." />
      <QuotationForm
        canPrice={true}
        defaults={{
          quotationId: view.id,
          customerName: view.customerName,
          customerMobile: view.customerMobile ?? '',
          customerEmail: view.customerEmail ?? '',
          projectName: view.projectName ?? '',
          requirements: view.requirements ?? '',
          deliveryAddress: view.deliveryAddress ?? '',
          deliveryExpectation: view.deliveryExpectation ?? '',
          deliveryRupees: view.deliveryPaise > 0 ? (view.deliveryPaise / 100).toFixed(2) : '',
          validUntil: view.validUntil ?? '',
          terms: view.terms ?? '',
          lines,
        }}
      />
    </div>
  );
}
