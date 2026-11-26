import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireOwnerPermission } from '@/lib/services/owner';
import { getImportBatch } from '@/lib/services/product-import';
import { confirmImportAction } from '../actions';

export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  productsCreated: 'Products created',
  productsUpdated: 'Products updated',
  variantsCreated: 'Variants created',
  variantsUpdated: 'Variants updated',
  pricesUpdated: 'Prices updated',
  readyRows: 'Rows ready',
  skippedRows: 'Rows skipped',
  errorRows: 'Rows with errors',
};

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ applied?: string; error?: string }>;
}) {
  const owner = await requireOwnerPermission('product_management');
  const { batchId } = await params;
  const { applied, error } = await searchParams;
  const batch = await getImportBatch(owner.storeId, batchId);
  if (!batch) notFound();

  const isApplied = batch.status === 'applied';
  const hasErrors = batch.error_rows > 0 || batch.skipped_rows > 0;
  const summary = isApplied ? batch.summary ?? {} : null;

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link className="underline" href="/owner/products/import">Back to import and export</Link>
      </nav>

      <header>
        <h1 className="text-2xl font-semibold">{batch.file_name}</h1>
        <p className="text-sm text-ink/70">
          {batch.kind === 'prices' ? 'Price update' : 'Products and variants'} · {batch.total_rows} data rows ·{' '}
          {isApplied ? 'Applied' : 'Preview, not yet applied'}
        </p>
      </header>

      {applied ? <p role="status" className="rounded-card border border-line bg-card p-3 text-sm">The import has been applied.</p> : null}
      {error ? <p role="alert" className="rounded-card border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Ready" value={batch.ready_rows} />
        <Stat label="Errors" value={batch.error_rows} />
        <Stat label="Skipped" value={batch.skipped_rows} />
        <Stat label="Total rows" value={batch.total_rows} />
      </section>

      {summary ? (
        <section className="rounded-card border border-line bg-card p-4">
          <h2 className="mb-2 font-semibold">Applied summary</h2>
          <dl className="grid gap-2 text-sm md:grid-cols-3">
            {Object.entries(LABELS).map(([key, label]) => (
              summary[key] !== undefined ? (
                <div key={key}><dt className="text-ink/70">{label}</dt><dd className="font-semibold">{String(summary[key])}</dd></div>
              ) : null
            ))}
          </dl>
        </section>
      ) : null}

      {hasErrors ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>Rows that were not imported:</span>
          <a className="underline" href={`/owner/products/import/${batch.id}/errors?format=csv`}>Download error report (CSV)</a>
          <a className="underline" href={`/owner/products/import/${batch.id}/errors?format=xlsx`}>Download error report (Excel)</a>
        </div>
      ) : null}

      <section className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink/70">
            <tr>
              <th className="py-2">File row</th>
              <th>SKU</th>
              <th>Status</th>
              <th>Action</th>
              <th>Messages</th>
            </tr>
          </thead>
          <tbody>
            {batch.row_results.map((row) => (
              <tr
                key={row.row}
                data-status={row.status}
                className={
                  row.status === 'error' ? 'border-t bg-danger/10'
                    : row.status === 'skipped' ? 'border-t bg-amber-50'
                    : 'border-t'
                }
              >
                <td className="py-2">{row.row}</td>
                <td className="font-mono">{row.sku || '-'}</td>
                <td>{row.status === 'error' ? 'Error' : row.status === 'skipped' ? 'Skipped' : 'Ready'}</td>
                <td>{row.action}</td>
                <td>{row.messages.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!isApplied ? (
        <form action={confirmImportAction} className="space-y-2">
          <input type="hidden" name="batchId" value={batch.id} />
          <p className="text-sm text-ink/70">
            Confirming applies the {batch.ready_rows} ready rows in one transaction. If anything fails, nothing changes
            and you can confirm again. Rows with errors are not applied.
          </p>
          <Button type="submit" disabled={batch.ready_rows === 0}>Confirm and apply {batch.ready_rows} rows</Button>
        </form>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-line bg-card p-4">
      <div className="text-xs text-ink/70">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
