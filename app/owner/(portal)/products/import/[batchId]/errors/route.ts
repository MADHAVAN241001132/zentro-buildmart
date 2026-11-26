import { NextResponse } from 'next/server';
import { datasetToCsv, fileStem, spreadsheetValue } from '@/lib/exports/tabular';
import { buildWorkbook } from '@/lib/exports/xlsx';
import { attachment, CSV_TYPE, XLSX_TYPE } from '@/lib/exports/attachment';
import { buildErrorReport } from '@/lib/imports/error-report';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';
import { getImportBatch } from '@/lib/services/product-import';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Downloadable list of rows that were not imported, in CSV or Excel. The batch must belong to the owner's store. */
export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  let owner;
  try {
    owner = await ownerPermissionForRoute('product_management');
  } catch (error) {
    return routeDeniedResponse(error);
  }

  const { batchId } = await params;
  const batch = await getImportBatch(owner.storeId, batchId);
  if (!batch) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const dataset = buildErrorReport(batch.row_results, batch.file_name);
  const stem = `${fileStem({ ...dataset, title: 'import-errors' })}-${batch.id.slice(0, 8)}`;
  if (new URL(request.url).searchParams.get('format') === 'xlsx') {
    const rows = [dataset.columns.map((c) => c.header), ...dataset.rows.map((row) => row.map((v, i) => spreadsheetValue(v ?? null, dataset.columns[i]!.kind)))];
    return attachment(`${stem}.xlsx`, XLSX_TYPE, new Uint8Array(buildWorkbook('Import errors', rows)));
  }
  return attachment(`${stem}.csv`, CSV_TYPE, datasetToCsv(dataset));
}
