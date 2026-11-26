import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { QrDayRow, QrStoreRow, QrSummary } from '@/lib/qr/analytics';

/** Reads QR analytics through the database functions, which check authorisation themselves. */
export class QrAnalyticsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 500,
  ) {
    super(message);
  }
}

function toError(error: { code?: string; message: string }): QrAnalyticsError {
  if (error.code === '42501') return new QrAnalyticsError('You are not allowed to view these figures.', 403);
  if (error.code === '22023') return new QrAnalyticsError('The date range is not valid.', 400);
  return new QrAnalyticsError('The QR figures could not be loaded. Please try again.', 500);
}

function first<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export async function loadStoreQrAnalytics(storeId: string, from: string, to: string): Promise<{ summary: QrSummary; daily: QrDayRow[] }> {
  const supabase = await createSupabaseServerClient();
  const [summary, daily] = await Promise.all([
    supabase.rpc('zb_qr_summary', { p_store: storeId, p_from: from, p_to: to }),
    supabase.rpc('zb_qr_daily', { p_store: storeId, p_from: from, p_to: to }),
  ]);
  if (summary.error) throw toError(summary.error);
  if (daily.error) throw toError(daily.error);
  return { summary: (first(summary.data as QrSummary | QrSummary[] | null)) as QrSummary, daily: (daily.data ?? []) as QrDayRow[] };
}

/** Platform figures. A null store means every store; only platform administrators may ask for that. */
export async function loadPlatformQrAnalytics(
  storeId: string | null,
  from: string,
  to: string,
): Promise<{ summary: QrSummary; daily: QrDayRow[]; stores: QrStoreRow[] }> {
  const supabase = await createSupabaseServerClient();
  const [summary, daily, stores] = await Promise.all([
    supabase.rpc('zb_qr_summary', { p_store: storeId, p_from: from, p_to: to }),
    supabase.rpc('zb_qr_daily', { p_store: storeId, p_from: from, p_to: to }),
    supabase.rpc('zb_qr_store_comparison', { p_from: from, p_to: to, p_store: storeId }),
  ]);
  if (summary.error) throw toError(summary.error);
  if (daily.error) throw toError(daily.error);
  if (stores.error) throw toError(stores.error);
  return {
    summary: first(summary.data as QrSummary | QrSummary[] | null) as QrSummary,
    daily: (daily.data ?? []) as QrDayRow[],
    stores: (stores.data ?? []) as QrStoreRow[],
  };
}

export async function loadAttributionSettings(): Promise<{ attributionHours: number; dedupeMinutes: number }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('qr_analytics_settings').select('attribution_hours, dedupe_minutes').maybeSingle();
  return {
    attributionHours: Number(data?.attribution_hours ?? 24),
    dedupeMinutes: Number(data?.dedupe_minutes ?? 30),
  };
}
