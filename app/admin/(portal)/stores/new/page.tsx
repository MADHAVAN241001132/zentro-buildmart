import { PageHeader } from '@/components/owner/page-header';
import { createStoreAction } from '../actions';
import { StoreForm } from '../store-form';

export default function NewStorePage() {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Stores" title="New store" description="Creates the store, its settings and its showroom QR code. The store stays in draft until it is activated." />
      <StoreForm action={createStoreAction} defaults={{ status: 'draft' }} submitLabel="Create store" />
    </div>
  );
}
