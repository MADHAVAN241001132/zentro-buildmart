/**
 * Row rules for catalogue and price imports. Pure: the caller loads the store's categories, brands, products and
 * variants and passes them in, so every rule can be tested without a database.
 *
 * Each row is one variant. Rows that share a Product SKU describe one product: the first row gives the product's
 * details, and later rows must repeat the same details or be reported. Row errors are reported per row; only
 * rows without errors are staged for the database.
 */
import { GST_RATES_BPS, UNITS, slugify } from '@/lib/validation/catalogue-constants';
import type { SheetRow } from './read-spreadsheet';

export interface ColumnSpec<K extends string = string> {
  key: K;
  header: string;
}

export const CATALOGUE_COLUMNS = [
  { key: 'productSku', header: 'Product SKU' },
  { key: 'productName', header: 'Product name' },
  { key: 'productDescription', header: 'Product description' },
  { key: 'category', header: 'Category' },
  { key: 'brand', header: 'Brand' },
  { key: 'variantSku', header: 'Variant SKU' },
  { key: 'variantName', header: 'Variant name' },
  { key: 'dimensions', header: 'Dimensions' },
  { key: 'material', header: 'Material' },
  { key: 'unit', header: 'Measurement unit' },
  { key: 'costPrice', header: 'Cost price' },
  { key: 'sellingPrice', header: 'Selling price' },
  { key: 'mrp', header: 'MRP' },
  { key: 'gstRate', header: 'GST rate' },
  { key: 'openingStock', header: 'Opening stock' },
  { key: 'reorderLevel', header: 'Reorder level' },
  { key: 'status', header: 'Product status' },
] as const satisfies readonly ColumnSpec[];

export const PRICE_COLUMNS = [
  { key: 'variantSku', header: 'Variant SKU' },
  { key: 'sellingPrice', header: 'Selling price' },
  { key: 'costPrice', header: 'Cost price' },
  { key: 'mrp', header: 'MRP' },
] as const satisfies readonly ColumnSpec[];

export type ImportKind = 'catalogue' | 'prices';
export type DuplicateMode = 'skip' | 'update';

export interface ImportContext {
  /** Normalised category name to id. */
  categories: Map<string, string>;
  /** Normalised brand name to id. */
  brands: Map<string, string>;
  /** Exact product SKU to product. */
  products: Map<string, { id: string; slug: string }>;
  /** Exact variant SKU to variant, with the product SKU it belongs to and its current prices. */
  variants: Map<string, ExistingVariant>;
  /** Product slugs already used in the store. */
  productSlugs: Set<string>;
}

export interface ExistingVariant {
  id: string;
  productSku: string;
  salePricePaise: number;
  costPricePaise: number;
  mrpPaise: number | null;
}

export interface StagedProduct {
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brandId: string | null;
  material: string | null;
  gstRateBps: number;
  unitOfSale: string;
  status: 'active' | 'archived';
}

export interface StagedVariant {
  variantAction: 'create' | 'update';
  variantId: string | null;
  sku: string;
  label: string;
  sizeLabel: string | null;
  salePricePaise: number;
  costPricePaise: number;
  mrpPaise: number | null;
  priceUnit: string;
  openingStock: number;
  reorderLevel: number;
  isDefault: boolean;
  row: number;
}

export interface StagedGroup {
  productSku: string;
  productAction: 'create' | 'update' | 'none';
  productId: string | null;
  product: StagedProduct | null;
  variants: StagedVariant[];
}

export interface StagedPrice {
  variantId: string;
  variantSku: string;
  salePricePaise: number;
  costPricePaise: number;
  mrpPaise: number | null;
  row: number;
}

export interface RowResult {
  row: number;
  sku: string;
  status: 'ready' | 'skipped' | 'error';
  action: string;
  messages: string[];
}

export interface ImportSummary {
  totalRows: number;
  readyRows: number;
  skippedRows: number;
  errorRows: number;
  productsToCreate: number;
  productsToUpdate: number;
  variantsToCreate: number;
  variantsToUpdate: number;
  pricesToUpdate: number;
}

