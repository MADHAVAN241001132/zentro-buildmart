import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/owner/page-header';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StockHistoryPage({ params }: { params: Promise<{ variantId: string }> }) {
  const owner = await requireOwnerPermission('inventory_management');
  const { variantId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: variant } = await supabase
    .from('product_variants')
    .select('id, sku, label, products(name)')
    .eq('id', variantId)
    .eq('store_id', owner.storeId)
    .maybeSingle();
  if (!variant) notFound();

  const { data: movements, error } = await supabase
    .from('stock_movements')
    .select('id, movement_type, quantity, note, reference_type, created_at, batch_id')
    .eq('variant_id', variantId)
    .eq('store_id', owner.storeId)
    .order('created_at', { ascending: false })
    .limit(200);

  const product = (variant.products as unknown as { name: string } | null)?.name ?? '';
  const rows = (movements ?? []) as {
    id: string; movement_type: string; quantity: number; note: string | null; reference_type: string | null; created_at: string; batch_id: string | null;
  }[];

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Stock history"
        title={`${product} · ${variant.label as string}`}
        description={`SKU ${variant.sku as string}. Most recent 200 movements.`}
        actions={<Link href="/owner/inventory" className="rounded-control border border-line px-4 py-2 text-sm font-semibold text-ink">Back to inventory</Link>}
      />
      {error ? (
        <EmptyState title="Could not load history" body="Refresh the page and try again." />
      ) : rows.length === 0 ? (
        <EmptyState title="No movements yet" body="Sales, purchases, adjustments and damage will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Note</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-ink-muted">{new Date(m.created_at).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 capitalize">{m.movement_type.replace(/_/g, ' ')}</td>
                  <td className={`px-4 py-3 font-semibold ${m.quantity < 0 ? 'text-danger' : 'text-success'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                  <td className="px-4 py-3 text-ink-muted">{m.reference_type ?? '—'}</td>
                  <td className="px-4 py-3">{m.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
