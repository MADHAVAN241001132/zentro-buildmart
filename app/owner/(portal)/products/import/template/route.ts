import { NextResponse } from 'next/server';
import { attachment, CSV_TYPE, XLSX_TYPE } from '@/lib/exports/attachment';
import { buildWorkbookSheets } from '@/lib/exports/xlsx';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';
import { catalogueTemplateRows, priceTemplateRows, instructionRows, CATALOGUE_INSTRUCTIONS, PRICE_INSTRUCTIONS } from '@/lib/imports/templates';
import { csvCell } from '@/lib/reports/report-math';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Blank import templates with sample rows and instructions. The CSV carries the headers and sample rows;
 * the Excel workbook adds an Instructions sheet. Templates hold no store data, so any owner or manager may download one.
 */
export async function GET(request: Request) {
  try {
    await ownerPermissionForRoute('product_management');
  } catch (error) {
    return routeDeniedResponse(error);
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const format = url.searchParams.get('format') ?? 'csv';
  if (kind !== 'catalogue' && kind !== 'prices') return NextResponse.json({ error: 'Unknown template.' }, { status: 400 });
  if (format !== 'csv' && format !== 'xlsx') return NextResponse.json({ error: 'Unknown format.' }, { status: 400 });

  const rows = kind === 'catalogue' ? catalogueTemplateRows() : priceTemplateRows();
  const instructions = kind === 'catalogue' ? CATALOGUE_INSTRUCTIONS : PRICE_INSTRUCTIONS;
  const stem = kind === 'catalogue' ? 'zentro-product-import-template' : 'zentro-price-update-template';

  if (format === 'csv') {
    const body = rows.map((row) => row.map((cell) => csvCell(cell === null ? '' : String(cell))).join(',')).join('\r\n');
    return attachment(`${stem}.csv`, CSV_TYPE, `﻿${body}\r\n`);
  }
  const book = buildWorkbookSheets([
    { name: kind === 'catalogue' ? 'Products' : 'Prices', rows },
    { name: 'Instructions', rows: instructionRows(instructions) },
  ]);
  return attachment(`${stem}.xlsx`, XLSX_TYPE, new Uint8Array(book));
}
