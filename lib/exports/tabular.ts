/**
 * One shape for every report export. A dataset is column definitions plus rows of raw values.
 * Money values are integer paise; each format converts them: CSV and PDF as rupee text, Excel as rupee numbers.
 */

export type ColumnKind = 'text' | 'int' | 'money' | 'date';

export interface Column {
  header: string;
  kind: ColumnKind;
}

export interface Dataset {
  title: string;
  /** Short subtitle, such as the period and filters. */
  subtitle: string;
  columns: Column[];
  rows: (string | number | boolean | null)[][];
}

import { csvCell, paiseToRupeeText } from '@/lib/reports/report-math';

/** Cell value as display text (CSV and PDF). */
export function displayValue(value: string | number | boolean | null, kind: ColumnKind): string {
  if (value === null || value === undefined || value === '') return '';
  if (kind === 'money') return paiseToRupeeText(Number(value));
  return String(value);
}

/** Cell value as a number for spreadsheets: money becomes rupees with two decimals. */
export function spreadsheetValue(value: string | number | boolean | null, kind: ColumnKind): string | number | boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (kind === 'money') return Math.round(Number(value)) / 100;
  if (kind === 'int') return Number(value);
  return value;
}

export function datasetToCsv(dataset: Dataset): string {
  const lines = [dataset.columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of dataset.rows) {
    lines.push(dataset.columns.map((c, i) => csvCell(displayValue(row[i] ?? null, c.kind))).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function fileStem(dataset: Dataset): string {
  return dataset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
}
