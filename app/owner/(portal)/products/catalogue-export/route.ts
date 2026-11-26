import { NextResponse } from 'next/server';
import { datasetToCsv, fileStem, spreadsheetValue } from '@/lib/exports/tabular';
import { buildWorkbook } from '@/lib/exports/xlsx';
import { attachment, CSV_TYPE, XLSX_TYPE } from '@/lib/exports/attachment';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';
import { buildCatalogueExport, EXPORT_KINDS, type ExportKind } from '@/lib/services/catalogue-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FORMATS = ['csv', 'xlsx'] as const;

/** Catalogue exports in CSV or Excel. Store scope comes from the signed-in owner, never from the URL. Staff are refused. */
export async function GET(request: Request) {
  let owner;
  try {
    owner = await ownerPermissionForRoute('product_management');
  } catch (error) {
    return routeDeniedResponse(error);
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? '';
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'Unknown export.' }, { status: 400 });
  const format = url.searchParams.get('format') ?? 'csv';
  if (!(FORMATS as readonly string[]).includes(format)) return NextResponse.json({ error: 'Unknown format.' }, { status: 400 });

  try {
    const dataset = await buildCatalogueExport({
      storeId: owner.storeId,
      storeName: owner.storeName,
      kind: kind as ExportKind,
      filters: {
        categorySlug: url.searchParams.get('category') || null,
        brandSlug: url.searchParams.get('brand') || null,
      },
    });
    const stem = `${fileStem(dataset)}-${kind}`;
    if (format === 'csv') return attachment(`${stem}.csv`, CSV_TYPE, datasetToCsv(dataset));
    const rows = [dataset.columns.map((c) => c.header), ...dataset.rows.map((row) => row.map((v, i) => spreadsheetValue(v ?? null, dataset.columns[i]!.kind)))];
    return attachment(`${stem}.xlsx`, XLSX_TYPE, new Uint8Array(buildWorkbook(dataset.title, rows)));
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('This export') ? error.message : 'The export could not be created. Please try again.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
