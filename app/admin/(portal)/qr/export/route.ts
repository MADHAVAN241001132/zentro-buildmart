import { NextResponse } from 'next/server';
import { buildWorkbook } from '@/lib/exports/xlsx';
import { datasetToCsv, spreadsheetValue } from '@/lib/exports/tabular';
import { adminQrDataset } from '@/lib/qr/analytics';
import { buildRange, istDateOf, type DatePreset } from '@/lib/reports/report-math';
import { requireAdmin } from '@/lib/services/admin';
import { loadPlatformQrAnalytics, QrAnalyticsError } from '@/lib/services/qr-analytics';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRESETS: DatePreset[] = ['today', '7d', '30d', 'mtd', 'ytd', 'custom'];

function attachment(name: string, type: string, body: BodyInit): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Platform QR analytics export for platform administrators. Aggregates only; no guest-session identifiers. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  const url = new URL(request.url);
  const preset = (PRESETS.includes(url.searchParams.get('preset') as DatePreset) ? url.searchParams.get('preset') : '30d') as DatePreset;
  const built = buildRange(preset, istDateOf(new Date()), { from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '' });
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const format = url.searchParams.get('format') ?? 'csv';
  if (format !== 'csv' && format !== 'xlsx') return NextResponse.json({ error: 'Unknown format.' }, { status: 400 });
  const storeId = url.searchParams.get('store') || null;
  if (storeId !== null && !/^[0-9a-f-]{36}$/i.test(storeId)) return NextResponse.json({ error: 'Unknown store.' }, { status: 400 });

  let storeLabel = 'All stores';
  if (storeId) {
    const { data } = await (await createSupabaseServerClient()).from('stores').select('name').eq('id', storeId).maybeSingle();
    storeLabel = (data?.name as string | undefined) ?? 'Selected store';
  }

  try {
    const { stores } = await loadPlatformQrAnalytics(storeId, built.range.fromDate, built.range.toDate);
    const dataset = adminQrDataset({ fromDate: built.range.fromDate, toDate: built.range.toDate, storeLabel, rows: stores });
    const stem = `platform-qr-analytics-${built.range.fromDate}-to-${built.range.toDate}`;
    if (format === 'csv') return attachment(`${stem}.csv`, 'text/csv; charset=utf-8', datasetToCsv(dataset));
    const rows = [dataset.columns.map((c) => c.header), ...dataset.rows.map((row) => row.map((v, i) => spreadsheetValue(v ?? null, dataset.columns[i]!.kind)))];
    const book = buildWorkbook('Platform QR analytics', rows);
    return attachment(`${stem}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(book));
  } catch (error) {
    if (error instanceof QrAnalyticsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'The QR report could not be created.' }, { status: 500 });
  }
}
