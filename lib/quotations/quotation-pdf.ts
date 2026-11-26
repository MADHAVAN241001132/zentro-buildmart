/**
 * A4 quotation renderer (pdf-lib, standard Helvetica fonts). Same conventions as the invoice renderer:
 * printable ASCII only, amounts as "Rs. 1,234.56", Burgundy / Cream / Champagne Gold theme.
 * A quotation with no prices yet is refused: it must never be sent to a customer as a priced document.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { formatGstRate, formatPlainInr, formatQuantity } from '@/lib/invoices/invoice-math';
import { toPdfText, wrapText, type InvoiceLogo } from '@/lib/invoices/invoice-pdf';

export interface QuotationPdfLine {
  name: string;
  variantLabel: string;
  sku: string;
  hsnCode: string | null;
  quantity: number;
  unitPricePaise: number;
  discountPaise: number;
  gstRateBps: number;
  taxablePaise: number;
  taxPaise: number;
  lineTotalPaise: number;
}

export interface QuotationPdfData {
  storeName: string;
  storeAddress: string | null;
  storeGstin: string | null;
  storePhone: string | null;
  number: string;
  status: string;
  createdAt: string;
  validUntil: string | null;
  customerName: string;
  customerMobile: string | null;
  customerEmail: string | null;
  projectName: string | null;
  deliveryAddress: string | null;
  deliveryPaise: number;
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
  terms: string | null;
  lines: QuotationPdfLine[];
}

/** Used when the store has written no terms of its own. Kept short and neutral. */
export const DEFAULT_QUOTATION_TERMS = [
  'Prices are valid until the date shown. Stock is reserved only when the quotation is converted into an order.',
  'GST is shown at the rate applicable to each product. Final tax follows the place of supply on the invoice.',
  'Delivery timelines are indicative and confirmed at the time of order.',
];

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;
const RIGHT = A4_WIDTH - MARGIN;
const BURGUNDY = rgb(0x6a / 255, 0x0d / 255, 0x2a / 255);
const CREAM = rgb(0xff / 255, 0xf4 / 255, 0xe6 / 255);
const GOLD = rgb(0xc9 / 255, 0xa4 / 255, 0x5c / 255);
const INK = rgb(0.13, 0.11, 0.11);
const MUTED = rgb(0.42, 0.38, 0.38);
const LINE = rgb(0.85, 0.8, 0.72);

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
}

function text(page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color = INK, align: 'left' | 'right' = 'left') {
  const clean = toPdfText(value);
  const width = font.widthOfTextAtSize(clean, size);
  page.drawText(clean, { x: align === 'right' ? x - width : x, y, size, font, color });
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Not set';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function newPage(c: Cursor): void {
  c.page = c.doc.addPage([A4_WIDTH, A4_HEIGHT]);
  c.y = A4_HEIGHT - MARGIN;
}

function ensureSpace(c: Cursor, needed: number): void {
  if (c.y - needed < 70) newPage(c);
}

function drawHeader(c: Cursor, data: QuotationPdfData, logo: InvoiceLogo | null, image: PDFImage | null) {
  c.page.drawRectangle({ x: 0, y: A4_HEIGHT - 110, width: A4_WIDTH, height: 110, color: BURGUNDY });
  c.page.drawRectangle({ x: 0, y: A4_HEIGHT - 114, width: A4_WIDTH, height: 4, color: GOLD });
  let nameX = MARGIN;
  if (image && logo) {
    const height = 52;
    const width = (image.width / image.height) * height;
    c.page.drawImage(image, { x: MARGIN, y: A4_HEIGHT - 80 - height / 2 + 10, width: Math.min(width, 120), height });
    nameX = MARGIN + Math.min(width, 120) + 14;
  }
  text(c.page, data.storeName, nameX, A4_HEIGHT - 52, 18, c.bold, CREAM);
  let subY = A4_HEIGHT - 70;
  for (const line of [data.storeAddress, data.storePhone ? `Phone: ${data.storePhone}` : null, data.storeGstin ? `GSTIN: ${data.storeGstin}` : null]) {
    if (!line) continue;
    for (const part of wrapText(line, c.regular, 9, 300)) {
      text(c.page, part, nameX, subY, 9, c.regular, CREAM);
      subY -= 11;
    }
  }
  text(c.page, 'QUOTATION', RIGHT, A4_HEIGHT - 52, 20, c.bold, GOLD, 'right');
  text(c.page, data.number, RIGHT, A4_HEIGHT - 70, 11, c.bold, CREAM, 'right');
  text(c.page, `Date: ${formatDate(data.createdAt)}`, RIGHT, A4_HEIGHT - 84, 9, c.regular, CREAM, 'right');
  text(c.page, `Valid until: ${formatDate(data.validUntil)}`, RIGHT, A4_HEIGHT - 96, 9, c.regular, CREAM, 'right');
  c.y = A4_HEIGHT - 132;
}