export type RulesOutcome =
  | { ok: false; error: string }
  | { ok: true; staged: StagedGroup[]; prices: StagedPrice[]; rows: RowResult[]; summary: ImportSummary };

// ---------------------------------------------------------------------------
// Header and cell helpers
// ---------------------------------------------------------------------------

function normaliseHeader(value: string): string {
  return value.replace(/^﻿/, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Maps the file's header row onto the expected columns. Every expected column must be present. */
export function mapColumns<T extends readonly ColumnSpec[]>(
  headerCells: string[],
  columns: T,
): { ok: true; index: Record<T[number]['key'], number> } | { ok: false; missing: string[] } {
  const found = new Map<string, number>();
  headerCells.forEach((cell, i) => {
    const key = normaliseHeader(cell);
    if (key && !found.has(key)) found.set(key, i);
  });
  const index: Record<string, number> = {};
  const missing: string[] = [];
  for (const column of columns) {
    const at = found.get(normaliseHeader(column.header));
    if (at === undefined) missing.push(column.header);
    else index[column.key] = at;
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, index: index as Record<T[number]['key'], number> };
}

type Values = Record<string, string>;

/** Columns that describe the product itself. They repeat on every row of one Product SKU. */
const PRODUCT_FIELD_KEYS = ['productName', 'productDescription', 'category', 'brand', 'material', 'unit', 'gstRate', 'status'] as const;

function valuesOf(row: SheetRow, index: Record<string, number>): Values {
  const out: Values = {};
  for (const [key, at] of Object.entries(index)) {
    out[key] = (row.cells[at] ?? '').replace(/\r/g, '').trim();
  }
  return out;
}

type Check<T> = { value: T } | { error: string };

/** Text field. A leading apostrophe added by the export is removed; formula characters are refused. */
export function cleanText(raw: string, field: string, max: number): Check<string> {
  let value = raw.trim();
  if (/^'[=+\-@\t\r]/.test(value)) value = value.slice(1);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return { error: `${field} contains characters that cannot be imported.` };
  if (/^[=+@\t]/.test(value)) return { error: `${field} cannot start with =, +, @ or a tab. Remove that character.` };
  if (value.length > max) return { error: `${field} is longer than ${max} characters.` };
  return { value };
}

/** Rupee text to paise, using integer arithmetic only. Accepts 640, 640.5, 640.50, ₹1,250.00 and similar. */
export function parseRupees(raw: string, field: string, required: boolean): Check<number | null> {
  const text = raw.replace(/[₹,\s]/g, '');
  if (text === '') return required ? { error: `${field} is required.` } : { value: null };
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return { error: `${field} must be a rupee amount such as 640 or 640.50 (no negatives).` };
  const [whole, fraction = ''] = text.split('.');
  return { value: Number(whole) * 100 + Number(fraction.padEnd(2, '0')) };
}

/** GST percentage to basis points: 18, 18% and 18.00 all give 1800. Only the rates the storefront supports are accepted. */
export function parseGstRate(raw: string): Check<number> {
  const text = raw.replace(/%/g, '').trim();
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text);
  const allowed = GST_RATES_BPS.map((bps) => bps / 100).join(', ');
  if (!match) return { error: `GST rate must be one of ${allowed} percent.` };
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
  if (!(GST_RATES_BPS as readonly number[]).includes(bps)) return { error: `GST rate must be one of ${allowed} percent.` };
  return { value: bps };
}

export function parseWhole(raw: string, field: string, fallback: number): Check<number> {
  const text = raw.trim();
  if (text === '') return { value: fallback };
  if (!/^\d{1,9}$/.test(text)) return { error: `${field} must be a whole number of zero or more.` };
  return { value: Number(text) };
}

function parseUnit(raw: string): Check<string> {
  const value = raw.trim().toLowerCase();
  if (!(UNITS as readonly string[]).includes(value)) return { error: `Measurement unit must be one of: ${UNITS.join(', ')}.` };
  return { value };
}

function parseStatus(raw: string): Check<'active' | 'archived'> {
  const value = raw.trim().toLowerCase();
  if (value === '' || value === 'active') return { value: 'active' };
  if (value === 'archived') return { value: 'archived' };
  return { error: 'Product status must be active or archived.' };
}

function isError<T>(check: Check<T>): check is { error: string } {
  return 'error' in check;
}

// ---------------------------------------------------------------------------
// Product details (shared by every row of one Product SKU)
// ---------------------------------------------------------------------------

interface ProductDetails {
  name: string;
  description: string | null;
  categoryId: string;
  brandId: string | null;
  material: string | null;
  gstRateBps: number;
  unitOfSale: string;
  status: 'active' | 'archived';
}

function productDetailsOf(values: Values, ctx: ImportContext): { value: ProductDetails } | { errors: string[] } {
  const errors: string[] = [];
  const name = cleanText(values.productName ?? '', 'Product name', 200);
  if (isError(name)) errors.push(name.error);
  else if (name.value.length < 2) errors.push('Product name is required.');

  const description = cleanText(values.productDescription ?? '', 'Product description', 2000);
  if (isError(description)) errors.push(description.error);

  const material = cleanText(values.material ?? '', 'Material', 80);
  if (isError(material)) errors.push(material.error);

  let categoryId: string | undefined;
  const categoryName = normaliseName(values.category ?? '');
  if (categoryName === '') errors.push('Category is required.');
  else if (!ctx.categories.has(categoryName)) errors.push(`Category "${values.category}" was not found. Create it in Categories first, or correct the name.`);
  else categoryId = ctx.categories.get(categoryName);

  let brandId: string | null = null;
  const brandName = normaliseName(values.brand ?? '');
  if (brandName !== '') {
    if (!ctx.brands.has(brandName)) errors.push(`Brand "${values.brand}" was not found. Create it in Brands first, or leave the cell blank.`);
    else brandId = ctx.brands.get(brandName) ?? null;
  }

  const gst = parseGstRate(values.gstRate ?? '');
  if (isError(gst)) errors.push(gst.error);
  const unit = parseUnit(values.unit ?? '');
  if (isError(unit)) errors.push(unit.error);
  const status = parseStatus(values.status ?? '');
  if (isError(status)) errors.push(status.error);

  if (errors.length > 0 || isError(name) || isError(gst) || isError(unit) || isError(status) || !categoryId) {
    return { errors };
  }
  return {
    value: {
      name: name.value,
      description: isError(description) ? null : description.value || null,
      categoryId,
      brandId,
      material: isError(material) ? null : material.value || null,
      gstRateBps: gst.value,
      unitOfSale: unit.value,
      status: status.value,
    },
  };
}

function sameDetails(a: ProductDetails, b: ProductDetails): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.categoryId === b.categoryId &&
    a.brandId === b.brandId &&
    a.material === b.material &&
    a.gstRateBps === b.gstRateBps &&
    a.unitOfSale === b.unitOfSale &&
    a.status === b.status
  );
}

