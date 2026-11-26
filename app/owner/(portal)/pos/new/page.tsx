import { PageHeader } from '@/components/owner/page-header';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { searchVariants } from '@/lib/services/pos';
import { addVariantAction } from '../actions';
import { ScanForm } from '../scan-form';

export const dynamic = 'force-dynamic';

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  await requireOwnerPermission('pos_billing');
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 60);
  const hits = q.trim() ? await searchVariants(q) : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Point of sale"
        title="New bill"
        description="Scan a SKU or search for a product and add it. The bill is held until you place it."
      />
      <ScanForm billId="new" />
      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by product name, SKU or finish"
          className="min-w-[240px] flex-1 rounded-control border border-line bg-card px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {sp.error ? <p role="alert" className="text-sm text-danger">{sp.error}</p> : null}
      {q.trim() && hits.length === 0 ? <p className="text-sm text-ink-muted">No active products match “{q}”.</p> : null}
      {hits.length > 0 ? (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {hits.map((hit) => (
                <tr key={hit.id} className="border-t border-line">
                  <td className="px-4 py-3">{hit.productName}</td>
                  <td className="px-4 py-3 text-ink-muted">{hit.label}</td>
                  <td className="px-4 py-3 font-mono text-xs">{hit.sku}</td>
                  <td className="px-4 py-3 text-right">{formatINR(hit.salePaise)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={addVariantAction}>
                      <input type="hidden" name="billId" value="new" />
                      <input type="hidden" name="variantId" value={hit.id} />
                      <Button type="submit" variant="secondary">Add</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
