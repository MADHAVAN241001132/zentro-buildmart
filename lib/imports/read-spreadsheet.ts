/**
 * Reads uploaded CSV and Excel (.xlsx) files into rows of text. Nothing is evaluated: formulas are never run,
 * only cached values are read. Every limit is checked before data is trusted, so a hostile file fails with a
 * clear message instead of exhausting memory.
 */
import { inflateRawSync } from 'node:zlib';

export const IMPORT_LIMITS = {
  /** Largest uploaded file. */
  maxFileBytes: 2 * 1024 * 1024,
  /** Largest data rows read from one file (the header is not counted). */
  maxRows: 1000,
  maxColumns: 40,
  /** Largest total size of the decompressed workbook parts. */
  maxUncompressedBytes: 8 * 1024 * 1024,
  maxZipEntries: 64,
  /** Largest allowed ratio of decompressed to compressed size for one part (zip bomb guard). */
  maxCompressionRatio: 100,
} as const;

export class SpreadsheetError extends Error {}

export interface SheetRow {
  /** 1-based row number in the file, as the owner sees it in Excel or a text editor. */
  rowNumber: number;
  cells: string[];
}

export interface ReadResult {
  format: 'csv' | 'xlsx';
  rows: SheetRow[];
}

/** Reads one uploaded file. The format is decided by the bytes, not by the file name alone. */
export function readSpreadsheet(fileName: string, bytes: Uint8Array): ReadResult {
  if (bytes.byteLength === 0) throw new SpreadsheetError('The file is empty.');
  if (bytes.byteLength > IMPORT_LIMITS.maxFileBytes) {
    throw new SpreadsheetError(`The file is larger than ${IMPORT_LIMITS.maxFileBytes / (1024 * 1024)} MB. Split it into smaller files.`);
  }
  const lower = fileName.toLowerCase();
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const looksLikeZip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (lower.endsWith('.xlsx')) {
    if (!looksLikeZip) throw new SpreadsheetError('This file is not a valid .xlsx workbook. Save it from Excel as .xlsx or export it as CSV.');
    return { format: 'xlsx', rows: readXlsx(buffer) };
  }
  if (lower.endsWith('.csv')) {
    if (looksLikeZip) throw new SpreadsheetError('This file looks like an Excel workbook but has a .csv name. Rename it to .xlsx.');
    return { format: 'csv', rows: readCsv(buffer) };
  }
  throw new SpreadsheetError('Upload a .xlsx or .csv file. Older .xls files are not supported.');
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180): commas, double-quoted fields with doubled quotes, CRLF or LF, quoted line breaks.
// ---------------------------------------------------------------------------

