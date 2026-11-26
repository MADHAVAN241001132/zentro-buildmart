import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { buildRange, istDateOf, paginate, percentText, trendBucket, type DatePreset } from '@/lib/reports/report-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import {
  cleanFilters, couponUsage, filterOptions, groupSales, productSales, quotationFigures, reportSummary, reportTrend, slowMovers, stockStatus,
  type ProductRow,
} from '@/lib/services/reports';
import { Card, ChannelBars, PaymentDonut, Pager, SortHeader, TrendChart, rs } from './report-views';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales and products' },
  { key: 'stock', label: 'Stock' },
  { key: 'coupons', label: 'Coupons and refunds' },
] as const;
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'mtd', label: 'Month to date' },
  { key: 'ytd', label: 'Year to date' },
];

type SP = { preset?: string; from?: string; to?: string; view?: string; category?: string; brand?: string; q?: string; sort?: string; dir?: string; page?: string };

function sortProducts(rows: ProductRow[], sort: string, dir: string): ProductRow[] {
  const key = (r: ProductRow) => {
    switch (sort) {
      case 'units': return r.units;
      case 'profit': return r.grossProfitPaise;
      case 'name': return r.name.toLowerCase();
      default: return r.taxablePaise;
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1 * sign;
    if (ka > kb) return 1 * sign;
    return 0;
  });
}

