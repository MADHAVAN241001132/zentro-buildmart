import { NextResponse } from 'next/server';
import { buildRange, istDateOf, type DatePreset } from '@/lib/reports/report-math';
import { buildWorkbook } from '@/lib/exports/xlsx';
import { datasetToCsv, fileStem, spreadsheetValue, type Dataset } from '@/lib/exports/tabular';
import { renderReportPdf } from '@/lib/exports/report-pdf';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';
import { checkFeature } from '@/lib/services/entitlements';
import { cleanFilters } from '@/lib/services/reports';
import { buildDataset, isReportType } from '@/lib/services/report-datasets';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRESETS: DatePreset[] = ['today', '7d', '30d', 'mtd', 'ytd', 'custom'];
const FORMATS = ['csv', 'xlsx', 'pdf'] as const;
type Format = (typeof FORMATS)[number];

function attachment(name: string, type: string, body: BodyInit): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Report export in CSV, Excel or PDF. Every format is built from the same dataset, so the three agree.
 * Store scope comes from the signed-in owner, never from the URL. Filters and dates match the screens.
 */
export async function GET(request: Request) {
  let owner;
  try {
    owner = await ownerPermissionForRoute('reports_exports');
  } catch (error) {
    return routeDeniedResponse(error);
  }
  const reportsBlocked = await checkFeature(owner.storeId, 'reports');
  if (reportsBlocked) return NextResponse.json({ error: reportsBlocked }, { status: 403 });
  const url = new URL(request.url);
  const preset = (PRESETS.includes(url.searchParams.get('preset') as DatePreset) ? url.searchParams.get('preset') : '30d') as DatePreset;
  const built = buildRange(preset, istDateOf(new Date()), { from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '' });
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const type = url.searchParams.get('type') ?? '';
  if (!isReportType(type)) return NextResponse.json({ error: 'Unknown report type.' }, { status: 400 });
  const formatParam = url.searchParams.get('format') ?? 'csv';
  if (!(FORMATS as readonly string[]).includes(formatParam)) return NextResponse.json({ error: 'Unknown format.' }, { status: 400 });
  const format = formatParam as Format;
  const movementType = url.searchParams.get('movement') || null;

  try {
    const dataset: Dataset = await buildDataset(type, {
      storeId: owner.storeId,
      range: built.range,
      filters: cleanFilters(url.searchParams.get('category'), url.searchParams.get('brand')),
      movementType,
    });
    const stem = `${fileStem(dataset)}-${built.range.fromDate}-to-${built.range.toDate}`;
    if (format === 'csv') {
      return attachment(`${stem}.csv`, 'text/csv; charset=utf-8', datasetToCsv(dataset));
    }
    if (format === 'xlsx') {
      const rows = [dataset.columns.map((c) => c.header), ...dataset.rows.map((row) => row.map((v, i) => spreadsheetValue(v ?? null, dataset.columns[i]!.kind)))];
      const book = buildWorkbook(dataset.title, rows);
      return attachment(`${stem}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(book));
    }
    const { data: store } = await createSupabaseAdminClient().from('stores').select('name').eq('id', owner.storeId).maybeSingle();
    const pdf = await renderReportPdf(dataset, (store?.name as string | undefined) ?? 'ZENTRO BuildMart', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    return attachment(`${stem}.pdf`, 'application/pdf', new Uint8Array(pdf));
  } catch {
    return NextResponse.json({ error: 'The report could not be created. Please try again.' }, { status: 500 });
  }
}
