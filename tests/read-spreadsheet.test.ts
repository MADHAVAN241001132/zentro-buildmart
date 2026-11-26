import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSpreadsheet, SpreadsheetError, IMPORT_LIMITS } from '../lib/imports/read-spreadsheet';
import { buildWorkbook, buildWorkbookSheets } from '../lib/exports/xlsx';

const bytes = (text: string) => new TextEncoder().encode(text);

test('CSV: strips a UTF-8 byte order mark and reads the header and rows', () => {
  const result = readSpreadsheet('products.csv', bytes('﻿Product SKU,Product name\r\nTILE-1,Tile\r\n'));
  assert.equal(result.format, 'csv');
  assert.deepEqual(result.rows.map((r) => r.cells), [['Product SKU', 'Product name'], ['TILE-1', 'Tile']]);
  assert.deepEqual(result.rows.map((r) => r.rowNumber), [1, 2]);
});

test('CSV: keeps commas, doubled quotes and line breaks inside quoted cells', () => {
  const text = 'A,B\n"Tile, matt ""premium""","line one\nline two"\n';
  const result = readSpreadsheet('x.csv', bytes(text));
  assert.deepEqual(result.rows[1]!.cells, ['Tile, matt "premium"', 'line one\nline two']);
});

test('CSV: refuses bytes that are not valid UTF-8', () => {
  assert.throws(() => readSpreadsheet('x.csv', new Uint8Array([0x41, 0xff, 0xfe])), SpreadsheetError);
});

test('CSV: refuses a zip-format file that carries a .csv name', () => {
  const book = buildWorkbook('Products', [['A'], ['1']]);
  assert.throws(() => readSpreadsheet('sneaky.csv', new Uint8Array(book)), /\.xlsx/);
});

test('Refuses an empty file, an oversize file and an unsupported extension', () => {
  assert.throws(() => readSpreadsheet('x.csv', new Uint8Array()), /empty/);
  const big = new Uint8Array(IMPORT_LIMITS.maxFileBytes + 1);
  assert.throws(() => readSpreadsheet('x.csv', big), /larger/);
  assert.throws(() => readSpreadsheet('x.xls', bytes('A,B\n1,2\n')), /not supported/);
});

test('XLSX: round trips a single-sheet workbook with text and numbers', () => {
  const rows = [['Variant SKU', 'Selling price'], ['TILE-1-A', 150], ['TILE-1-B', 'a=1']];
  const result = readSpreadsheet('book.xlsx', new Uint8Array(buildWorkbook('Products', rows)));
  assert.equal(result.format, 'xlsx');
  assert.deepEqual(result.rows.map((r) => r.cells), [['Variant SKU', 'Selling price'], ['TILE-1-A', '150'], ['TILE-1-B', 'a=1']]);
});

test('XLSX: reads the first sheet of a multi-sheet workbook', () => {
  const book = buildWorkbookSheets([
    { name: 'Products', rows: [['Product SKU'], ['TILE-1']] },
    { name: 'Instructions', rows: [['Do not edit this sheet.']] },
  ]);
  const result = readSpreadsheet('template.xlsx', new Uint8Array(book));
  assert.deepEqual(result.rows.map((r) => r.cells), [['Product SKU'], ['TILE-1']]);
});

test('XLSX: refuses a file named .xlsx whose bytes are not a zip workbook', () => {
  assert.throws(() => readSpreadsheet('fake.xlsx', bytes('Product SKU,Name\n')), SpreadsheetError);
});
