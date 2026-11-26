import { buildRange, istDateOf, type DatePreset, type ReportRange } from '@/lib/reports/report-math';

export interface PeriodParams { preset?: string; from?: string; to?: string; page?: string; type?: string }

const PRESETS: string[] = ['today', '7d', '30d', 'mtd', 'ytd', 'custom'];

/** Shared period parsing for every report page, so all sections use the same dates. */
export function periodFrom(params: PeriodParams): { ok: true; range: ReportRange } | { ok: false; error: string } {
  const preset = (PRESETS.includes(params.preset ?? '') ? params.preset : '30d') as DatePreset;
  return buildRange(preset, istDateOf(new Date()), { from: params.from ?? '', to: params.to ?? '' });
}

export function periodQuery(range: ReportRange, extra: Record<string, string | undefined> = {}): string {
  const parts = [`preset=${range.preset}`, `from=${range.fromDate}`, `to=${range.toDate}`];
  for (const [k, v] of Object.entries(extra)) if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  return parts.join('&');
}

export function pageOf(value: string | undefined): number {
  return Math.max(1, Math.floor(Number(value)) || 1);
}
