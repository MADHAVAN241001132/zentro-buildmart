import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_QR_SUMMARY,
  adminQrDataset,
  conversionText,
  netPaidPaise,
  ownerQrDataset,
  type QrDayRow,
  type QrStoreRow,
} from '../lib/qr/analytics';

const SESSION_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|guest_session|session_id/i;

const daily: QrDayRow[] = [
  { day: '2026-11-01', entries: 5, unique_sessions: 3, attributed_orders: 1, paid_orders: 1, paid_value_paise: 150000 },
  { day: '2026-11-02', entries: 2, unique_sessions: 2, attributed_orders: 0, paid_orders: 0, paid_value_paise: 0 },
] as QrDayRow[];

test('conversion estimate says not enough data when there is no basis, otherwise a percentage', () => {
  assert.equal(conversionText(null), 'Not enough data');
  assert.equal(conversionText(1250), '12.50%');
});

test('net paid value subtracts refunds and never goes negative', () => {
  assert.equal(netPaidPaise(150000, 20000), 130000);
  assert.equal(netPaidPaise(1000, 5000), 0);
});

test('empty summary reports zero for every count', () => {
  assert.equal(EMPTY_QR_SUMMARY.entries, 0);
  assert.equal(EMPTY_QR_SUMMARY.conversion_bps, null);
});

test('owner dataset totals match the summary and contain no session identifiers', () => {
  const summary = { ...EMPTY_QR_SUMMARY, entries: 7, unique_sessions: 5, attributed_orders: 1, paid_orders: 1, paid_value_paise: 150000 };
  const dataset = ownerQrDataset({ fromDate: '2026-11-01', toDate: '2026-11-02', summary, daily });
  const totalRow = dataset.rows[dataset.rows.length - 1];
  assert.equal(totalRow?.[0], 'Period total');
  assert.equal(totalRow?.[1], 7);
  assert.equal(totalRow?.[5], 150000);
  assert.equal(dataset.rows.length, daily.length + 1);
  const headers = dataset.columns.map((c) => c.header).join(' | ');
  assert.doesNotMatch(headers, SESSION_LIKE);
  assert.doesNotMatch(dataset.subtitle, SESSION_LIKE);
  assert.match(dataset.subtitle, /not verified physical scans/);
});

test('admin dataset has one row per store with conversion text and no session identifiers', () => {
  const rows: QrStoreRow[] = [
    { store_id: '11111111-1111-1111-1111-111111111111', store_name: 'Showroom A', entries: 4, unique_sessions: 3, attributed_orders: 1, paid_orders: 1, paid_value_paise: 90000, converted_sessions: 1, conversion_bps: 3333 },
  ];
  const dataset = adminQrDataset({ fromDate: '2026-11-01', toDate: '2026-11-30', storeLabel: 'all stores', rows });
  assert.equal(dataset.rows.length, 1);
  assert.equal(dataset.rows[0]?.[0], 'Showroom A');
  assert.equal(dataset.rows[0]?.[7], '33.33%');
  assert.doesNotMatch(dataset.columns.map((c) => c.header).join(' '), SESSION_LIKE);
  assert.doesNotMatch(JSON.stringify(dataset.rows), /guest_session|session_id/i);
});