// ---------------------------------------------------------------------------
// Catalogue import
// ---------------------------------------------------------------------------

function emptySummary(totalRows: number): ImportSummary {
  return {
    totalRows,
    readyRows: 0,
    skippedRows: 0,
    errorRows: 0,
    productsToCreate: 0,
    productsToUpdate: 0,
    variantsToCreate: 0,
    variantsToUpdate: 0,
    pricesToUpdate: 0,
  };
}

export function evaluateCatalogue(rows: SheetRow[], mode: DuplicateMode, ctx: ImportContext): RulesOutcome {
  if (rows.length === 0) return { ok: false, error: 'The file is empty.' };
  const columns = mapColumns(rows[0]!.cells, CATALOGUE_COLUMNS);
  if (!columns.ok) return { ok: false, error: `The file is missing these columns: ${columns.missing.join(', ')}. Use the downloaded template.` };
  const data = rows.slice(1);
  if (data.length === 0) return { ok: false, error: 'The file has a header but no product rows.' };

  const index = columns.index;
  const inputs = data.map((row) => ({ row: row.rowNumber, values: valuesOf(row, index) }));
  const results = new Map<number, RowResult>();
  const newResult = (row: number, sku: string): RowResult => {
    const result: RowResult = { row, sku, status: 'ready', action: '', messages: [] };
    results.set(row, result);
    return result;
  };

  // Variant SKUs must be unique within the file.
  // Every row that repeats a Variant SKU is refused, because the file does not say which copy is right.
  const variantRows = new Map<string, number[]>();
  for (const input of inputs) {
    const sku = (input.values.variantSku ?? '').trim();
    if (sku === '') continue;
    variantRows.set(sku, [...(variantRows.get(sku) ?? []), input.row]);
  }

  // Group rows by Product SKU, keeping first-seen order.
  const groups = new Map<string, typeof inputs>();
  for (const input of inputs) {
    const productSku = input.values.productSku ?? '';
    const key = productSku;
    const list = groups.get(key) ?? [];
    list.push(input);
    groups.set(key, list);
  }

  const staged: StagedGroup[] = [];
  const batchSlugs = new Set<string>();
  const usedVariantSkus = new Set<string>();

  for (const [productSku, members] of groups) {
    const first = members[0]!;
    if (productSku === '') {
      for (const member of members) {
        newResult(member.row, '').messages.push('Product SKU is required.');
      }
      continue;
    }
    if (productSku.length < 2 || productSku.length > 64 || isBadStart(productSku)) {
      for (const member of members) {
        const result = newResult(member.row, productSku);
        result.status = 'error';
        result.messages.push('Product SKU must be 2 to 64 characters and must not start with =, +, - or @.');
      }
      continue;
    }

    const details = productDetailsOf(first.values, ctx);
    const existingProduct = ctx.products.get(productSku);
    if ('errors' in details) {
      for (const member of members) {
        const result = newResult(member.row, productSku);
        result.status = 'error';
        if (member === first) result.messages.push(...details.errors);
        else result.messages.push(`Product details could not be read: see row ${first.row}.`);
      }
      continue;
    }
    const productDetails = details.value;

    // Later rows of the same product must repeat the product details exactly.
    const rowFailures = new Map<number, string[]>();
    for (const member of members.slice(1)) {
      // A blank product cell on a later row means "as on the first row". A filled cell must match exactly.
      const merged: Values = { ...member.values };
      for (const key of PRODUCT_FIELD_KEYS) if (!merged[key]) merged[key] = first.values[key] ?? '';
      const other = productDetailsOf(merged, ctx);
      if ('errors' in other) {
        rowFailures.set(member.row, [...other.errors]);
      } else if (!sameDetails(productDetails, other.value)) {
        rowFailures.set(member.row, [`Product details differ from row ${first.row} for the same Product SKU. Repeat them exactly or leave them blank on this row.`]);
      }
    }

    // Product-level decisions.
    let productAction: StagedGroup['productAction'];
    let productId: string | null = null;
    let product: StagedProduct | null = null;
    let slug = '';
    if (!existingProduct) {
      productAction = 'create';
      const base = slugify(productDetails.name) || 'item';
      slug = base;
      if (ctx.productSlugs.has(slug) || batchSlugs.has(slug)) slug = `${base}-${slugify(productSku) || 'item'}`;
      if (ctx.productSlugs.has(slug) || batchSlugs.has(slug)) {
        for (const member of members) {
          const result = newResult(member.row, productSku);
          result.status = 'error';
          result.messages.push('A product with this name already exists. Change the product name.');
        }
        continue;
      }
      batchSlugs.add(slug);
      product = { ...productDetails, slug };
    } else if (mode === 'update') {
      productAction = 'update';
      productId = existingProduct.id;
      product = { ...productDetails, slug: existingProduct.slug };
    } else {
      productAction = 'none';
      productId = existingProduct.id;
    }

    const stagedVariants: StagedVariant[] = [];
    let defaultAssigned = false;
    for (const member of members) {
      const result = newResult(member.row, member.values.variantSku || productSku);
      const extra = rowFailures.get(member.row);
      if (extra) result.messages.push(...extra);

      const variantSku = cleanText(member.values.variantSku ?? '', 'Variant SKU', 80);
      if (isError(variantSku)) {
        result.messages.push(variantSku.error);
        continue;
      }
      if (variantSku.value.length < 2) {
        result.messages.push('Variant SKU is required.');
        continue;
      }
      const repeats = variantRows.get(variantSku.value) ?? [];
      if (repeats.length > 1) {
        result.messages.push(`Variant SKU appears ${repeats.length} times in this file (rows ${repeats.join(', ')}). Make each Variant SKU unique.`);
        continue;
      }
      if (usedVariantSkus.has(variantSku.value)) {
        result.messages.push('Variant SKU is already used by another row in this file.');
        continue;
      }
      usedVariantSkus.add(variantSku.value);

      const existingVariant = ctx.variants.get(variantSku.value);
      if (existingVariant && existingVariant.productSku !== productSku) {
        result.messages.push(`Variant SKU already belongs to product ${existingVariant.productSku}.`);
        continue;
      }
      if (existingVariant && mode === 'skip') {
        result.status = 'skipped';
        result.action = 'Skip: variant already exists';
        continue;
      }

      const sale = parseRupees(member.values.sellingPrice ?? '', 'Selling price', true);
      const cost = parseRupees(member.values.costPrice ?? '', 'Cost price', false);
      const mrp = parseRupees(member.values.mrp ?? '', 'MRP', false);
      const stock = parseWhole(member.values.openingStock ?? '', 'Opening stock', 0);
      const reorder = parseWhole(member.values.reorderLevel ?? '', 'Reorder level', 0);
      const label = cleanText(member.values.variantName ?? '', 'Variant name', 120);
      const dimensions = cleanText(member.values.dimensions ?? '', 'Dimensions', 60);
      const checks: Check<unknown>[] = [sale, cost, mrp, stock, reorder, label, dimensions];
      for (const check of checks) if (isError(check)) result.messages.push(check.error);
      if (isError(sale) || isError(cost) || isError(mrp) || isError(stock) || isError(reorder) || isError(label) || isError(dimensions)) continue;
      const salePaise = sale.value ?? 0;
      if (salePaise <= 0) {
        result.messages.push('Selling price must be more than zero.');
        continue;
      }
      const mrpPaise = mrp.value;
      if (mrpPaise !== null && mrpPaise < salePaise) {
        result.messages.push('MRP cannot be less than the selling price.');
        continue;
      }

      if (existingVariant) {
        result.action = 'Update variant';
        if (member.values.openingStock) result.messages.push('Opening stock is not changed for an existing variant. Use stock adjustments instead.');
      } else {
        result.action = productAction === 'create' ? 'Create product and variant' : 'Add variant';
      }
      // Rows with a blocking message (for example, product details that differ from the first row) are not staged.
      if (result.messages.some(isBlocking)) continue;
      const isDefault = productAction === 'create' && !defaultAssigned;
      if (isDefault) defaultAssigned = true;
      stagedVariants.push({
        variantAction: existingVariant ? 'update' : 'create',
        variantId: existingVariant?.id ?? null,
        sku: variantSku.value,
        label: label.value || productDetails.name,
        sizeLabel: dimensions.value || null,
        salePricePaise: salePaise,
        costPricePaise: cost.value ?? 0,
        mrpPaise,
        priceUnit: productDetails.unitOfSale,
        openingStock: existingVariant ? 0 : stock.value,
        reorderLevel: reorder.value,
        isDefault,
        row: member.row,
      });
      if (productAction === 'update' && !existingVariant) result.action = 'Add variant';
    }

    const anyValid = stagedVariants.length > 0;
    if (productAction === 'create' && !anyValid) {
      for (const member of members) {
        const result = results.get(member.row)!;
        if (result.status !== 'skipped') result.messages.push('No variant row for this product is valid, so the product was not created.');
      }
    }

    // A row with a blocking message is an error, whatever else it says. Opening-stock notes do not block.
    for (const member of members) {
      const result = results.get(member.row)!;
      if (result.messages.some(isBlocking)) result.status = 'error';
      if (result.status === 'ready' && !result.action) result.action = 'Ready';
    }

    const createsProduct = productAction === 'create' && anyValid;
    const updatesProduct = productAction === 'update' && anyValid;
    if (createsProduct || updatesProduct || (productAction === 'none' && anyValid)) {
      // A product with rows in error may still import its valid variants, as the row results show.
      staged.push({
        productSku,
        productAction: createsProduct ? 'create' : updatesProduct ? 'update' : 'none',
        productId,
        product: createsProduct || updatesProduct ? product : null,
        variants: stagedVariants,
      });
    }
  }

  // Summary and row list, in file order.
  const ordered = inputs.map((input) => {
    const result = results.get(input.row)!;
    return result;
  });
  const summary = emptySummary(ordered.length);
  for (const result of ordered) {
    if (result.status === 'ready') summary.readyRows += 1;
    else if (result.status === 'skipped') summary.skippedRows += 1;
    else summary.errorRows += 1;
  }
  for (const group of staged) {
    if (group.productAction === 'create') summary.productsToCreate += 1;
    if (group.productAction === 'update') summary.productsToUpdate += 1;
    for (const variant of group.variants) {
      if (variant.variantAction === 'create') summary.variantsToCreate += 1;
      else summary.variantsToUpdate += 1;
    }
  }
  return { ok: true, staged, prices: [], rows: ordered, summary };
}

