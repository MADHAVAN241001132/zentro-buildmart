import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/owner/page-header';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StockForms } from './stock-forms';

export const dynamic = 'force-dynamic';

type Row = {
  variant_id: string;
  on_hand: number;
  reserved: number;
  damaged: number;
  incoming: number;
  reorder_level: number;
  product_variants: {
    id: string; sku: string; label: string; cost_price_paise: number; sale_price_paise: number;
    products: { name: string; status: string } | null;
  } | null;
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const owner = await requireOwnerPermission('inventory_management');
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() ?? '';
  const lowOnly = sp.low === '1';
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('inventory')
    .select('variant_id, on_hand, reserved, damaged, incoming, reorder_level, product_variants(id, sku, label, cost_price_paise, sale_price_paise, products(name, status))')
    .eq('store_id', owner.storeId)
    .limit(1000);
  if (error) return <EmptyState title="Could not load stock" body="Refresh the page and try again." />;

  const all = ((data ?? []) as unknown as Row[]).filter((r) => r.product_variants?.products?.status === 'active');
  const isLow = (r: Row) => r.on_hand - r.reserved <= r.reorder_level;
  const rows = all
    .filter((r) => !q || `${r.product_variants?.products?.name ?? ''} ${r.product_variants?.sku ?? ''}`.toLowerCase().includes(q))
    .filter((r) => !lowOnly || isLow(r))
    .sort((a, b) => (a.product_variants?.products?.name ?? '').localeCompare(b.product_variants?.products?.name ?? ''));

  const valuation = all.reduce((sum, r) => sum + r.on_hand * (r.product_variants?.cost_price_paise ?? 0), 0);
  const lowCount = all.filter(isLow).length;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Stock" title="Inventory" description="Available stock is on hand minus units reserved for customers. Changes are recorded in the stock history." />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <li className="rounded-card border border-line bg-card p-5"><p className="text-xs uppercase tracking-wide text-ink-muted">Stock valuation (at cost)</p><p className="mt-2 font-display text-2xl">{formatINR(valuation)}</p></li>
        <li className={`rounded-card border p-5 ${lowCount > 0 ? 'border-warning bg-warning/5' : 'border-line bg-card'}`}><p className="text-xs uppercase tracking-wide text-ink-muted">Low-stock items</p><p className="mt-2 font-display text-2xl">{lowCount}</p></li>
        <li className="rounded-card border border-line bg-card p-5"><p className="text-xs uppercase tracking-wide text-ink-muted">Tracked variants</p><p className="mt-2 font-display text-2xl">{all.length}</p></li>
      </ul>

      <form method="get" className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card p-4">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Search product or SKU" className="min-w-[220px] flex-1 rounded-control border border-line bg-white px-3 py-2.5" />
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="low" value="1" defaultChecked={lowOnly} className="accent-burgundy" /> Low stock only</label>
        <button type="submit" className="rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream">Apply</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No stock to show" body="Adjust the filters, or add products with stock." />
      ) : (
        <ul className="grid gap-4">
          {rows.map((r) => {
            const available = r.on_hand - r.reserved;
            const low = isLow(r);
            return (
              <li key={r.variant_id} className="grid gap-4 rounded-card border border-line bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{r.product_variants?.products?.name} · {r.product_variants?.label}</p>
                    <p className="text-xs text-ink-muted">SKU {r.product_variants?.sku}</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>On hand <strong>{r.on_hand}</strong></span>
                    <span>Reserved <strong>{r.reserved}</strong></span>
                    <span>Available <strong className={low ? 'text-warning' : ''}>{available}</strong></span>
                    <span>Damaged <strong>{r.damaged}</strong></span>
                    <span>Incoming <strong>{r.incoming}</strong></span>
                    {low ? <span className="rounded-full bg-warning/10 px-2 text-xs font-semibold uppercase text-warning">Low stock</span> : null}
                  </div>
                </div>
                <StockForms variantId={r.variant_id} onHand={r.on_hand} reorderLevel={r.reorder_level} />
                <Link href={`/owner/inventory/${r.variant_id}`} className="text-sm font-semibold text-burgundy">View stock history</Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
