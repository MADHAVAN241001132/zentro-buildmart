import { NextResponse } from 'next/server';
import { buildWorkbook } from '@/lib/exports/xlsx';
import { datasetToCsv, spreadsheetValue } from '@/lib/exports/tabular';
import { ownerQrDataset } from '@/lib/qr/analytics';
import { buildRange, istDateOf, type DatePreset } from '@/lib/reports/report-math';
import { checkFeature } from '@/lib/services/entitlements';
import { loadStoreQrAnalytics, QrAnalyticsError } from '@/lib/services/qr-analytics';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function attachment(name: string, type: string, body: BodyInit): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** QR analytics export for the signed-in owner's store. Aggregates only; no guest-session identifiers. */
export async function GET(request: Request) {
  let owner;
  try {
    owner = await ownerPermissionForRoute('qr_analytics');
  } catch (error) {
    return routeDeniedResponse(error);
  }
  const blocked = await checkFeature(owner.storeId, 'qr_scan_analytics');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });

  const url = new URL(request.url);
  const preset = (['today', '7d', '30d', 'mtd', 'ytd', 'custom'] as const).includes(url.searchParams.get('preset') as DatePreset)
    ? (url.searchParams.get('preset') as DatePreset)
    : '30d';
  const built = buildRange(preset, istDateOf(new Date()), { from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '' });
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const format = url.searchParams.get('format') ?? 'csv';
  if (format !== 'csv' && format !== 'xlsx') return NextResponse.json({ error: 'Unknown format.' }, { status: 400 });

  try {
    const { summary, daily } = await loadStoreQrAnalytics(owner.storeId, built.range.fromDate, built.range.toDate);
    const dataset = ownerQrDataset({ fromDate: built.range.fromDate, toDate: built.range.toDate, summary, daily });
    const stem = `qr-analytics-${built.range.fromDate}-to-${built.range.toDate}`;
    if (format === 'csv') return attachment(`${stem}.csv`, 'text/csv; charset=utf-8', datasetToCsv(dataset));
    const rows = [dataset.columns.map((c) => c.header), ...dataset.rows.map((row) => row.map((v, i) => spreadsheetValue(v ?? null, dataset.columns[i]!.kind)))];
    const book = buildWorkbook('QR analytics', rows);
    return attachment(`${stem}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(book));
  } catch (error) {
    if (error instanceof QrAnalyticsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'The QR report could not be created.' }, { status: 500 });
  }
}
