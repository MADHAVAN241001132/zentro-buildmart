import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { readSpreadsheet, SpreadsheetError, IMPORT_LIMITS } from '@/lib/imports/read-spreadsheet';
import {
  evaluateCatalogue,
  evaluatePrices,
  type DuplicateMode,
  type ExistingVariant,
  type ImportContext,
  type ImportKind,
  type ImportSummary,
  type RowResult,
} from '@/lib/imports/catalogue-rules';
import { normaliseName } from '@/lib/imports/catalogue-rules';

/** Reads every row of a table in pages, because the API returns at most 1,000 rows per request. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error('Could not load the catalogue');
    const chunk = (data ?? []) as T[];
    out.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return out;
}

/** The store's current categories, brands, products and variants, as the import rules need them. */
export async function loadImportContext(storeId: string): Promise<ImportContext> {
  const admin = createSupabaseAdminClient();
  const [categories, brands, products, variants] = await Promise.all([
    fetchAll<{ id: string; name: string }>((from, to) =>
      admin.from('categories').select('id, name').eq('store_id', storeId).order('id').range(from, to)),
    fetchAll<{ id: string; name: string }>((from, to) =>
      admin.from('brands').select('id, name').eq('store_id', storeId).order('id').range(from, to)),
    fetchAll<{ id: string; sku: string; slug: string }>((from, to) =>
      admin.from('products').select('id, sku, slug').eq('store_id', storeId).order('id').range(from, to)),
    fetchAll<{
      id: string;
      sku: string;
      sale_price_paise: number;
      cost_price_paise: number;
      mrp_paise: number | null;
      products: { sku: string } | null;
    }>((from, to) =>
      admin
        .from('product_variants')
        .select('id, sku, sale_price_paise, cost_price_paise, mrp_paise, products!inner(sku)')
        .eq('store_id', storeId)
        .order('id')
        .range(from, to)),
  ]);

  const variantMap = new Map<string, ExistingVariant>();
  for (const row of variants) {
    variantMap.set(row.sku, {
      id: row.id,
      productSku: row.products?.sku ?? '',
      salePricePaise: Number(row.sale_price_paise),
      costPricePaise: Number(row.cost_price_paise),
      mrpPaise: row.mrp_paise === null ? null : Number(row.mrp_paise),
    });
  }
  return {
    categories: new Map(categories.map((c) => [normaliseName(c.name), c.id])),
    brands: new Map(brands.map((b) => [normaliseName(b.name), b.id])),
    products: new Map(products.map((p) => [p.sku, { id: p.id, slug: p.slug }])),
    variants: variantMap,
    productSlugs: new Set(products.map((p) => p.slug)),
  };
}

export type PreviewResult = { ok: true; batchId: string; summary: ImportSummary } | { ok: false; error: string };

/**
 * Validates an uploaded file against the store's current catalogue and saves the result as an open batch.
 * Nothing in the catalogue changes here. Confirming the batch is a separate step.
 */
export async function previewImport(input: {
  storeId: string;
  actorId: string;
  kind: ImportKind;
  mode: DuplicateMode;
  fileName: string;
  bytes: Uint8Array;
}): Promise<PreviewResult> {
  let parsed;
  try {
    parsed = readSpreadsheet(input.fileName, input.bytes);
  } catch (error) {
    if (error instanceof SpreadsheetError) return { ok: false, error: (error as Error).message };
    throw error;
  }

  const context = await loadImportContext(input.storeId);
  const outcome = input.kind === 'prices'
    ? evaluatePrices(parsed.rows, context)
    : evaluateCatalogue(parsed.rows, input.mode, context);
  if (!outcome.ok) return { ok: false, error: outcome.error };

  const summary = outcome.summary;
  const staged = input.kind === 'prices' ? outcome.prices : outcome.staged;
  const { data, error } = await createSupabaseAdminClient()
    .from('product_import_batches')
    .insert({
      store_id: input.storeId,
      actor_id: input.actorId,
      kind: input.kind,
      mode: input.kind === 'prices' ? 'update' : input.mode,
      file_name: input.fileName.slice(0, 200) || 'import',
      file_format: parsed.format,
      status: 'previewed',
      total_rows: summary.totalRows,
      ready_rows: summary.readyRows,
      skipped_rows: summary.skippedRows,
      error_rows: summary.errorRows,
      row_results: outcome.rows,
      staged,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: 'The preview could not be saved. Please try again.' };
  return { ok: true, batchId: data.id as string, summary };
}

export interface ImportBatchView {
  id: string;
  kind: ImportKind;
  mode: DuplicateMode;
  file_name: string;
  file_format: 'csv' | 'xlsx';
  status: 'previewed' | 'applied';
  total_rows: number;
  ready_rows: number;
  skipped_rows: number;
  error_rows: number;
  row_results: RowResult[];
  summary: Record<string, number | string> | null;
  created_at: string;
  applied_at: string | null;
}

const BATCH_COLUMNS = 'id, kind, mode, file_name, file_format, status, total_rows, ready_rows, skipped_rows, error_rows, row_results, summary, created_at, applied_at';

export async function getImportBatch(storeId: string, batchId: string): Promise<ImportBatchView | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('product_import_batches')
    .select(BATCH_COLUMNS)
    .eq('id', batchId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw new Error('Could not load the import');
  return (data as unknown as ImportBatchView | null) ?? null;
}

export async function listImportBatches(storeId: string, limit = 20): Promise<ImportBatchView[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('product_import_batches')
    .select(BATCH_COLUMNS)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Could not load the import history');
  return (data ?? []) as unknown as ImportBatchView[];
}

const APPLY_ERRORS: Record<string, string> = {
  '42501': 'Only owners and managers can import products.',
  P0002: 'Something in the catalogue changed after the preview. Preview the file again.',
  '23505': 'A product or variant SKU now exists. Preview the file again.',
  '23514': 'A price check failed, so nothing was changed. Preview the file again.',
};

export type ConfirmResult = { ok: true; summary: Record<string, number> } | { ok: false; error: string };

/**
 * Applies an open batch. The database applies every row in one transaction; any failure leaves the catalogue
 * unchanged and the batch open. An applied batch returns its stored summary.
 */
export async function confirmImport(input: { storeId: string; actorId: string; batchId: string }): Promise<ConfirmResult> {
  const admin = createSupabaseAdminClient();
  const { data: batch, error: lookupError } = await admin
    .from('product_import_batches')
    .select('id')
    .eq('id', input.batchId)
    .eq('store_id', input.storeId)
    .maybeSingle();
  if (lookupError || !batch) return { ok: false, error: 'This import was not found.' };

  const { data, error } = await admin.rpc('product_import_apply', { p_batch: input.batchId, p_actor: input.actorId });
  if (error) {
    const code = error.code ?? '';
    const message = code === 'P0001' ? error.message : APPLY_ERRORS[code];
    return { ok: false, error: message ?? 'The import could not be applied. Nothing was changed, so you can confirm it again.' };
  }
  return { ok: true, summary: (data ?? {}) as Record<string, number> };
}

export { IMPORT_LIMITS };
