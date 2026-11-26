/**
 * Pure helpers for the platform dashboard. Money stays in integer paise. Percentages round half up.
 */

/** Whole-number percentage of part over whole. Returns null when there is no whole to measure against. */
export function percentOf(part: number, whole: number | null | undefined): number | null {
  if (whole === null || whole === undefined || whole <= 0) return null;
  return Math.floor((part * 100 + Math.floor(whole / 2)) / whole);
}

/** Width of a trend bar as a whole percentage of the largest value. Zero when nothing is above zero. */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(100, Math.max(1, Math.round((value / max) * 100)));
}

/** Largest value in a list, for scaling bars. */
export function maxOf<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((m, row) => Math.max(m, pick(row)), 0);
}

/** Inclusive number of days between two YYYY-MM-DD dates. Returns 0 when the range is reversed or invalid. */
export function inclusiveDays(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

/** The dashboard refuses ranges longer than the database accepts (366 days). */
export const MAX_DASHBOARD_DAYS = 366;
