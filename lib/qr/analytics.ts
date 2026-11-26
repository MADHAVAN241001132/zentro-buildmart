/**
 * QR analytics shapes and export datasets. Pure functions, so the rules can be tested without a database.
 *
 * Definitions used everywhere:
 * - Recorded entries: tracked QR link openings recorded after the refresh window. They are not verified physical scans.
 * - Unique guest sessions: distinct guest sessions among recorded entries in the period. An estimate of visitors.
 * - Attributed orders: non-cancelled orders attributed to a tracked entry whose entry falls in the period.
 * - Paid attributed orders: attributed orders whose payment is recorded as paid, partly refunded or refunded.
 * - Conversion estimate: converted sessions divided by unique sessions, where a converted session has at least one
 *   paid attributed order. It is an estimate, not proof that a visit caused a sale.
 * Exports contain aggregates only. They never include guest-session identifiers.
 */
import type { Dataset } from '@/lib/exports/tabular';

export interface QrSummary {
  entries: number;
  unique_sessions: number;
  repeat_entries: number;
  entries_today: number;
  entries_last_7_days: number;
  entries_month_to_date: number;
  attributed_orders: number;
  paid_orders: number;
  paid_value_paise: number;
  refunded_paise: number;
  converted_sessions: number;
  conversion_bps: number | null;
}

export interface QrDayRow {
  day: string;
  entries: number;
  unique_sessions: number;
  attributed_orders: number;
  paid_orders: number;
  paid_value_paise: number;
}

export interface QrStoreRow {
  store_id: string;
  store_name: string;
  entries: number;
  unique_sessions: number;
  attributed_orders: number;
  paid_orders: number;
  paid_value_paise: number;
  converted_sessions: number;
  conversion_bps: number | null;
}

export const EMPTY_QR_SUMMARY: QrSummary = {
  entries: 0,
  unique_sessions: 0,
  repeat_entries: 0,
  entries_today: 0,
  entries_last_7_days: 0,
  entries_month_to_date: 0,
  attributed_orders: 0,
  paid_orders: 0,
  paid_value_paise: 0,
  refunded_paise: 0,
  converted_sessions: 0,
  conversion_bps: null,
};

/** Basis points to a percentage. A null value means no sessions in the period, so no estimate is shown. */
export function conversionText(bps: number | null): string {
  if (bps === null) return 'Not enough data';
  return `${(bps / 100).toFixed(2)}%`;
}

/** Net paid value: paid value less refunds recorded as succeeded. Never negative. */
export function netPaidPaise(paidPaise: number, refundedPaise: number): number {
  return Math.max(0, paidPaise - refundedPaise);
}

export function ownerQrDataset(input: { fromDate: string; toDate: string; summary: QrSummary; daily: QrDayRow[] }): Dataset {
  const { summary } = input;
  return {
    title: 'QR analytics',
    subtitle: `${input.fromDate} to ${input.toDate}. Recorded entries are tracked link openings, not verified physical scans. Conversion estimate: ${conversionText(summary.conversion_bps)}.`,
    columns: [
      { header: 'Date', kind: 'date' },
      { header: 'Recorded entries', kind: 'int' },
      { header: 'Unique guest sessions (estimate)', kind: 'int' },
      { header: 'Attributed orders', kind: 'int' },
      { header: 'Paid attributed orders', kind: 'int' },
      { header: 'Paid attributed value', kind: 'money' },
    ],
    rows: [
      ...input.daily.map((d) => [d.day, d.entries, d.unique_sessions, d.attributed_orders, d.paid_orders, d.paid_value_paise]),
      ['Period total', summary.entries, summary.unique_sessions, summary.attributed_orders, summary.paid_orders, summary.paid_value_paise],
    ],
  };
}

export function adminQrDataset(input: { fromDate: string; toDate: string; storeLabel: string; rows: QrStoreRow[] }): Dataset {
  return {
    title: 'Platform QR analytics',
    subtitle: `${input.fromDate} to ${input.toDate}. Scope: ${input.storeLabel}. Recorded entries are tracked link openings, not verified physical scans.`,
    columns: [
      { header: 'Store', kind: 'text' },
      { header: 'Recorded entries', kind: 'int' },
      { header: 'Unique guest sessions (estimate)', kind: 'int' },
      { header: 'Attributed orders', kind: 'int' },
      { header: 'Paid attributed orders', kind: 'int' },
      { header: 'Paid attributed value', kind: 'money' },
      { header: 'Converted sessions', kind: 'int' },
      { header: 'Conversion estimate', kind: 'text' },
    ],
    rows: input.rows.map((r) => [
      r.store_name,
      r.entries,
      r.unique_sessions,
      r.attributed_orders,
      r.paid_orders,
      r.paid_value_paise,
      r.converted_sessions,
      conversionText(r.conversion_bps),
    ]),
  };
}
