import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { CATALOGUE_COLUMNS, PRICE_COLUMNS } from '@/lib/imports/catalogue-rules';
import type { Column, Dataset } from '@/lib/exports/tabular';

/** The largest export, in variant rows. Larger catalogues must be exported in parts by category or brand. */
export const EXPORT_ROW_LIMIT = 10_000;

export const EXPORT_KINDS = ['catalogue', 'variants', 'inventory', 'prices', 'low-stock'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportFilters {
  categorySlug?: string | null;
  brandSlug?: string | null;
}

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  material: string | null;
  gst_rate_bps: number;
  status: 'active' | 'archived';
  categories: { name: string; slug: string } | null;
  brands: { name: string; slug: string } | null;
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  label: string;
  size_label: string | null;
  sale_price_paise: number;
  cost_price_paise: number;
  mrp_paise: number | null;
  price_unit: string;
  inventory: InventoryRow | InventoryRow[] | null;
}

interface InventoryRow {
  on_hand: number;
  reserved: number;
  damaged: number;
  incoming: number;
  reorder_level: number;
}

interface Joined {
  product: ProductRow;
  variant: VariantRow;
  stock: InventoryRow;
}

const PRODUCT_COLUMNS = 'id, sku, name, description, material, gst_rate_bps, status, categories(name, slug), brands(name, slug)';
const VARIANT_COLUMNS = 'id, product_id, sku, label, size_label, sale_price_paise, cost_price_paise, mrp_paise, price_unit, inventory(on_hand, reserved, damaged, incoming, reorder_level)';

/** Pages through a table in steps of 1,000 rows, because the API returns at most 1,000 rows per request. */
async function pageAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  cap: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error('Could not load the catalogue for export.');
    const chunk = (data ?? []) as T[];
    out.push(...chunk);
    if (out.length > cap) throw new Error(`This export has more than ${cap.toLocaleString('en-IN')} rows. Filter it by category or brand.`);
    if (chunk.length < 1000) break;
  }
  return out;
}

function stockOf(variant: VariantRow): InventoryRow {
  const raw = variant.inventory;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row ?? { on_hand: 0, reserved: 0, damaged: 0, incoming: 0, reorder_level: 0 };
}

/** Available stock is on hand minus reserved. Damaged units are on hand but cannot be sold, so they are shown separately. */
export function availableOf(stock: InventoryRow): number {
  return Number(stock.on_hand) - Number(stock.reserved);
}

