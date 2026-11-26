import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireOwnerPermission } from '@/lib/services/owner';
import { listImportBatches } from '@/lib/services/product-import';
import { listFilterOptions } from '@/lib/services/catalogue-export';
import { previewImportAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProductImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const owner = await requireOwnerPermission('product_management');
  const { error } = await searchParams;
  const [batches, filters] = await Promise.all([listImportBatches(owner.storeId), listFilterOptions(owner.storeId)]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Import and export products</h1>
        <p className="text-sm text-ink/70">
          Upload a CSV or Excel file to add or update products, variants and prices. Every upload is previewed first.
          Nothing changes until you confirm.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p>
      ) : null}

      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-semibold">Templates</h2>
        <p className="text-sm text-ink/70">
          Each template has sample rows and an Instructions sheet. Replace the samples before you upload.
        </p>
        <ul className="flex flex-wrap gap-3 text-sm">
          <li><a download className="underline" href="/owner/products/import/template?kind=catalogue&format=xlsx">Product and variant template (Excel)</a></li>
          <li><a download className="underline" href="/owner/products/import/template?kind=catalogue&format=csv">Product and variant template (CSV)</a></li>
          <li><a download className="underline" href="/owner/products/import/template?kind=prices&format=xlsx">Price update template (Excel)</a></li>
          <li><a download className="underline" href="/owner/products/import/template?kind=prices&format=csv">Price update template (CSV)</a></li>
        </ul>
      </section>

      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-semibold">Upload a file</h2>
        <form action={previewImportAction} encType="multipart/form-data" className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">File (CSV or Excel, up to 2 MB, 1,000 rows)</span>
            <input name="file" type="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block w-full text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">What the file contains</span>
            <select name="kind" defaultValue="catalogue" className="block w-full rounded-md border px-3 py-2 text-sm">
              <option value="catalogue">Products and variants (new or changed)</option>
              <option value="prices">Price updates for existing variants</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">When a SKU already exists</span>
            <select name="mode" defaultValue="skip" className="block w-full rounded-md border px-3 py-2 text-sm">
              <option value="skip">Skip the row and report it</option>
              <option value="update">Update the existing product or variant</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <Button type="submit">Preview import</Button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-semibold">Export</h2>
        <form method="get" action="/owner/products/catalogue-export" className="grid gap-4 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-sm font-medium">Export</span>
            <select name="kind" defaultValue="catalogue" className="block w-full rounded-md border px-3 py-2 text-sm">
              <option value="catalogue">Complete catalogue (re-importable)</option>
              <option value="variants">Variants</option>
              <option value="inventory">Inventory</option>
              <option value="prices">Price list</option>
              <option value="low-stock">Low stock</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Category</span>
            <select name="category" defaultValue="" className="block w-full rounded-md border px-3 py-2 text-sm">
              <option value="">All categories</option>
              {filters.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Brand</span>
            <select name="brand" defaultValue="" className="block w-full rounded-md border px-3 py-2 text-sm">
              <option value="">All brands</option>
              {filters.brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Format</span>
            <select name="format" defaultValue="xlsx" className="block w-full rounded-md border px-3 py-2 text-sm">
              <option value="xlsx">Excel</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <div className="md:col-span-4">
            <Button type="submit" variant="secondary">Download export</Button>
            <p className="mt-2 text-xs text-ink/70">Exports are limited to 10,000 variant rows. Filter larger catalogues by category or brand.</p>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Import history</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-ink/70">No imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-ink/70">
              <tr>
                <th className="py-2">When</th>
                <th>File</th>
                <th>Type</th>
                <th>Rows</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="py-2">{new Date(b.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td><Link className="underline" href={`/owner/products/import/${b.id}`}>{b.file_name}</Link></td>
                  <td>{b.kind === 'prices' ? 'Price update' : 'Products and variants'}</td>
                  <td>{b.total_rows} ({b.ready_rows} ready, {b.error_rows} errors, {b.skipped_rows} skipped)</td>
                  <td>{b.status === 'applied' ? 'Applied' : 'Preview, not applied'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
