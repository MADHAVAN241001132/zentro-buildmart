/**
 * Pure query parsing for the payment reconciliation screens (owner and platform administrator).
 * No I/O here: every value taken from the URL is validated before it reaches a service call.
 */

export const PAYMENT_STATUSES = [
  'PENDING', 'CASH_PENDING', 'PROCESSING', 'PAID', 'FAILED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED',
] as const;
export const INIT_ISSUE_STATUSES = ['refused', 'uncertain', 'amount_mismatch'] as const;
export const LATE_STATUSES = ['open', 'refund_requested', 'fulfilment_approved', 'dismissed'] as const;
export const REFUND_STATUSES = ['requested', 'processing', 'succeeded', 'failed', 'rejected'] as const;

export const PAGE_SIZE = 25;

export interface ListQuery {
  /** Order number or provider reference, letters, digits, dash and underscore only. */
  q: string;
  /** Null means every status allowed for the tab. */
  status: string | null;
  /** IST calendar dates, YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  page: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Default window: the 30 IST days ending today. */
export function defaultRange(now: Date = new Date()): { from: string; to: string } {
  const to = istToday(now);
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to };
}

/**
 * Converts an inclusive IST date range into a half-open timestamp range for database filters.
 * Returns null when either date is invalid or the range is reversed or longer than a year.
 */
export function istRangeIso(from: string, to: string): { startIso: string; endIso: string } | null {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return null;
  const end = new Date(`${to}T00:00:00Z`);
  const days = (end.getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
  if (days > 366) return null;
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    startIso: `${from}T00:00:00+05:30`,
    endIso: `${end.toISOString().slice(0, 10)}T00:00:00+05:30`,
  };
}

export function sanitiseSearch(raw: string | undefined): string {
  return (raw ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

export function parseListQuery(
  sp: Record<string, string | undefined>,
  allowedStatuses: readonly string[],
  now: Date = new Date(),
): ListQuery {
  const fallback = defaultRange(now);
  const from = sp.from && isIsoDate(sp.from) ? sp.from : fallback.from;
  const to = sp.to && isIsoDate(sp.to) ? sp.to : fallback.to;
  const status = sp.status && allowedStatuses.includes(sp.status) ? sp.status : null;
  const pageNumber = Number.parseInt(sp.page ?? '1', 10);
  const page = Number.isFinite(pageNumber) && pageNumber >= 1 && pageNumber <= 10_000 ? pageNumber : 1;
  return { q: sanitiseSearch(sp.q), status, from, to, page };
}

export function pageBounds(page: number): { from: number; to: number } {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
