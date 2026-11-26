/**
 * Minimal Excel (.xlsx) writer: one worksheet, inline strings, numbers, no styles. Written by hand because the
 * build sandbox cannot install a spreadsheet package. The output is a standard OOXML zip that Excel and
 * LibreOffice open. Text cells that begin with a formula character get an apostrophe prefix, so a value such
 * as =HYPERLINK(...) is shown as text and never evaluated.
 */
import { deflateRawSync } from 'node:zlib';

const FORMULA_START = /^[=+\-@\t\r]/;

export type Cell = string | number | boolean | null;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch] as string));
}

/** Column letters: 0 becomes A, 25 becomes Z, 26 becomes AA. */
export function columnLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellXml(ref: string, value: Cell): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

export function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row.map((value, c) => cellXml(`${columnLetters(c)}${r + 1}`, value)).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function workbookXml(sheetName: string): string {
  const safe = escapeXml(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safe}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry { name: string; data: Buffer }

/** Builds a zip archive (deflate) from named entries. Dates are fixed so output is reproducible. */
export function zipEntries(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = (2026 - 1980) << 9 | (11 << 5) | 26;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const chunk = Buffer.concat([local, name, compressed]);
    locals.push(chunk);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += chunk.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

/** Complete .xlsx file for one sheet. The first row is the header. */
export function buildWorkbook(sheetName: string, rows: Cell[][]): Buffer {
  const encoder = new TextEncoder();
  return zipEntries([
    { name: '[Content_Types].xml', data: Buffer.from(encoder.encode(CONTENT_TYPES)) },
    { name: '_rels/.rels', data: Buffer.from(encoder.encode(ROOT_RELS)) },
    { name: 'xl/workbook.xml', data: Buffer.from(encoder.encode(workbookXml(sheetName))) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(encoder.encode(WORKBOOK_RELS)) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(encoder.encode(sheetXml(rows))) },
  ]);
}

export interface SheetSpec {
  name: string;
  rows: Cell[][];
}

function sheetNameXml(names: string[]): string {
  return names
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
}

/**
 * Complete .xlsx file with one or more worksheets, in the order given. Each sheet's first row is its header.
 * Sheet names are cleaned to Excel's rules (no \ / ? * [ ] :, at most 31 characters, unique).
 */
export function buildWorkbookSheets(sheets: SheetSpec[]): Buffer {
  if (sheets.length === 0 || sheets.length > 10) throw new Error('A workbook needs between 1 and 10 sheets');
  const used = new Set<string>();
  const names = sheets.map((sheet, i) => {
    const base = sheet.name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base.slice(0, 28)} ${suffix}`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
  const encoder = new TextEncoder();
  const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
  const relationships = sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNameXml(names)}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
  const parts = [
    { name: '[Content_Types].xml', data: Buffer.from(encoder.encode(contentTypes)) },
    { name: '_rels/.rels', data: Buffer.from(encoder.encode(ROOT_RELS)) },
    { name: 'xl/workbook.xml', data: Buffer.from(encoder.encode(workbook)) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(encoder.encode(workbookRels)) },
  ];
  sheets.forEach((sheet, i) => {
    parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(encoder.encode(sheetXml(sheet.rows))) });
  });
  return zipEntries(parts);
}