/** Loads every active-or-archived variant of the store, joined to its product and stock, then applies the filters in memory. */
async function loadJoined(storeId: string, filters: ExportFilters): Promise<Joined[]> {
  const admin = createSupabaseAdminClient();
  const [products, variants] = await Promise.all([
    pageAll<ProductRow>((from, to) =>
      admin.from('products').select(PRODUCT_COLUMNS).eq('store_id', storeId).order('sku').range(from, to), 50_000),
    pageAll<VariantRow>((from, to) =>
      admin.from('product_variants').select(VARIANT_COLUMNS).eq('store_id', storeId).order('sku').range(from, to), EXPORT_ROW_LIMIT * 5),
  ]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const joined: Joined[] = [];
  for (const variant of variants) {
    const product = byId.get(variant.product_id);
    if (!product) continue;
    if (filters.categorySlug && product.categories?.slug !== filters.categorySlug) continue;
    if (filters.brandSlug && product.brands?.slug !== filters.brandSlug) continue;
    joined.push({ product, variant, stock: stockOf(variant) });
  }
  if (joined.length > EXPORT_ROW_LIMIT) {
    throw new Error(`This export has more than ${EXPORT_ROW_LIMIT.toLocaleString('en-IN')} rows. Filter it by category or brand.`);
  }
  return joined;
}

function gstPercent(bps: number): number {
  return bps / 100;
}

function catalogueDataset(rows: Joined[], storeName: string): Dataset {
  return {
    title: 'Product catalogue',
    subtitle: `${storeName}. Re-importable: the headers match the import template.`,
    columns: CATALOGUE_COLUMNS.map((c): Column => ({
      header: c.header,
      kind: c.key === 'costPrice' || c.key === 'sellingPrice' || c.key === 'mrp' ? 'money' : c.key === 'gstRate' || c.key === 'openingStock' || c.key === 'reorderLevel' ? 'int' : 'text',
    })),
    // Opening stock is blank on export: re-importing it would not change stock of existing variants, so it is left out on purpose.
    rows: rows.map(({ product, variant, stock }) => [
      product.sku,
      product.name,
      product.description ?? '',
      product.categories?.name ?? '',
      product.brands?.name ?? '',
      variant.sku,
      variant.label,
      variant.size_label ?? '',
      product.material ?? '',
      variant.price_unit,
      Number(variant.cost_price_paise),
      Number(variant.sale_price_paise),
      variant.mrp_paise === null ? '' : Number(variant.mrp_paise),
      gstPercent(product.gst_rate_bps),
      '',
      Number(stock.reorder_level),
      product.status,
    ]),
  };
}

function variantsDataset(rows: Joined[], storeName: string): Dataset {
  return {
    title: 'Variants',
    subtitle: storeName,
    columns: [
      { header: 'Variant SKU', kind: 'text' },
      { header: 'Product SKU', kind: 'text' },
      { header: 'Product name', kind: 'text' },
      { header: 'Category', kind: 'text' },
      { header: 'Brand', kind: 'text' },
      { header: 'Variant name', kind: 'text' },
      { header: 'Dimensions', kind: 'text' },
      { header: 'Measurement unit', kind: 'text' },
      { header: 'Cost price', kind: 'money' },
      { header: 'Selling price', kind: 'money' },
      { header: 'MRP', kind: 'money' },
      { header: 'GST rate', kind: 'int' },
      { header: 'Product status', kind: 'text' },
    ],
    rows: rows.map(({ product, variant }) => [
      variant.sku,
      product.sku,
      product.name,
      product.categories?.name ?? '',
      product.brands?.name ?? '',
      variant.label,
      variant.size_label ?? '',
      variant.price_unit,
      Number(variant.cost_price_paise),
      Number(variant.sale_price_paise),
      variant.mrp_paise === null ? '' : Number(variant.mrp_paise),
      gstPercent(product.gst_rate_bps),
      product.status,
    ]),
  };
}

function inventoryDataset(rows: Joined[], storeName: string): Dataset {
  return {
    title: 'Inventory',
    subtitle: storeName,
    columns: [
      { header: 'Variant SKU', kind: 'text' },
      { header: 'Product SKU', kind: 'text' },
      { header: 'Product name', kind: 'text' },
      { header: 'Variant name', kind: 'text' },
      { header: 'On hand', kind: 'int' },
      { header: 'Reserved', kind: 'int' },
      { header: 'Available', kind: 'int' },
      { header: 'Damaged', kind: 'int' },
      { header: 'Incoming', kind: 'int' },
      { header: 'Reorder level', kind: 'int' },
    ],
    rows: rows.map(({ product, variant, stock }) => [
      variant.sku,
      product.sku,
      product.name,
      variant.label,
      Number(stock.on_hand),
      Number(stock.reserved),
      availableOf(stock),
      Number(stock.damaged),
      Number(stock.incoming),
      Number(stock.reorder_level),
    ]),
  };
}

function pricesDataset(rows: Joined[], storeName: string): Dataset {
  return {
    title: 'Price list',
    subtitle: `${storeName}. Re-importable with the price update template.`,
    columns: [
      { header: PRICE_COLUMNS[0].header, kind: 'text' },
      { header: 'Product name', kind: 'text' },
      { header: 'Variant name', kind: 'text' },
      { header: PRICE_COLUMNS[1].header, kind: 'money' },
      { header: PRICE_COLUMNS[2].header, kind: 'money' },
      { header: PRICE_COLUMNS[3].header, kind: 'money' },
    ],
    rows: rows.map(({ product, variant }) => [
      variant.sku,
      product.name,
      variant.label,
      Number(variant.sale_price_paise),
      Number(variant.cost_price_paise),
      variant.mrp_paise === null ? '' : Number(variant.mrp_paise),
    ]),
  };
}

function lowStockDataset(rows: Joined[], storeName: string): Dataset {
  const low = rows.filter(({ stock }) => Number(stock.reorder_level) > 0 && availableOf(stock) <= Number(stock.reorder_level));
  return {
    ...inventoryDataset(low, storeName),
    title: 'Low stock',
    subtitle: `${storeName}. Available stock at or below the reorder level.`,
  };
}

/** Builds one export dataset for the store. Owners and managers only; cost prices are included. */
export async function buildCatalogueExport(input: {
  storeId: string;
  storeName: string;
  kind: ExportKind;
  filters: ExportFilters;
}): Promise<Dataset> {
  const rows = await loadJoined(input.storeId, input.filters);
  switch (input.kind) {
    case 'catalogue': return catalogueDataset(rows, input.storeName);
    case 'variants': return variantsDataset(rows, input.storeName);
    case 'inventory': return inventoryDataset(rows, input.storeName);
    case 'prices': return pricesDataset(rows, input.storeName);
    case 'low-stock': return lowStockDataset(rows, input.storeName);
  }
}

/** Store categories and brands for the filter menus on the import and export page. */
export async function listFilterOptions(storeId: string): Promise<{ categories: { slug: string; name: string }[]; brands: { slug: string; name: string }[] }> {
  const admin = createSupabaseAdminClient();
  const [categories, brands] = await Promise.all([
    admin.from('categories').select('slug, name').eq('store_id', storeId).order('name'),
    admin.from('brands').select('slug, name').eq('store_id', storeId).order('name'),
  ]);
  if (categories.error || brands.error) throw new Error('Could not load the filter options.');
  return {
    categories: (categories.data ?? []) as { slug: string; name: string }[],
    brands: (brands.data ?? []) as { slug: string; name: string }[],
  };
}