function isBadStart(value: string): boolean {
  return /^[=+\-@\t]/.test(value);
}

const NOTE_PREFIXES = ['Opening stock is not changed'];

/** Messages that stop a row from importing. Notes that only inform the owner do not. */
export function isBlocking(message: string): boolean {
  return !NOTE_PREFIXES.some((prefix) => message.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Price update import
// ---------------------------------------------------------------------------

export function evaluatePrices(rows: SheetRow[], ctx: ImportContext): RulesOutcome {
  if (rows.length === 0) return { ok: false, error: 'The file is empty.' };
  const columns = mapColumns(rows[0]!.cells, PRICE_COLUMNS);
  if (!columns.ok) return { ok: false, error: `The file is missing these columns: ${columns.missing.join(', ')}. Use the downloaded price template.` };
  const data = rows.slice(1);
  if (data.length === 0) return { ok: false, error: 'The file has a header but no price rows.' };

  const seen = new Map<string, number>();
  const prices: StagedPrice[] = [];
  const results: RowResult[] = [];
  for (const row of data) {
    const values = valuesOf(row, columns.index);
    const result: RowResult = { row: row.rowNumber, sku: values.variantSku ?? '', status: 'ready', action: 'Price update', messages: [] };
    results.push(result);

    const sku = cleanText(values.variantSku ?? '', 'Variant SKU', 80);
    if (isError(sku)) {
      result.messages.push(sku.error);
    } else if (sku.value.length < 2) {
      result.messages.push('Variant SKU is required.');
    } else if (seen.has(sku.value)) {
      result.messages.push(`Variant SKU appears more than once in this file (first at row ${seen.get(sku.value)}).`);
    } else {
      seen.set(sku.value, row.rowNumber);
      const current = ctx.variants.get(sku.value);
      if (!current) {
        result.messages.push('No variant with this SKU exists in your store.');
      } else {
        const sale = parseRupees(values.sellingPrice ?? '', 'Selling price', true);
        const cost = parseRupees(values.costPrice ?? '', 'Cost price', false);
        const mrp = parseRupees(values.mrp ?? '', 'MRP', false);
        for (const check of [sale, cost, mrp]) if (isError(check)) result.messages.push(check.error);
        if (!isError(sale) && !isError(cost) && !isError(mrp)) {
          const salePaise = sale.value ?? 0;
          const costPaise = cost.value ?? current.costPricePaise;
          const mrpPaise = mrp.value ?? current.mrpPaise;
          if (salePaise <= 0) result.messages.push('Selling price must be more than zero.');
          else if (mrpPaise !== null && mrpPaise < salePaise) result.messages.push('MRP cannot be less than the selling price.');
          else {
            prices.push({ variantId: current.id, variantSku: sku.value, salePricePaise: salePaise, costPricePaise: costPaise, mrpPaise, row: row.rowNumber });
          }
        }
      }
    }
    if (result.messages.length > 0) result.status = 'error';
  }

  const summary = emptySummary(results.length);
  for (const result of results) {
    if (result.status === 'ready') summary.readyRows += 1;
    else summary.errorRows += 1;
  }
  summary.pricesToUpdate = prices.length;
  return { ok: true, staged: [], prices, rows: results, summary };
}