function drawCustomer(c: Cursor, data: QuotationPdfData) {
  const rows: [string, string][] = [
    ['Customer', data.customerName],
    ['Mobile', data.customerMobile ?? ''],
    ['Email', data.customerEmail ?? ''],
    ['Project', data.projectName ?? ''],
    ['Delivery to', data.deliveryAddress ?? ''],
  ];
  text(c.page, 'PREPARED FOR', MARGIN, c.y, 9, c.bold, BURGUNDY);
  c.y -= 14;
  for (const [label, value] of rows) {
    if (!value) continue;
    for (const [index, part] of wrapText(value, c.regular, 10, 380).entries()) {
      text(c.page, index === 0 ? label : '', MARGIN, c.y, 9, c.regular, MUTED);
      text(c.page, part, MARGIN + 80, c.y, 10, c.regular);
      c.y -= 13;
    }
  }
  c.y -= 8;
}

const COLS = {
  item: { x: MARGIN, width: 205 },
  qty: { x: 250, right: 290 },
  rate: { x: 300, right: 368 },
  disc: { x: 372, right: 420 },
  taxable: { x: 425, right: 484 },
  gst: { x: 488, right: RIGHT },
};

function drawTableHeader(c: Cursor) {
  c.page.drawRectangle({ x: MARGIN, y: c.y - 6, width: RIGHT - MARGIN, height: 18, color: BURGUNDY });
  const y = c.y;
  text(c.page, 'Item', COLS.item.x + 6, y, 8, c.bold, CREAM);
  text(c.page, 'Qty', COLS.qty.right, y, 8, c.bold, CREAM, 'right');
  text(c.page, 'Unit price', COLS.rate.right, y, 8, c.bold, CREAM, 'right');
  text(c.page, 'Disc.', COLS.disc.right, y, 8, c.bold, CREAM, 'right');
  text(c.page, 'Taxable', COLS.taxable.right, y, 8, c.bold, CREAM, 'right');
  text(c.page, 'GST', COLS.gst.right - 4, y, 8, c.bold, CREAM, 'right');
  c.y -= 24;
}

function drawLines(c: Cursor, data: QuotationPdfData) {
  drawTableHeader(c);
  for (const line of data.lines) {
    const descriptionParts = [
      line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name,
      line.sku ? `SKU ${line.sku}` : '',
      line.hsnCode ? `HSN ${line.hsnCode}` : '',
    ].filter(Boolean).join(' · ');
    const wrapped = wrapText(descriptionParts, c.regular, 8.5, COLS.item.width - 6);
    const before = c.page;
    ensureSpace(c, Math.max(wrapped.length, 1) * 12 + 10);
    if (c.page !== before) drawTableHeader(c);
    wrapped.forEach((part, index) => text(c.page, part, COLS.item.x + 6, c.y - index * 11, 8.5, c.regular));
    const y = c.y;
    text(c.page, formatQuantity(line.quantity), COLS.qty.right, y, 8.5, c.regular, INK, 'right');
    text(c.page, formatPlainInr(line.unitPricePaise), COLS.rate.right, y, 8.5, c.regular, INK, 'right');
    text(c.page, formatPlainInr(line.discountPaise), COLS.disc.right, y, 8.5, c.regular, INK, 'right');
    text(c.page, formatPlainInr(line.taxablePaise), COLS.taxable.right, y, 8.5, c.regular, INK, 'right');
    text(c.page, formatGstRate(line.gstRateBps), COLS.gst.right - 4, y, 8.5, c.regular, INK, 'right');
    const height = Math.max(wrapped.length, 1) * 11 + 6;
    c.y -= height;
    c.page.drawLine({ start: { x: MARGIN, y: c.y + 2 }, end: { x: RIGHT, y: c.y + 2 }, thickness: 0.5, color: LINE });
  }
  c.y -= 10;
}

