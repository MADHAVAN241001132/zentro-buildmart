/**
 * Pure rules for the wishlist and comparison. No database or framework imports, so they can be unit-tested.
 */

export const MAX_COMPARE = 4;
export const MAX_BULK_MOVE = 50;

/** The fields a comparison needs from one product. */
export interface CompareInput {
  id: string;
  name: string;
  brand: string | null;
  material: string | null;
  finish: string | null;
  colour: string | null;
  application: string | null;
  warrantyMonths: number | null;
  gstRateBps: number;
  sizeLabel: string | null;
  priceUnit: string;
  salePricePaise: number | null;
  mrpPaise: number | null;
  availableUnits: number;
  specs: Record<string, unknown>;
}

export type CompareKind = 'text' | 'money' | 'number';

export interface CompareRow {
  key: string;
  label: string;
  kind: CompareKind;
  /** One value per product, in the order given. Null means the product has no value for this row. */
  values: (string | number | null)[];
  /** True when the products do not all show the same value (a missing value counts as a difference). */
  differs: boolean;
}

const FIXED_ROWS: { key: keyof CompareInput; label: string; kind: CompareKind }[] = [
  { key: 'brand', label: 'Brand', kind: 'text' },
  { key: 'salePricePaise', label: 'Selling price', kind: 'money' },
  { key: 'mrpPaise', label: 'MRP', kind: 'money' },
  { key: 'gstRateBps', label: 'GST rate (%)', kind: 'number' },
  { key: 'material', label: 'Material', kind: 'text' },
  { key: 'finish', label: 'Finish', kind: 'text' },
  { key: 'colour', label: 'Colour', kind: 'text' },
  { key: 'sizeLabel', label: 'Dimensions', kind: 'text' },
  { key: 'priceUnit', label: 'Measurement unit', kind: 'text' },
  { key: 'application', label: 'Application', kind: 'text' },
  { key: 'warrantyMonths', label: 'Warranty (months)', kind: 'number' },
  { key: 'availableUnits', label: 'Units in stock', kind: 'number' },
];

function normalise(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.trim();
  return JSON.stringify(value);
}

/**
 * Builds the comparison table: fixed attributes first, then every specification key that any product has.
 * A row differs when its values are not all the same; a row where a product has no value also differs.
 */
export function buildComparison(products: CompareInput[]): CompareRow[] {
  const fixed: CompareRow[] = FIXED_ROWS.map((spec) => {
    const values = products.map((p) => normalise(p[spec.key]));
    return { key: String(spec.key), label: spec.label, kind: spec.kind, values, differs: differs(values) };
  });

  const specKeys = new Map<string, string>();
  for (const product of products) {
    for (const key of Object.keys(product.specs ?? {})) {
      if (!specKeys.has(key)) specKeys.set(key, key);
    }
  }
  const specRows: CompareRow[] = [...specKeys.keys()].sort().map((key) => {
    const values = products.map((p) => normalise(p.specs?.[key]));
    return { key: `spec:${key}`, label: key, kind: 'text', values, differs: differs(values) };
  });

  return [...fixed, ...specRows];
}

function differs(values: (string | number | null)[]): boolean {
  if (values.length < 2) return false;
  const first = values[0];
  return values.some((value) => value !== first);
}

export interface CartCandidate {
  id: string;
  name: string;
  variantId: string | null;
  availableUnits: number;
}

export interface CartPlan {
  toCart: { productId: string; variantId: string }[];
  skipped: { productId: string; name: string; reason: string }[];
}

/**
 * Decides which selected products can go to the cart. Each product uses its default variant and one unit.
 * Products without a price or without stock are skipped with a reason; the rest are never refused by the plan.
 */
export function planCartMoves(candidates: CartCandidate[]): CartPlan {
  const plan: CartPlan = { toCart: [], skipped: [] };
  for (const candidate of candidates) {
    if (!candidate.variantId) {
      plan.skipped.push({ productId: candidate.id, name: candidate.name, reason: 'No price is set for this product.' });
    } else if (candidate.availableUnits <= 0) {
      plan.skipped.push({ productId: candidate.id, name: candidate.name, reason: 'Out of stock.' });
    } else {
      plan.toCart.push({ productId: candidate.id, variantId: candidate.variantId });
    }
  }
  return plan;
}

/** Keeps only well-formed UUIDs, removes duplicates, and enforces the bulk limit. */
export function cleanProductIds(values: FormDataEntryValue[]): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && uuid.test(value)) ids.add(value.toLowerCase());
  }
  return [...ids].slice(0, MAX_BULK_MOVE);
}

/** A return address is accepted only when it stays inside this store's storefront. */
export function safeReturnPath(storeSlug: string, value: FormDataEntryValue | null): string {
  const fallback = `/store/${storeSlug}`;
  if (typeof value !== 'string') return fallback;
  const prefix = `/store/${storeSlug}`;
  if (!value.startsWith(prefix) || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) return fallback;
  return value;
}
