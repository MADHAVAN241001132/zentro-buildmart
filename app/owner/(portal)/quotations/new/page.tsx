import { PageHeader } from '@/components/owner/page-header';
import { requireOwnerPermission } from '@/lib/services/owner';
import { QuotationForm } from '../quotation-form';

export const dynamic = 'force-dynamic';

export default async function NewQuotationPage() {
  const owner = await requireOwnerPermission('quotations');
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Quotations" title="New quotation" description="Starts as a draft. Nothing reaches the customer until you send it." />
      <QuotationForm defaults={{}} canPrice />
    </div>
  );
}
