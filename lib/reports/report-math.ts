/**
 * Pure helpers for reports. No database or server imports, so they are unit tested directly.
 * Business days and date ranges follow India Standard Time (UTC+05:30), the store's local time.
 */

export const IST_OFFSET = '+05:30';

export type DatePreset = 'today' | '7d' | '30d' | 'mtd' | 'ytd' | 'custom';
export const DATE_PRESETS: DatePreset[] = ['today', '7d', '30d', 'mtd', 'ytd', 'custom'];

export interface ReportRange {
  preset: DatePreset;
  /** Inclusive start date, YYYY-MM-DD, in IST. */
  fromDate: string;
  /** Inclusive end date, YYYY-MM-DD, in IST. */
  toDate: string;
  /** Instant range used in queries: start inclusive, end exclusive. */
  startIso: string;
  endIso: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function istDateOf(instant: Date): string {
  return new Date(instant.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function startOfIstDay(date: string): string {
  return new Date(`${date}T00:00:00${IST_OFFSET}`).toISOString();
}

/**
 * Builds the range for a preset. "today" is the IST date passed in, so tests are deterministic.
 * Custom ranges must be YYYY-MM-DD and no longer than two years. Returns an error message when invalid.
 */
export function buildRange(
  preset: DatePreset,
  todayIst: string,
  custom?: { from: string; to: string },
): { ok: true; range: ReportRange } | { ok: false; error: string } {
  let fromDate: string;
  let toDate = todayIst;
  switch (preset) {
    case 'today':
      fromDate = todayIst;
      break;
    case '7d':
      fromDate = shiftDate(todayIst, -6);
      break;
    case '30d':
      fromDate = shiftDate(todayIst, -29);
      break;
    case 'mtd':
      fromDate = `${todayIst.slice(0, 7)}-01`;
      break;
    case 'ytd':
      fromDate = `${todayIst.slice(0, 4)}-01-01`;
      break;
    case 'custom': {
      if (!custom || !DATE_ONLY.test(custom.from) || !DATE_ONLY.test(custom.to)) {
        return { ok: false, error: 'Enter both dates as YYYY-MM-DD.' };
      }
      if (custom.from > custom.to) return { ok: false, error: 'The start date must be on or before the end date.' };
      const days = (new Date(`${custom.to}T00:00:00Z`).getTime() - new Date(`${custom.from}T00:00:00Z`).getTime()) / 86_400_000;
      if (days > 730) return { ok: false, error: 'A custom range can be at most two years.' };
      fromDate = custom.from;
      toDate = custom.to;
      break;
    }
  }
  return {
    ok: true,
    range: {
      preset,
      fromDate,
      toDate,
      startIso: startOfIstDay(fromDate),
      endIso: startOfIstDay(shiftDate(toDate, 1)),
    },
  };
}

/** Money: integer paise to a plain rupee string with two decimals and Indian digit grouping, no symbol. */
export function paiseToRupeeText(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) grouped = digits;
  else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  return `${negative ? '-' : ''}${grouped}.${frac}`;
}

/** Divides and returns 0 when the divisor is zero, so empty periods show zero rather than NaN. */
export function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function percentText(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Gross profit using historical cost snapshots. Revenue is taxable value (GST excluded). The result is only
 * as good as the cost snapshot stored on each order line; it is not recalculated from today's costs.
 */
export function grossProfitPaise(taxablePaise: number, cogsPaise: number): number {
  return taxablePaise - cogsPaise;
}

/** CSV cell: values starting with a formula character are prefixed with an apostrophe, and quoted when needed. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a CSV document with a UTF-8 BOM so Excel reads Tamil and rupee text correctly. */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; pages: number; total: number } {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: safePage, pages, total };
}

/** Trend grouping for a range: daily up to about four months, weekly up to about a year, otherwise monthly. */
export function trendBucket(range: { fromDate: string; toDate: string }): 'day' | 'week' | 'month' {
  const days = (Date.parse(`${range.toDate}T00:00:00Z`) - Date.parse(`${range.fromDate}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > 370) return 'month';
  if (days > 120) return 'week';
  return 'day';
}