export function readCsv(buffer: Buffer): SheetRow[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new SpreadsheetError('The CSV file must be saved as UTF-8.');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000')) throw new SpreadsheetError('The file contains unsupported control characters.');

  const rows: SheetRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const pushRow = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== '')) rows.push({ rowNumber: rowStart, cells });
    cells = [];
    cell = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
      line += 1;
      rowStart = line;
    } else {
      cell += ch;
    }
    if (cells.length > IMPORT_LIMITS.maxColumns) {
      throw new SpreadsheetError(`The file has more than ${IMPORT_LIMITS.maxColumns} columns.`);
    }
  }
  if (quoted) throw new SpreadsheetError(`A quoted value starting on line ${rowStart} is never closed.`);
  if (cell !== '' || cells.length > 0) pushRow();

  if (rows.length - 1 > IMPORT_LIMITS.maxRows) {
    throw new SpreadsheetError(`The file has more than ${IMPORT_LIMITS.maxRows} data rows. Import it in parts.`);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// XLSX: read the zip central directory, inflate only the parts needed, then read the first worksheet.
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function readZipDirectory(buf: Buffer): ZipEntry[] {
  const earliest = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= earliest; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError('The workbook is damaged: no directory found.');
  const count = buf.readUInt16LE(eocd + 10);
  const directoryOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new SpreadsheetError('This workbook uses an unsupported zip format.');
  if (count > IMPORT_LIMITS.maxZipEntries) throw new SpreadsheetError('The workbook contains too many internal parts.');

  const entries: ZipEntry[] = [];
  let p = directoryOffset;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new SpreadsheetError('The workbook is damaged: the directory is incomplete.');
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    entries.push({
      name,
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      uncompressedSize: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipPart(buf: Buffer, entry: ZipEntry, budget: { remaining: number }): Buffer {
  if (entry.flags & 0x0001) throw new SpreadsheetError('Password-protected workbooks cannot be imported. Remove the password and try again.');
  if (entry.uncompressedSize > IMPORT_LIMITS.maxUncompressedBytes) throw new SpreadsheetError('The workbook expands to more than the allowed size.');
  if (entry.uncompressedSize > 0 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > IMPORT_LIMITS.maxCompressionRatio) {
    throw new SpreadsheetError('The workbook is compressed in an unusual way and was refused.');
  }
  budget.remaining -= entry.uncompressedSize;
  if (budget.remaining < 0) throw new SpreadsheetError('The workbook expands to more than the allowed size.');

  const local = entry.localOffset;
  if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new SpreadsheetError('The workbook is damaged: a part is missing.');
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  if (data.length !== entry.compressedSize) throw new SpreadsheetError('The workbook is damaged: a part is truncated.');

  let out: Buffer;
  if (entry.method === 0) {
    out = Buffer.from(data);
  } else if (entry.method === 8) {
    try {
      out = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.uncompressedSize) });
    } catch {
      throw new SpreadsheetError('The workbook is damaged: a part cannot be decompressed.');
    }
  } else {
    throw new SpreadsheetError('The workbook uses a compression method this import does not support.');
  }
  if (out.length > entry.uncompressedSize) throw new SpreadsheetError('The workbook is damaged: a part is larger than declared.');
  return out;
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

function textOf(fragment: string): string {
  const parts = [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1] ?? ''));
  return parts.join('');
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(buf: Buffer): SheetRow[] {
  const entries = readZipDirectory(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const budget = { remaining: IMPORT_LIMITS.maxUncompressedBytes };
  const part = (name: string): string | null => {
    const entry = byName.get(name);
    return entry ? readZipPart(buf, entry, budget).toString('utf8') : null;
  };

  const workbook = part('xl/workbook.xml');
  const relsXml = part('xl/_rels/workbook.xml.rels');
  if (!workbook || !relsXml) throw new SpreadsheetError('The workbook is damaged: it has no worksheet index.');
  const sheetTag = /<sheet\b[^>]*\/?>/.exec(workbook)?.[0];
  const rId = sheetTag ? /\br:id="([^"]+)"/.exec(sheetTag)?.[1] : undefined;
  if (!rId) throw new SpreadsheetError('The workbook has no worksheets.');
  let target: string | undefined;
  for (const tag of relsXml.match(/<Relationship\b[^>]*\/?>/g) ?? []) {
    if (/\bId="([^"]+)"/.exec(tag)?.[1] === rId) target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
  }
  if (!target) throw new SpreadsheetError('The workbook is damaged: the first worksheet cannot be found.');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const sheetXml = part(sheetPath);
  if (!sheetXml) throw new SpreadsheetError('The workbook is damaged: the first worksheet is missing.');

  const sharedXml = part('xl/sharedStrings.xml');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? '')) : [];

  const rows: SheetRow[] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1] ?? '')?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    let hasValue = false;
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? '';
      const ref = /\br="([A-Z]+)\d+"/i.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const body = cellMatch[2] ?? '';
      const column = ref ? columnIndex(ref) : cells.length;
      if (column >= IMPORT_LIMITS.maxColumns) throw new SpreadsheetError(`The worksheet has more than ${IMPORT_LIMITS.maxColumns} columns.`);
      let value = '';
      if (type === 's') {
        value = shared[Number(/<v>([^<]*)<\/v>/.exec(body)?.[1] ?? '')] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(body);
      } else if (type === 'str' || type === 'n') {
        value = xmlUnescape(/<v>([^<]*)<\/v>/.exec(body)?.[1] ?? '');
      } else if (type === 'b') {
        value = /<v>1<\/v>/.test(body) ? 'TRUE' : 'FALSE';
      }
      while (cells.length < column) cells.push('');
      cells[column] = value;
      if (value.trim() !== '') hasValue = true;
    }
    if (hasValue) {
      if (rowNumber > 0) rows.push({ rowNumber, cells });
    }
    if (rows.length > IMPORT_LIMITS.maxRows + 1) {
      throw new SpreadsheetError(`The worksheet has more than ${IMPORT_LIMITS.maxRows} data rows. Import it in parts.`);
    }
  }
  return rows.map((row) => ({ rowNumber: row.rowNumber, cells: row.cells.map((c) => c ?? '') }));
}
