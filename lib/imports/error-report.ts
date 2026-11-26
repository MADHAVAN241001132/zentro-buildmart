import type { Dataset } from '@/lib/exports/tabular';
import type { RowResult } from '@/lib/imports/catalogue-rules';

/**
 * Downloadable report of every row that was not ready, with the reasons. Only the file's own row numbers appear,
 * so the owner can fix the spreadsheet and upload it again.
 */
export function buildErrorReport(rows: RowResult[], fileName: string): Dataset {
  const flagged = rows.filter((row) => row.status !== 'ready');
  return {
    title: 'Import errors',
    subtitle: `Rows not imported from ${fileName}. Fix these rows and upload the file again.`,
    columns: [
      { header: 'File row', kind: 'int' },
      { header: 'Status', kind: 'text' },
      { header: 'SKU', kind: 'text' },
      { header: 'Reasons', kind: 'text' },
    ],
    rows: flagged.map((row) => [
      row.row,
      row.status === 'error' ? 'Error' : 'Skipped',
      row.sku,
      row.messages.join(' ') || row.action,
    ]),
  };
}
