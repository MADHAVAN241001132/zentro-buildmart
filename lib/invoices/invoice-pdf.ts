/**
 * A4 tax invoice renderer (pdf-lib, standard Helvetica fonts).
 * Standard fonts only encode WinAnsi and have no rupee glyph, so every string is reduced to printable ASCII
 * and amounts are printed as "Rs. 1,234.56". Colours follow the approved theme: Burgundy, Cream, Champagne Gold.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { formatGstRate, formatPlainInr, formatQuantity, gstBreakdownByRate } from '@/lib/invoices/invoice-math';
import type { InvoiceData } from '@/lib/invoices/invoice-data';

export interface InvoiceLogo {
  bytes: Uint8Array;
  kind: 'png' | 'jpg';
}

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

/** Keeps only printable ASCII so the standard fonts can encode it. */
export function toPdfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '?');
}

/** Greedy word wrap. Words longer than the width are cut at character level. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = toPdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const pushWord = (word: string) => {
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    const candidate = current ? `${current} ${rest}` : rest;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = rest;
    } else {
      current = candidate;
    }
  };
  for (const word of words) pushWord(word);
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function formatDateOnly(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}-${month}-${year}` : isoDate;
}

function formatTimestamp(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')} IST`;
}

const CHANNEL_LABEL: Record<InvoiceData['channel'], string> = { online: 'Online store', pos: 'Point of sale' };
const PAYMENT_LABEL: Record<InvoiceData['paymentMethod'], string> = { online: 'Online payment', cash: 'Cash', credit: 'Store credit' };
const STATUS_LABEL: Record<string, string> = {
  PAID: 'Paid',
  PARTIALLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
  PENDING: 'Pending',
  CASH_PENDING: 'Cash pending',
  PROCESSING: 'Processing',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

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

function drawHeader(c: Cursor, data: InvoiceData, logo: InvoiceLogo | null, image: PDFImage | null) {
  const { page, regular, bold } = c;
  page.drawRectangle({ x: 0, y: A4_HEIGHT - 120, width: A4_WIDTH, height: 120, color: BURGUNDY });
  page.drawRectangle({ x: 0, y: A4_HEIGHT - 124, width: A4_WIDTH, height: 4, color: GOLD });

  let nameX = MARGIN;
  if (logo && image) {
    const dims = image.scaleToFit(56, 56);
    page.drawImage(image, { x: MARGIN, y: A4_HEIGHT - 30 - dims.height, width: dims.width, height: dims.height });
    nameX = MARGIN + 70;
  }
  text(page, data.store.name, nameX, A4_HEIGHT - 42, 18, bold, CREAM);
  let y = A4_HEIGHT - 58;
  for (const line of data.store.addressLines) {
    text(page, line, nameX, y, 9, regular, CREAM);
    y -= 12;
  }
  text(page, `GSTIN: ${data.store.gstin ?? 'Not set in store settings'}`, nameX, y, 9, regular, CREAM);
  y -= 12;
  const contact = [data.store.phone, data.store.email].filter(Boolean).join('  |  ');
  if (contact) text(page, contact, nameX, y, 9, regular, CREAM);

  text(page, 'TAX INVOICE', RIGHT, A4_HEIGHT - 42, 16, bold, GOLD, 'right');
  text(page, `Invoice No: ${data.invoiceNumber}`, RIGHT, A4_HEIGHT - 60, 9.5, bold, CREAM, 'right');
  text(page, `Invoice date: ${formatDateOnly(data.invoiceDate)}`, RIGHT, A4_HEIGHT - 74, 9, regular, CREAM, 'right');
  text(page, `Order: ${data.orderNumber}`, RIGHT, A4_HEIGHT - 88, 9, regular, CREAM, 'right');
}

function drawInfoBlock(c: Cursor, data: InvoiceData) {
  const { page, regular, bold } = c;
  const top = A4_HEIGHT - 150;
  const leftX = MARGIN;
  const rightX = 310;

  text(page, 'BILL TO', leftX, top, 8, bold, BURGUNDY);
  let y = top - 14;
  text(page, data.customer.name, leftX, y, 10.5, bold);
  y -= 13;
  if (data.customer.mobile) { text(page, `Mobile: ${data.customer.mobile}`, leftX, y, 9, regular); y -= 12; }
  if (data.customer.email) { text(page, `Email: ${data.customer.email}`, leftX, y, 9, regular); y -= 12; }
  if (data.fulfilment === 'delivery' && data.deliveryAddress) {
    for (const line of wrapText(`Deliver to: ${data.deliveryAddress}`, regular, 9, 240)) {
      text(page, line, leftX, y, 9, regular);
      y -= 12;
    }
  }

  const rows: [string, string][] = [
    ['Order date', formatTimestamp(data.orderDate)],
    ['Channel', CHANNEL_LABEL[data.channel]],
    ['Payment', `${PAYMENT_LABEL[data.paymentMethod]}${data.paymentProvider === 'razorpay' ? ' (Razorpay)' : ''}`],
    ['Payment status', STATUS_LABEL[data.paymentStatus] ?? data.paymentStatus.replace(/_/g, ' ').toLowerCase()],
  ];
  if (data.couponCode) rows.push(['Coupon', data.couponCode]);
  let ry = top - 14;
  for (const [label, value] of rows) {
    text(page, label, rightX, ry, 9, regular, MUTED);
    text(page, value, RIGHT, ry, 9, bold, INK, 'right');
    ry -= 13;
  }
  c.y = Math.min(y, ry) - 14;
}

const COLUMNS = {
  no: MARGIN,
  desc: 62,
  descRight: 292,
  qty: 330,
  unit: 384,
  disc: 430,
  taxable: 478,
  rate: 506,
  gst: 532,
  amount: RIGHT,
};

function drawTableHeader(c: Cursor) {
  const { page, bold } = c;
  page.drawRectangle({ x: MARGIN, y: c.y - 6, width: RIGHT - MARGIN, height: 20, color: CREAM });
  const y = c.y + 1;
  text(page, '#', COLUMNS.no + 4, y, 8, bold, BURGUNDY);
  text(page, 'Description', COLUMNS.desc, y, 8, bold, BURGUNDY);
  text(page, 'Qty', COLUMNS.qty, y, 8, bold, BURGUNDY, 'right');
  text(page, 'Unit price', COLUMNS.unit, y, 8, bold, BURGUNDY, 'right');
  text(page, 'Discount', COLUMNS.disc, y, 8, bold, BURGUNDY, 'right');
  text(page, 'Taxable', COLUMNS.taxable, y, 8, bold, BURGUNDY, 'right');
  text(page, 'GST %', COLUMNS.rate, y, 8, bold, BURGUNDY, 'right');
  text(page, 'GST', COLUMNS.gst, y, 8, bold, BURGUNDY, 'right');
  text(page, 'Amount', COLUMNS.amount, y, 8, bold, BURGUNDY, 'right');
  c.y -= 24;
}

function newPage(c: Cursor): void {
  c.page = c.doc.addPage([A4_WIDTH, A4_HEIGHT]);
  c.y = A4_HEIGHT - MARGIN - 10;
}

function drawLines(c: Cursor, data: InvoiceData) {
  const { regular, bold } = c;
  drawTableHeader(c);
  data.lines.forEach((line, index) => {
    const nameLines = wrapText(line.name, bold, 9, COLUMNS.descRight - COLUMNS.desc);
    const detailParts = [line.variantLabel, `SKU ${line.sku}`, line.hsnCode ? `HSN ${line.hsnCode}` : null].filter(Boolean) as string[];
    const detailLines = wrapText(detailParts.join(' | '), regular, 7.5, COLUMNS.descRight - COLUMNS.desc);
    const height = nameLines.length * 11 + detailLines.length * 9.5 + 10;

    if (c.y - height < 150) {
      newPage(c);
      drawTableHeader(c);
    }

    let y = c.y;
    text(c.page, String(index + 1), COLUMNS.no + 4, y, 8.5, regular, MUTED);
    for (const nameLine of nameLines) { text(c.page, nameLine, COLUMNS.desc, y, 9, bold); y -= 11; }
    for (const detail of detailLines) { text(c.page, detail, COLUMNS.desc, y, 7.5, regular, MUTED); y -= 9.5; }

    const top = c.y;
    text(c.page, formatQuantity(line.quantity), COLUMNS.qty, top, 8.5, regular, INK, 'right');
    text(c.page, formatPlainInr(line.unitPricePaise), COLUMNS.unit, top, 8.5, regular, INK, 'right');
    text(c.page, formatPlainInr(line.discountPaise), COLUMNS.disc, top, 8.5, regular, INK, 'right');
    text(c.page, formatPlainInr(line.taxablePaise), COLUMNS.taxable, top, 8.5, regular, INK, 'right');
    text(c.page, formatGstRate(line.gstRateBps), COLUMNS.rate, top, 8.5, regular, INK, 'right');
    text(c.page, formatPlainInr(line.taxPaise), COLUMNS.gst, top, 8.5, regular, INK, 'right');
    text(c.page, formatPlainInr(line.lineTotalPaise), COLUMNS.amount, top, 8.5, bold, INK, 'right');

    c.y -= height;
    c.page.drawLine({ start: { x: MARGIN, y: c.y + 4 }, end: { x: RIGHT, y: c.y + 4 }, thickness: 0.5, color: LINE });
  });
  c.y -= 10;
}

function drawSummary(c: Cursor, data: InvoiceData) {
  if (c.y < 260) newPage(c);
  const { page, regular, bold } = c;

  // GST breakdown on the left.
  const top = c.y;
  text(page, 'GST breakdown', MARGIN, top, 8, bold, BURGUNDY);
  const cols = { rate: MARGIN + 4, taxable: 150, cgst: 220, sgst: 275, total: RIGHT };
  let y = top - 14;
  page.drawRectangle({ x: MARGIN, y: y - 5, width: 275, height: 16, color: CREAM });
  text(page, 'Rate', cols.rate, y, 7.5, bold, BURGUNDY);
  text(page, 'Taxable', cols.taxable, y, 7.5, bold, BURGUNDY, 'right');
  text(page, 'CGST', cols.cgst, y, 7.5, bold, BURGUNDY, 'right');
  text(page, 'SGST', cols.sgst, y, 7.5, bold, BURGUNDY, 'right');
  text(page, 'Total GST', cols.total - 6, y, 7.5, bold, BURGUNDY, 'right');
  y -= 16;
  for (const row of gstBreakdownByRate(data.lines)) {
    text(page, formatGstRate(row.rateBps), cols.rate, y, 8, regular);
    text(page, formatPlainInr(row.taxablePaise), cols.taxable, y, 8, regular, INK, 'right');
    text(page, formatPlainInr(row.cgstPaise), cols.cgst, y, 8, regular, INK, 'right');
    text(page, formatPlainInr(row.sgstPaise), cols.sgst, y, 8, regular, INK, 'right');
    text(page, formatPlainInr(row.taxPaise), cols.total - 6, y, 8, regular, INK, 'right');
    y -= 13;
  }
  const note = 'CGST and SGST are shown as a split of the GST charged. This assumes a supply within the store\'s state. Inter-state (IGST) supplies are not shown separately.';
  for (const line of wrapText(note, regular, 6.5, 275)) {
    text(page, line, MARGIN, y, 6.5, regular, MUTED);
    y -= 8.5;
  }

  // Totals on the right.
  const t = data.totals;
  const totalRows: [string, number, 'normal' | 'discount' | 'payable'][] = [
    ['Subtotal', t.subtotalPaise, 'normal'],
    ['Discount', -t.discountPaise, 'discount'],
    ['Taxable amount', t.taxablePaise, 'normal'],
    ['GST', t.taxPaise, 'normal'],
  ];
  if (t.deliveryPaise > 0) totalRows.push(['Delivery', t.deliveryPaise, 'normal']);
  let ty = top;
  const boxX = 330;
  for (const [label, value, kind] of totalRows) {
    const shown = kind === 'discount' ? `-${formatPlainInr(Math.abs(value))}` : formatPlainInr(value);
    text(page, label, boxX, ty, 9, regular, MUTED);
    text(page, shown, RIGHT, ty, 9, regular, INK, 'right');
    ty -= 15;
  }
  page.drawRectangle({ x: boxX - 8, y: ty - 8, width: RIGHT - boxX + 16, height: 26, color: BURGUNDY });
  text(page, 'Payable total', boxX, ty + 1, 10.5, bold, CREAM);
  text(page, `Rs. ${formatPlainInr(t.totalPaise)}`, RIGHT, ty + 1, 10.5, bold, GOLD, 'right');
  ty -= 30;
  if (data.refundedPaise > 0) {
    text(page, 'Refunded to date', boxX, ty, 9, regular, MUTED);
    text(page, formatPlainInr(data.refundedPaise), RIGHT, ty, 9, regular, INK, 'right');
    ty -= 15;
    text(page, 'Net after refunds', boxX, ty, 9, bold);
    text(page, formatPlainInr(t.totalPaise - data.refundedPaise), RIGHT, ty, 9, bold, INK, 'right');
    ty -= 15;
  }
  c.y = Math.min(y, ty) - 18;
}

function drawFooters(doc: PDFDocument, regular: PDFFont) {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: RIGHT, y: 44 }, thickness: 0.6, color: GOLD });
    text(page, 'This is a computer-generated tax invoice. Refunds follow the store\'s refund policy.', MARGIN, 32, 7.5, regular, MUTED);
    text(page, `Page ${index + 1} of ${pages.length}`, RIGHT, 32, 7.5, regular, MUTED, 'right');
  });
}

/** Renders one A4 tax invoice. The caller must have loaded and reconciled the data (loadInvoiceForOrder). */
export async function renderInvoicePdf(data: InvoiceData, logo: InvoiceLogo | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tax invoice ${data.invoiceNumber}`);
  doc.setAuthor(data.store.name);
  doc.setSubject(`Order ${data.orderNumber}`);
  doc.setProducer('ZENTRO BuildMart');
  doc.setCreator('ZENTRO BuildMart');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const image = logo ? (logo.kind === 'png' ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes)) : null;

  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const c: Cursor = { doc, page, y: A4_HEIGHT - 150, regular, bold };
  drawHeader(c, data, logo, image);
  drawInfoBlock(c, data);
  drawLines(c, data);
  drawSummary(c, data);
  drawFooters(doc, regular);
  return doc.save();
}
