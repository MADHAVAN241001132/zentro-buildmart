import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import type { ReportRange } from '@/lib/reports/report-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import { batchPerformance, cleanFilters, slowMovers, stockMovements, stockStatus } from '@/lib/services/reports';
import { Card, ExportBar, Pager, SectionNav, SimpleTable, rs } from '../report-views';
import { PrintButton } from '../report-shell';
import { PeriodLinks } from '../period-links';
import { pageOf, periodFrom, periodQuery, type PeriodParams } from '../period';

export const dynamic = 'force-dynamic';

const PATH = '/owner/reports/inventory';
const PAGE_SIZE = 25;

/** Stock movement types allowed by the stock_movements check constraint. */
const MOVEMENT_TYPES = ['purchase', 'sale', 'return', 'adjustment', 'damage', 'transfer_in', 'transfer_out', 'reserve', 'release', 'reconcile', 'opening'] as const;

export default async function InventoryReportPage({ searchParams }: { searchParams: Promise<PeriodParams & { category?: string; brand?: string; movement?: string }> }) {
  const owner = await requireOwnerPermission('reports_exports');
  const sp = await searchParams;
  const built = periodFrom(sp);
  if (!built.ok) return <EmptyState title="Choose a valid period" body={built.error} />;
  const range: ReportRange = built.range;
  const query = periodQuery(range, { category: sp.category, brand: sp.brand });
  const filters = cleanFilters(sp.category, sp.brand);
  const movement = (MOVEMENT_TYPES as readonly string[]).includes(sp.movement ?? '') ? sp.movement ?? null : null;
  const movementPage = pageOf(sp.page);
  const [status, slow, batches, moves] = await Promise.all([
    stockStatus(owner.storeId, filters),
    slowMovers(owner.storeId, range, filters),
    batchPerformance(owner.storeId, range),
    stockMovements(owner.storeId, range, movement, movementPage, PAGE_SIZE),
  ]);
  const damaged = status.filter((s) => s.damaged > 0);
  const lowStock = status.filter((s) => s.available <= s.reorderLevel);
  const batchValue = batches.reduce((t, b) => t + b.valueAtCostPaise, 0);
  const pages = Math.max(1, Math.ceil(moves.total / PAGE_SIZE));
  const movementBase = `${PATH}?${query}`;
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Reports" title="Inventory" description="Stock status, slow movers, batch performance, damaged stock and stock movement history." actions={<PrintButton />} />
      <SectionNav current={PATH} />
      <PeriodLinks base={PATH} active={range.preset} from={range.fromDate} to={range.toDate} />
      <ExportBar query={query} items={[
        { type: 'stock', label: 'Stock status' },
        { type: 'slow', label: 'Slow movers' },
        { type: 'batches', label: 'Batches' },
        { type: 'stock-movements', label: 'Movements' },
      ]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Products tracked" value={String(status.length)} note="Variants in stock status" />
        <Card label="At or below reorder level" value={String(lowStock.length)} note="Available units at or below reorder level" />
        <Card label="Damaged units" value={String(damaged.reduce((t, s) => t + s.damaged, 0))} note="Recorded as damaged" />
        <Card label="Batch value at cost" value={rs(batchValue)} note="Sum of batch value at cost" />
      </div>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Stock status</h2>
        <SimpleTable
          columns={[{ label: 'SKU' }, { label: 'Product' }, { label: 'On hand', right: true }, { label: 'Reserved', right: true }, { label: 'Available', right: true }, { label: 'Damaged', right: true }, { label: 'Reorder level', right: true }]}
          rows={status.map((s) => [s.sku, s.name, s.onHand, s.reserved, s.available, s.damaged, s.reorderLevel])}
          empty="No stock records for this store."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Damaged stock</h2>
        <SimpleTable
          columns={[{ label: 'SKU' }, { label: 'Product' }, { label: 'Damaged units', right: true }]}
          rows={damaged.map((s) => [s.sku, s.name, s.damaged])}
          empty="No damaged stock recorded."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Slow movers in the period</h2>
        <SimpleTable
          columns={[{ label: 'SKU' }, { label: 'Product' }, { label: 'On hand', right: true }, { label: 'Value at cost', right: true }, { label: 'Last sold' }]}
          rows={slow.map((s) => [s.sku, s.name, s.onHand, rs(s.valueAtCostPaise), s.lastSoldAt ? s.lastSoldAt.slice(0, 10) : 'Never in range'])}
          empty="No slow movers in this period."
        />
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-lg text-burgundy">Batch performance</h2>
        <SimpleTable
          columns={[{ label: 'Batch' }, { label: 'SKU' }, { label: 'Product' }, { label: 'On hand', right: true }, { label: 'Reserved', right: true }, { label: 'Damaged', right: true }, { label: 'Sold in period', right: true }, { label: 'Value at cost', right: true }]}
          rows={batches.map((b) => [b.batchNumber, b.sku, b.name, b.onHand, b.reserved, b.damaged, b.soldUnits, rs(b.valueAtCostPaise)])}
          empty="No batches for this store."
        />
      </section>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs print:hidden">
          <span className="text-ink-muted">Movement type:</span>
          <a className={`rounded-control px-2 py-1 ${movement === null ? 'bg-burgundy text-cream' : 'border border-line'}`} href={movementBase}>All</a>
          {MOVEMENT_TYPES.map((t) => (
            <a key={t} className={`rounded-control px-2 py-1 ${movement === t ? 'bg-burgundy text-cream' : 'border border-line'}`} href={`${movementBase}&movement=${t}`}>{t}</a>
          ))}
        </div>
        <h2 className="font-display text-lg text-burgundy">Stock movement history{movement ? ` (${movement})` : ''}</h2>
        <SimpleTable
          columns={[{ label: 'When' }, { label: 'SKU' }, { label: 'Product' }, { label: 'Type' }, { label: 'Quantity', right: true }, { label: 'Reference' }, { label: 'Note' }]}
          rows={moves.rows.map((r) => [r.createdAt.slice(0, 16).replace('T', ' '), r.sku, r.name, r.type, r.quantity, r.reference, r.note])}
          empty="No stock movements for this filter."
        />
        <p className="text-xs text-ink-muted">{moves.total} movements in the period. Adjustment history is the adjustment type above.</p>
        <Pager base={`${movementBase}${movement ? `&movement=${movement}` : ''}`} page={Math.min(movementPage, pages)} pages={pages} />
      </section>
    </div>
  );
}
