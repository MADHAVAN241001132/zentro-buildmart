import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/owner/page-header';
import { Pagination } from '@/components/owner/pagination';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseProductFilters } from './product-filters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const owner = await requireOwnerPermission('product_management');
  const sp = await searchParams;
  const filters = parseProductFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const supabase = await createSupabaseServerClient();

  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('store_id', owner.storeId).order('sort_order'),
    supabase.from('brands').select('id, name').eq('store_id', owner.storeId).order('name'),
  ]);

  let query = supabase
    .from('products')
    .select(
      'id, sku, name, status, visibility, gst_rate_bps, category:categories(name), brand:brands(name), product_variants(id, sale_price_paise, is_default, is_active)',
      { count: 'exact' },
    )
    .eq('store_id', owner.storeId)
    .order('name', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filters.q) query = query.textSearch('search_tsv', filters.q, { config: 'simple', type: 'websearch' });
  if (filters.category) query = query.eq('category_id', filters.category);
  if (filters.brand) query = query.eq('brand_id', filters.brand);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, count, error } = await query;

  const rows = (data ?? []) as unknown as {
    id: string; sku: string; name: string; status: string; visibility: string; gst_rate_bps: number;
    category: { name: string } | null; brand: { name: string } | null;
    product_variants: { id: string; sale_price_paise: number; is_default: boolean; is_active: boolean }[];
  }[];
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const exportQs = new URLSearchParams(Object.entries({ q: filters.q, category: filters.category, brand: filters.brand, status: filters.status }).filter(([, v]) => v) as [string, string][]).toString();
  const filterParams = { q: filters.q, category: filters.category, brand: filters.brand, status: filters.status };

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description={`${count ?? 0} product${count === 1 ? '' : 's'} match the current filters.`}
        actions={
          <>
            <a href={`/owner/products/export${exportQs ? `?${exportQs}` : ''}`} className="rounded-control border border-line px-4 py-2 text-sm font-semibold text-ink">Export CSV</a>
            <Link href="/owner/products/new" className="rounded-control bg-burgundy px-4 py-2 text-sm font-semibold text-cream">Add product</Link>
          </>
        }
      />

      <form method="get" className="grid gap-3 rounded-card border border-line bg-card p-4 md:grid-cols-[1fr_200px_200px_160px_auto]">
        <label className="sr-only" htmlFor="q">Search products</label>
        <input id="q" name="q" defaultValue={filters.q ?? ''} placeholder="Search name, SKU or model" className="rounded-control border border-line bg-white px-3 py-2.5" />
        <label className="sr-only" htmlFor="category">Category</label>
        <select id="category" name="category" defaultValue={filters.category ?? ''} className="rounded-control border border-line bg-white px-3 py-2.5">
          <option value="">All categories</option>
          {(categories ?? []).map((c) => <option key={c.id as string} value={c.id as string}>{c.name as string}</option>)}
        </select>
        <label className="sr-only" htmlFor="brand">Brand</label>
        <select id="brand" name="brand" defaultValue={filters.brand ?? ''} className="rounded-control border border-line bg-white px-3 py-2.5">
          <option value="">All brands</option>
          {(brands ?? []).map((b) => <option key={b.id as string} value={b.id as string}>{b.name as string}</option>)}
        </select>
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={filters.status ?? ''} className="rounded-control border border-line bg-white px-3 py-2.5">
          <option value="">Active and archived</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <button type="submit" className="rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream">Apply</button>
      </form>

      {error ? (
        <EmptyState title="Could not load products" body="Refresh the page and try again." />
      ) : rows.length === 0 ? (
        <EmptyState title="No products found" body="Clear the filters or add your first product." action={<Link href="/owner/products/new" className="font-semibold text-burgundy">Add product</Link>} />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category · brand</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">GST</th>
                <th className="px-4 py-3 font-semibold">Visibility</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const def = row.product_variants.find((v) => v.is_default) ?? row.product_variants[0];
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{row.name}</p>
                      <p className="text-xs text-ink-muted">SKU {row.sku} · {row.product_variants.length} variant{row.product_variants.length === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{row.category?.name ?? '—'}{row.brand ? ` · ${row.brand.name}` : ''}</td>
                    <td className="px-4 py-3">{def ? formatINR(def.sale_price_paise) : '—'}</td>
                    <td className="px-4 py-3">{(row.gst_rate_bps / 100).toFixed(0)}%</td>
                    <td className="px-4 py-3 capitalize">{row.visibility}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${row.status === 'archived' ? 'bg-ink-muted/10 text-ink-muted' : 'bg-success/10 text-success'}`}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/owner/products/${row.id}`} className="font-semibold text-burgundy">Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/owner/products" params={filterParams} page={page} pageCount={pageCount} />
    </div>
  );
}
