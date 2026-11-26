/**
 * Server-generated PDF for any tabular report (pdf-lib, standard Helvetica). Printable A4 landscape, with the
 * store-neutral Burgundy, Cream and Champagne Gold theme. Text is reduced to printable ASCII, as in the invoice
 * renderer, and cells are truncated with an ellipsis so long names cannot overflow their column.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { toPdfText } from '@/lib/invoices/invoice-pdf';
import { displayValue, type Dataset } from '@/lib/exports/tabular';

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 36;
const BURGUNDY = rgb(0x6a / 255, 0x0d / 255, 0x2a / 255);
const CREAM = rgb(0xff / 255, 0xf4 / 255, 0xe6 / 255);
const GOLD = rgb(0xc9 / 255, 0xa4 / 255, 0x5c / 255);
const INK = rgb(0.13, 0.11, 0.11);
const LINE = rgb(0.85, 0.8, 0.72);

function fit(text: string, font: PDFFont, size: number, width: number): string {
  const clean = toPdfText(text);
  if (font.widthOfTextAtSize(clean, size) <= width) return clean;
  let cut = clean.length;
  while (cut > 1 && font.widthOfTextAtSize(`${clean.slice(0, cut)}...`, size) > width) cut -= 1;
  return `${clean.slice(0, cut)}...`;
}

export async function renderReportPdf(dataset: Dataset, storeName: string, generatedAt: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const usable = PAGE_W - MARGIN * 2;
  const weights = dataset.columns.map((c) => (c.kind === 'text' ? 2.2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (usable * w) / total);
  const rowHeight = 14;
  const footerY = 22;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  let pageNo = 1;

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: PAGE_H - 62, width: PAGE_W, height: 62, color: BURGUNDY });
    page.drawText(toPdfText(storeName), { x: MARGIN, y: PAGE_H - 26, size: 10, font: regular, color: CREAM });
    page.drawText(toPdfText(dataset.title), { x: MARGIN, y: PAGE_H - 46, size: 16, font: bold, color: CREAM });
    page.drawText(toPdfText(dataset.subtitle), { x: MARGIN + 260, y: PAGE_H - 46, size: 9, font: regular, color: GOLD });
    y = PAGE_H - 62 - 22;
  };
  const drawTableHead = () => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: usable, height: rowHeight + 2, color: CREAM });
    let x = MARGIN;
    dataset.columns.forEach((col, i) => {
      const w = widths[i]!;
      const label = fit(col.header, bold, 8, w - 6);
      const tx = col.kind === 'money' || col.kind === 'int' ? x + w - 4 - bold.widthOfTextAtSize(label, 8) : x + 3;
      page.drawText(label, { x: tx, y, size: 8, font: bold, color: BURGUNDY });
      x += w;
    });
    y -= rowHeight + 4;
  };
  const drawFooter = () => {
    page.drawLine({ start: { x: MARGIN, y: footerY + 8 }, end: { x: PAGE_W - MARGIN, y: footerY + 8 }, thickness: 0.5, color: GOLD });
    page.drawText(toPdfText(`Generated ${generatedAt} (India time). Figures are from stored records for the period shown.`), { x: MARGIN, y: footerY, size: 7, font: regular, color: INK });
    page.drawText(`Page ${pageNo}`, { x: PAGE_W - MARGIN - 40, y: footerY, size: 7, font: regular, color: INK });
  };

  drawHeader();
  drawTableHead();
  if (dataset.rows.length === 0) {
    page.drawText('No records for this period.', { x: MARGIN, y, size: 10, font: regular, color: INK });
  }
  for (const row of dataset.rows) {
    if (y < footerY + 24) {
      drawFooter();
      page = doc.addPage([PAGE_W, PAGE_H]);
      pageNo += 1;
      y = PAGE_H - MARGIN;
      drawTableHead();
    }
    let x = MARGIN;
    dataset.columns.forEach((col, i) => {
      const w = widths[i]!;
      const value = fit(displayValue(row[i] ?? null, col.kind), regular, 8, w - 6);
      const tx = col.kind === 'money' || col.kind === 'int' ? x + w - 4 - regular.widthOfTextAtSize(value, 8) : x + 3;
      page.drawText(value, { x: tx, y, size: 8, font: regular, color: INK });
      x += w;
    });
    page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: PAGE_W - MARGIN, y: y - 4 }, thickness: 0.4, color: LINE });
    y -= rowHeight;
  }
  drawFooter();
  return doc.save();
}