export default async function OwnerReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const owner = await requireOwnerPermission('reports_exports');
  const sp = await searchParams;
  const preset = (PRESETS.map((p) => p.key) as string[]).includes(sp.preset ?? '') || sp.preset === 'custom' ? (sp.preset as DatePreset) : '30d';
  const built = buildRange(preset, istDateOf(new Date()), { from: sp.from ?? '', to: sp.to ?? '' });
  if (!built.ok) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Reports" title="Reports" />
        <EmptyState title="Choose a valid period" body={built.error} />
      </div>
    );
  }
  const range = built.range;
  const filters = cleanFilters(sp.category, sp.brand);
  const view = (VIEWS.map((v) => v.key) as string[]).includes(sp.view ?? '') ? (sp.view as string) : 'overview';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const sort = ['taxable', 'units', 'profit', 'name'].includes(sp.sort ?? '') ? (sp.sort as string) : 'taxable';
  const dir = sp.dir === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(sp.page) || 1);
  const bucket = trendBucket(range);

  const base = `/owner/reports?preset=${range.preset}&from=${range.fromDate}&to=${range.toDate}&view=${view}${filters.categoryId ? `&category=${filters.categoryId}` : ''}${filters.brandId ? `&brand=${filters.brandId}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const exportQuery = `preset=${range.preset}&from=${range.fromDate}&to=${range.toDate}${filters.categoryId ? `&category=${filters.categoryId}` : ''}${filters.brandId ? `&brand=${filters.brandId}` : ''}`;

  const options = await filterOptions(owner.storeId);
  const quotes = await quotationFigures(owner.storeId, range);
  const summary = await reportSummary(owner.storeId, range);

  const exportLinks = (
    <>
      <Link className={buttonClass('secondary')} href={`/owner/reports/export?type=orders&${exportQuery}`}>Orders CSV</Link>
      <Link className={buttonClass('secondary')} href={`/owner/reports/export?type=products&${exportQuery}`}>Products CSV</Link>
      <Link className={buttonClass('secondary')} href={`/owner/reports/export?type=trend&${exportQuery}`}>Trend CSV</Link>
    </>
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Reports"
        title="Business reports"
        description={`Period ${range.fromDate} to ${range.toDate} (India time). Totals are computed in the database over the whole period.`}
        actions={exportLinks}
      />

      <nav className="flex flex-wrap items-end gap-2 text-sm">
        {PRESETS.map((item) => (
          <Link key={item.key} href={`/owner/reports?preset=${item.key}&view=${view}`} className={`rounded-control px-3 py-1.5 ${range.preset === item.key ? 'bg-burgundy text-cream' : 'border border-line text-ink'}`}>{item.label}</Link>
        ))}
        <form className="flex flex-wrap items-end gap-2" action="/owner/reports">
          <input type="hidden" name="preset" value="custom" />
          <input type="hidden" name="view" value={view} />
          <label className="grid gap-1">From<input type="date" name="from" defaultValue={range.fromDate} className="rounded-control border border-line px-2 py-1" /></label>
          <label className="grid gap-1">To<input type="date" name="to" defaultValue={range.toDate} className="rounded-control border border-line px-2 py-1" /></label>
          <button className={buttonClass('primary')}>Apply dates</button>
        </form>
      </nav>

      <form className="flex flex-wrap items-end gap-2 text-sm" action="/owner/reports">
        <input type="hidden" name="preset" value={range.preset} />
        <input type="hidden" name="from" value={range.fromDate} />
        <input type="hidden" name="to" value={range.toDate} />
        <input type="hidden" name="view" value={view} />
        <label className="grid gap-1">Category
          <select name="category" defaultValue={filters.categoryId ?? ''} className="rounded-control border border-line px-2 py-1">
            <option value="">All categories</option>
            {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Brand
          <select name="brand" defaultValue={filters.brandId ?? ''} className="rounded-control border border-line px-2 py-1">
            <option value="">All brands</option>
            {options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Search product
          <input name="q" defaultValue={q} maxLength={80} className="rounded-control border border-line px-2 py-1" />
        </label>
        <button className={buttonClass('secondary')}>Filter</button>
      </form>

      <nav className="flex flex-wrap gap-2 text-sm">
        {VIEWS.map((v) => (
          <Link key={v.key} href={`/owner/reports?preset=${range.preset}&from=${range.fromDate}&to=${range.toDate}&view=${v.key}${filters.categoryId ? `&category=${filters.categoryId}` : ''}${filters.brandId ? `&brand=${filters.brandId}` : ''}`}
            className={`rounded-control px-3 py-1.5 ${view === v.key ? 'bg-burgundy text-cream' : 'border border-line text-ink'}`}>{v.label}</Link>
        ))}
      </nav>

      {view === 'overview' ? (
        <section className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Order value (incl. GST)" value={rs(summary.orderValuePaise)} note={`${summary.orderCount} orders, cancelled excluded`} />
            <Card label="Taxable sales" value={rs(summary.taxablePaise)} note={`GST ${rs(summary.gstPaise)} shown separately`} />
            <Card label="Collected revenue" value={rs(summary.collectedPaise)} note="Paid orders, including partly or fully refunded" />
            <Card label="Credit sales" value={rs(summary.creditSalesPaise)} note="Placed on account in this period" />
            <Card label="Outstanding credit" value={rs(summary.outstandingCreditPaise)} note="All time, credit orders not yet paid" />
            <Card label="Refunds" value={rs(summary.refundsPaise)} note={`${summary.refundCount} succeeded; ${summary.refundPendingCount} pending (${rs(summary.refundPendingPaise)})`} />
            <Card label="Cost of goods (historical)" value={rs(summary.cogsPaise)} note="Cost stored on each order line when it was sold" />
            <Card label="Gross profit" value={rs(summary.grossProfitPaise)} note="Taxable sales less historical cost, before refunds" />
            <Card label="Gross profit after refunds" value={rs(summary.refundAdjustedGrossProfitPaise)} note="Refunds deducted as lost revenue. Returned stock value is not recovered here, so this is conservative" />
            <Card label="Expenses" value={rs(summary.expensesPaise)} note="Expenses dated in the period" />
            <Card label="Net profit estimate" value={rs(summary.netProfitEstimatePaise)} note="Gross profit less expenses; not audited" />
            <Card label="Average order value" value={rs(summary.averageOrderValuePaise)} note="Order value divided by orders" />
            <Card label="Inventory valuation" value={rs(summary.inventoryValuationPaise)} note="Current on-hand stock at current cost" />
            <Card label="Quotation conversion" value={percentText(quotes.conversionRate)} note={`${quotes.converted} converted of ${quotes.sent} sent`} />
            <Card label="Discounts given" value={rs(summary.discountPaise)} note="Line and order discounts in the period" />
          </div>
          <p className="text-xs text-ink-muted">Collected revenue, credit sales and order value are separate measures. Refunds are never netted silently into revenue or profit; the refund-adjusted figure is shown on its own line.</p>
          <TrendChart points={await reportTrend(owner.storeId, range, bucket)} label={`Taxable sales by ${bucket === 'day' ? 'day' : bucket}`} />
          <div className="grid gap-4 md:grid-cols-2">
            <ChannelBars online={summary.onlineValuePaise} pos={summary.posValuePaise} />
            <PaymentDonut parts={[
              { label: 'Online', value: summary.payments.online.valuePaise },
              { label: 'Cash', value: summary.payments.cash.valuePaise },
              { label: 'Credit', value: summary.payments.credit.valuePaise },
            ]} />
          </div>
          <div className="grid gap-2 rounded-card border border-line bg-white p-4 text-sm md:max-w-xl">
            <h2 className="font-display text-lg text-burgundy">Quotation funnel</h2>
            <p>Requests {quotes.requests}, sent {quotes.sent}, accepted {quotes.accepted}, rejected {quotes.rejected}, expired {quotes.expired}, converted {quotes.converted}.</p>
            <p>Quotation value {rs(quotes.quotedValuePaise)}. Revenue from converted quotations {rs(quotes.convertedRevenuePaise)}.</p>
          </div>
        </section>
      ) : null}

      {view === 'sales' ? await SalesView({ storeId: owner.storeId, range, filters, q, sort, dir, page, base }) : null}
      {view === 'stock' ? await StockView({ storeId: owner.storeId, range, filters, page, base }) : null}
      {view === 'coupons' ? await CouponsView({ storeId: owner.storeId, range, summary }) : null}
    </div>
  );
}

async function SalesView({ storeId, range, filters, q, sort, dir, page, base }: {
  storeId: string; range: Parameters<typeof reportSummary>[1]; filters: ReturnType<typeof cleanFilters>; q: string; sort: string; dir: string; page: number; base: string;
}) {
  const [categories, brands, products, idle] = await Promise.all([
    groupSales(storeId, range, 'category', filters),
    groupSales(storeId, range, 'brand', filters),
    productSales(storeId, range, filters),
    slowMovers(storeId, range, filters),
  ]);
  const matching = q ? products.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(q.toLowerCase())) : products;
  const sorted = sortProducts(matching, sort, dir);
  const pg = paginate(sorted, page, PAGE_SIZE);
  const tableBase = `${base}&sort=${sort}&dir=${dir}`;
  return (
    <section className="grid gap-8">
      <div className="grid gap-4 md:grid-cols-2">
        <GroupTable title="Category-wise sales" rows={categories} />
        <GroupTable title="Brand-wise sales" rows={brands} />
      </div>
      <div className="grid gap-2">
        <h2 className="font-display text-xl text-burgundy">Products (best sellers first by default)</h2>
        {pg.total === 0 ? <EmptyState title="No products sold" body="Nothing matches these filters in the period." /> : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2">SKU</th>
                  <SortHeader base={base} label="Product" sortKey="name" current={sort} dir={dir} />
                  <SortHeader base={base} label="Units" sortKey="units" current={sort} dir={dir} align="right" />
                  <SortHeader base={base} label="Taxable sales" sortKey="taxable" current={sort} dir={dir} align="right" />
                  <th className="px-4 py-2 text-right">Cost</th>
                  <SortHeader base={base} label="Gross profit" sortKey="profit" current={sort} dir={dir} align="right" />
                </tr>
              </thead>
              <tbody>
                {pg.items.map((row) => (
                  <tr key={row.sku} className="border-t border-line">
                    <td className="px-4 py-2 font-mono text-xs">{row.sku}</td>
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2 text-right">{row.units}</td>
                    <td className="px-4 py-2 text-right">{rs(row.taxablePaise)}</td>
                    <td className="px-4 py-2 text-right">{rs(row.cogsPaise)}</td>
                    <td className="px-4 py-2 text-right">{rs(row.grossProfitPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager base={tableBase} page={pg.page} pages={pg.pages} />
      </div>
      <div className="grid gap-2">
        <h2 className="font-display text-xl text-burgundy">Slow-moving stock (in stock, not sold in this period)</h2>
        {idle.length === 0 ? <p className="text-sm text-ink-muted">No idle stock with these filters.</p> : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-4 py-2">SKU</th><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">On hand</th><th className="px-4 py-2 text-right">Value at cost</th><th className="px-4 py-2">Last sold</th></tr>
              </thead>
              <tbody>
                {idle.slice(0, 50).map((row) => (
                  <tr key={row.sku} className="border-t border-line">
                    <td className="px-4 py-2 font-mono text-xs">{row.sku}</td>
                    <td className="px-4 py-2">{row.name}{row.label ? ` (${row.label})` : ''}</td>
                    <td className="px-4 py-2 text-right">{row.onHand}</td>
                    <td className="px-4 py-2 text-right">{rs(row.valueAtCostPaise)}</td>
                    <td className="px-4 py-2">{row.lastSoldAt ? new Date(row.lastSoldAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {idle.length > 50 ? <p className="text-xs text-ink-muted">Showing 50 of {idle.length}. The Slow-moving CSV has every row.</p> : null}
      </div>
    </section>
  );
}

function GroupTable({ title, rows }: { title: string; rows: { id: string | null; name: string; units: number; taxablePaise: number; grossProfitPaise: number }[] }) {
  return (
    <div className="grid gap-2 rounded-card border border-line bg-white p-4">
      <h2 className="font-display text-lg text-burgundy">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-ink-muted">No sales.</p> : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-ink-muted"><tr><th className="py-1 text-left">Name</th><th className="py-1 text-right">Units</th><th className="py-1 text-right">Taxable</th><th className="py-1 text-right">Gross profit</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? r.name} className="border-t border-line">
                <td className="py-1">{r.name}</td>
                <td className="py-1 text-right">{r.units}</td>
                <td className="py-1 text-right">{rs(r.taxablePaise)}</td>
                <td className="py-1 text-right">{rs(r.grossProfitPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function StockView({ storeId, range, filters, page, base }: {
  storeId: string; range: Parameters<typeof reportSummary>[1]; filters: ReturnType<typeof cleanFilters>; page: number; base: string;
}) {
  const [rows, summary] = await Promise.all([stockStatus(storeId, filters), reportSummary(storeId, range)]);
  const counts: Record<string, number> = { OUT_OF_STOCK: 0, LOW_STOCK: 0, IN_STOCK: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const pg = paginate(rows, page, PAGE_SIZE);
  return (
    <section className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Out of stock" value={String(counts.OUT_OF_STOCK)} note="Available stock is zero or less" />
        <Card label="Low stock" value={String(counts.LOW_STOCK)} note="At or below the reorder level" />
        <Card label="In stock" value={String(counts.IN_STOCK)} />
        <Card label="Damaged units" value={String(summary.damagedUnits)} note="Recorded damaged stock" />
        <Card label="Inventory valuation" value={rs(summary.inventoryValuationPaise)} note="On-hand stock at current cost" />
      </div>
      {pg.total === 0 ? <EmptyState title="No stock rows" body="Nothing matches these filters." /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-2">SKU</th><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">On hand</th><th className="px-4 py-2 text-right">Reserved</th><th className="px-4 py-2 text-right">Available</th><th className="px-4 py-2 text-right">Damaged</th><th className="px-4 py-2 text-right">Reorder at</th><th className="px-4 py-2">Status</th></tr>
            </thead>
            <tbody>
              {pg.items.map((r) => (
                <tr key={r.sku} className="border-t border-line">
                  <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                  <td className="px-4 py-2">{r.name}{r.label ? ` (${r.label})` : ''}</td>
                  <td className="px-4 py-2 text-right">{r.onHand}</td>
                  <td className="px-4 py-2 text-right">{r.reserved}</td>
                  <td className="px-4 py-2 text-right">{r.available}</td>
                  <td className="px-4 py-2 text-right">{r.damaged}</td>
                  <td className="px-4 py-2 text-right">{r.reorderLevel}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager base={base} page={pg.page} pages={pg.pages} />
    </section>
  );
}

async function CouponsView({ storeId, range, summary }: { storeId: string; range: Parameters<typeof reportSummary>[1]; summary: Awaited<ReturnType<typeof reportSummary>> }) {
  const coupons = await couponUsage(storeId, range);
  return (
    <section className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Discounts given" value={rs(summary.discountPaise)} note="On orders in the period" />
        <Card label="Refunds succeeded" value={rs(summary.refundsPaise)} note={`${summary.refundCount} refunds`} />
        <Card label="Refunds pending" value={rs(summary.refundPendingPaise)} note={`${summary.refundPendingCount} requests`} />
        <Card label="Refund-adjusted gross profit" value={rs(summary.refundAdjustedGrossProfitPaise)} note="Conservative; see Overview" />
      </div>
      <div className="grid gap-2">
        <h2 className="font-display text-xl text-burgundy">Coupon usage</h2>
        {coupons.length === 0 ? <p className="text-sm text-ink-muted">No coupons redeemed in this period.</p> : (
          <table className="w-full rounded-card border border-line bg-white text-sm">
            <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-right">Redemptions</th><th className="px-4 py-2 text-right">Orders</th><th className="px-4 py-2 text-right">Discount given</th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code} className="border-t border-line">
                  <td className="px-4 py-2 font-mono">{c.code}</td>
                  <td className="px-4 py-2 text-right">{c.redemptions}</td>
                  <td className="px-4 py-2 text-right">{c.orders}</td>
                  <td className="px-4 py-2 text-right">{rs(c.discountPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

