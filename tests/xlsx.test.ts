import { strict as assert } from 'node:assert';
import { inflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { buildWorkbook, columnLetters, crc32, sheetXml } from '../lib/exports/xlsx';

test('column letters roll over correctly', () => {
  assert.equal(columnLetters(0), 'A');
  assert.equal(columnLetters(25), 'Z');
  assert.equal(columnLetters(26), 'AA');
  assert.equal(columnLetters(701), 'ZZ');
  assert.equal(columnLetters(702), 'AAA');
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('formula-like text is prefixed and XML is escaped', () => {
  const xml = sheetXml([['=HYPERLINK("x")', 'a & <b>', 12.5, null]]);
  assert.ok(xml.includes("<t xml:space=\"preserve\">&apos;=HYPERLINK(&quot;x&quot;)</t>"));
  assert.ok(xml.includes('a &amp; &lt;b&gt;'));
  assert.ok(xml.includes('<v>12.5</v>'));
  assert.ok(!xml.includes('r="D1"'));
});

test('workbook is a zip whose parts inflate to well-formed XML', () => {
  const book = buildWorkbook('Orders', [['Order', 'Total'], ['ZB-1', 1234.5]]);
  assert.equal(book.readUInt32LE(0), 0x04034b50);
  // Walk local headers and inflate each part.
  const parts: Record<string, string> = {};
  let pos = 0;
  while (book.readUInt32LE(pos) === 0x04034b50) {
    const size = book.readUInt32LE(pos + 18);
    const nameLen = book.readUInt16LE(pos + 26);
    const extraLen = book.readUInt16LE(pos + 28);
    const name = book.toString('utf8', pos + 30, pos + 30 + nameLen);
    const dataStart = pos + 30 + nameLen + extraLen;
    parts[name] = inflateRawSync(book.subarray(dataStart, dataStart + size)).toString('utf8');
    pos = dataStart + size;
  }
  assert.deepEqual(Object.keys(parts).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  assert.ok(parts['xl/worksheets/sheet1.xml']!.includes('<t xml:space="preserve">Order</t>'));
  assert.ok(parts['xl/worksheets/sheet1.xml']!.includes('<v>1234.5</v>'));
  assert.equal(book.readUInt32LE(book.length - 22), 0x06054b50);
});
