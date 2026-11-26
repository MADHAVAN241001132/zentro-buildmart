import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatPlainInr } from '@/lib/invoices/invoice-math';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import { guestQuotationList } from '@/lib/services/quotations';

export const dynamic = 'force-dynamic';

export default async function GuestQuotationsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const session = await readGuestSession(store.id, storeSlug);
  const rows = session ? await guestQuotationList(store.id, session.id) : [];
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-burgundy">Your quotations</h1>
        <Link href={`/store/${storeSlug}/quotes/request`} className={buttonClass('primary')}>Request a quotation</Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No quotations yet" body="Request a quotation from your cart or from a product page to get prices for a project." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4">
              <div className="grid gap-1">
                <Link className="font-semibold text-burgundy underline" href={`/store/${storeSlug}/quotes/${row.id}`}>{row.number}</Link>
                <span className="text-sm text-ink-muted">{row.projectName ?? 'No project name'} · {new Date(row.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <StatusBadge status={row.status} />
                <span>{row.totalPaise > 0 ? `Rs. ${formatPlainInr(row.totalPaise)}` : 'Awaiting prices'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