function drawSummary(c: Cursor, data: QuotationPdfData) {
  ensureSpace(c, 150);
  const rows: [string, string, boolean][] = [
    ['Subtotal', formatPlainInr(data.subtotalPaise), false],
    ['Discount', `-${formatPlainInr(data.discountPaise)}`, false],
    ['Taxable amount', formatPlainInr(data.taxablePaise), false],
    ['GST (as itemised)', formatPlainInr(data.taxPaise), false],
    ['Delivery', formatPlainInr(data.deliveryPaise), false],
    ['Grand total (Rs.)', formatPlainInr(data.totalPaise), true],
  ];
  const left = 360;
  for (const [label, value, strong] of rows) {
    if (strong) {
      c.page.drawRectangle({ x: left - 8, y: c.y - 6, width: RIGHT - left + 8, height: 20, color: CREAM, borderColor: GOLD, borderWidth: 0.8 });
    }
    text(c.page, label, left, c.y, strong ? 10 : 9, strong ? c.bold : c.regular, strong ? BURGUNDY : INK);
    text(c.page, `Rs. ${value}`, RIGHT, c.y, strong ? 10 : 9, strong ? c.bold : c.regular, strong ? BURGUNDY : INK, 'right');
    c.y -= strong ? 24 : 15;
  }
  c.y -= 8;
}

function drawTerms(c: Cursor, data: QuotationPdfData) {
  const terms = data.terms && data.terms.trim() ? data.terms.split(/\r?\n/).map((t) => t.trim()).filter(Boolean) : DEFAULT_QUOTATION_TERMS;
  ensureSpace(c, 40 + terms.length * 12);
  text(c.page, 'TERMS AND CONDITIONS', MARGIN, c.y, 9, c.bold, BURGUNDY);
  c.y -= 14;
  for (const term of terms) {
    for (const [index, part] of wrapText(term, c.regular, 8.5, RIGHT - MARGIN - 10).entries()) {
      text(c.page, index === 0 ? '-' : ' ', MARGIN, c.y, 8.5, c.regular, MUTED);
      text(c.page, part, MARGIN + 10, c.y, 8.5, c.regular, MUTED);
      c.y -= 11;
    }
  }
}

function drawFooters(doc: PDFDocument, regular: PDFFont) {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({ start: { x: MARGIN, y: 50 }, end: { x: RIGHT, y: 50 }, thickness: 0.5, color: GOLD });
    text(page, 'This quotation is an offer to supply, not a tax invoice. Prices are not binding until converted to an order.', MARGIN, 38, 7.5, regular, MUTED);
    text(page, `Page ${index + 1} of ${pages.length}`, RIGHT, 38, 7.5, regular, MUTED, 'right');
  });
}

/** Renders a priced quotation. Refuses an unpriced one, so no unpriced document can reach a customer. */
export async function renderQuotationPdf(data: QuotationPdfData, logo: InvoiceLogo | null): Promise<Uint8Array> {
  if (data.lines.length === 0 || data.totalPaise <= 0) {
    throw new Error('This quotation has no prices yet and cannot be printed.');
  }
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let image: PDFImage | null = null;
  if (logo) {
    try {
      image = logo.kind === 'png' ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
    } catch {
      image = null;
    }
  }
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const c: Cursor = { doc, page, y: 0, regular, bold };
  drawHeader(c, data, logo, image);
  drawCustomer(c, data);
  drawLines(c, data);
  drawSummary(c, data);
  drawTerms(c, data);
  drawFooters(doc, regular);
  return doc.save();
}
