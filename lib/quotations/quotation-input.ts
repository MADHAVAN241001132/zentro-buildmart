/**
 * Pure input rules for quotations. No I/O, so they are unit tested without a database.
 * The database enforces the same limits; these checks give the person an error before a round trip.
 */
import { parseRupeesToPaise } from '@/lib/money';

export const MAX_QUOTE_LINES = 200;
export const MAX_GUEST_REQUEST_LINES = 50;
export const MAX_QUOTE_QUANTITY = 99999;

export interface ParsedLine {
  sku: string;
  quantity: number;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Reads lines such as "AMB-V001 4" or "AMB-V001, 2.5" (one per line). Blank lines are ignored.
 * Quantities allow up to three decimals, matching the database.
 */
export function parseLineText(text: string, maxLines = MAX_QUOTE_LINES): ParseResult<ParsedLine[]> {
  const rows = text.split(/\r?\n/).map((row) => row.trim()).filter((row) => row !== '');
  if (rows.length === 0) return { ok: false, error: 'Add at least one product, as "SKU quantity" on each line.' };
  if (rows.length > maxLines) return { ok: false, error: `A quotation can have at most ${maxLines} lines.` };

  const lines: ParsedLine[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const match = /^([A-Za-z0-9][A-Za-z0-9-]{1,39})[\s,]+(\d{1,5}(?:\.\d{1,3})?)$/.exec(rows[index]!);
    if (!match) {
      return { ok: false, error: `Line ${index + 1} must be a SKU followed by a quantity, for example AMB-V001 4.` };
    }
    const sku = match[1]!.toUpperCase();
    const quantity = Number(match[2]);
    if (!(quantity > 0) || quantity > MAX_QUOTE_QUANTITY) {
      return { ok: false, error: `Line ${index + 1}: the quantity must be above 0 and up to ${MAX_QUOTE_QUANTITY}.` };
    }
    if (seen.has(sku)) return { ok: false, error: `${sku} appears twice. Combine the quantities on one line.` };
    seen.add(sku);
    lines.push({ sku, quantity });
  }
  return { ok: true, value: lines };
}

/** Indian mobile: 10 digits, with spaces and a +91 or 0 prefix removed. */
export function normaliseMobile(raw: string): string | null {
  let digits = raw.replace(/[\s-]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return /^[0-9]{10}$/.test(digits) ? digits : null;
}

/** Optional rupee amount from a form field. Empty means not given. Returns paise, or null when empty. */
export function parseOptionalRupees(raw: string): ParseResult<number | null> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  const paise = parseRupeesToPaise(trimmed);
  if (paise === null) return { ok: false, error: 'Enter an amount in rupees, for example 1250 or 1250.50.' };
  return { ok: true, value: paise };
}

/** A validity date in YYYY-MM-DD, not before today (in the given calendar day). Empty means no date. */
export function parseValidity(raw: string, today: string): ParseResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: false, error: 'Enter the validity date as YYYY-MM-DD.' };
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return { ok: false, error: 'Enter a real calendar date.' };
  }
  if (trimmed < today) return { ok: false, error: 'The validity date is in the past.' };
  return { ok: true, value: trimmed };
}

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  CONVERTED: 'Converted to order',
};

/** What the customer sees. Internal states are shown in plain words. */
export const CUSTOMER_QUOTE_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Request received. The store is preparing prices',
  DRAFT: 'The store is preparing your quotation',
  SENT: 'Waiting for your response',
  ACCEPTED: 'Accepted. You can now place the order',
  REJECTED: 'Declined',
  EXPIRED: 'Expired. Ask the store for a renewed quotation',
  CANCELLED: 'Cancelled',
  CONVERTED: 'Order placed',
};

export interface ParsedOwnerLine {
  sku: string;
  quantity: number;
  /** Null keeps the catalogue sale price. */
  unitPricePaise: number | null;
  discountPaise: number;
}

/**
 * Owner line format: "SKU quantity [unit price] [discount]", for example "AMB-V001 4 950 120".
 * The price and discount are rupees and optional. A blank price uses the catalogue price.
 */
export function parseOwnerLineText(text: string, maxLines = MAX_QUOTE_LINES): ParseResult<ParsedOwnerLine[]> {
  const rows = text.split(/\r?\n/).map((row) => row.trim()).filter((row) => row !== '');
  if (rows.length === 0) return { ok: false, error: 'Add at least one product, as "SKU quantity" on each line.' };
  if (rows.length > maxLines) return { ok: false, error: `A quotation can have at most ${maxLines} lines.` };

  const lines: ParsedOwnerLine[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const match = /^([A-Za-z0-9][A-Za-z0-9-]{1,39})[\s,]+(\d{1,5}(?:\.\d{1,3})?)(?:[\s,]+(\d+(?:\.\d{1,2})?))?(?:[\s,]+(\d+(?:\.\d{1,2})?))?$/.exec(rows[index]!);
    if (!match) {
      return { ok: false, error: `Line ${index + 1} must be a SKU, a quantity, then optional unit price and discount in rupees.` };
    }
    const sku = match[1]!.toUpperCase();
    const quantity = Number(match[2]);
    if (!(quantity > 0) || quantity > MAX_QUOTE_QUANTITY) {
      return { ok: false, error: `Line ${index + 1}: the quantity must be above 0 and up to ${MAX_QUOTE_QUANTITY}.` };
    }
    let unitPricePaise: number | null = null;
    if (match[3] !== undefined) {
      const paise = parseRupeesToPaise(match[3]);
      if (paise === null || paise <= 0) return { ok: false, error: `Line ${index + 1}: the unit price must be above 0.` };
      unitPricePaise = paise;
    }
    let discountPaise = 0;
    if (match[4] !== undefined) {
      const paise = parseRupeesToPaise(match[4]);
      if (paise === null) return { ok: false, error: `Line ${index + 1}: the discount must be an amount in rupees.` };
      discountPaise = paise;
    }
    if (seen.has(sku)) return { ok: false, error: `${sku} appears twice. Combine the quantities on one line.` };
    seen.add(sku);
    lines.push({ sku, quantity, unitPricePaise, discountPaise });
  }
  return { ok: true, value: lines };
}
