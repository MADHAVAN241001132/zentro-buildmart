import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cleanSearch } from '@/lib/validation/pos';

export interface VariantHit {
  id: string;
  sku: string;
  label: string;
  productName: string;
  salePaise: number;
  gstRateBps: number;
}

interface VariantRow {
  id: string;
  sku: string;
  label: string;
  sale_price_paise: number;
  products: { name: string; gst_rate_bps: number } | { name: string; gst_rate_bps: number }[] | null;
}

const VARIANT_SELECT = 'id, sku, label, sale_price_paise, products!inner(name, gst_rate_bps, status)';

function toHit(row: VariantRow): VariantHit {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return {
    id: row.id,
    sku: row.sku,
    label: row.label,
    productName: product?.name ?? '',
    salePaise: Number(row.sale_price_paise),
    gstRateBps: Number(product?.gst_rate_bps ?? 0),
  };
}

/** Active variants of active products, matched on SKU, variant label or product name. RLS limits rows to the owner's store. */
export async function searchVariants(term: string): Promise<VariantHit[]> {
  const q = cleanSearch(term);
  if (q.length < 2) return [];
  const supabase = await createSupabaseServerClient();
  const [bySku, products] = await Promise.all([
    supabase
      .from('product_variants')
      .select(VARIANT_SELECT)
      .eq('is_active', true)
      .eq('products.status', 'active')
      .or(`sku.ilike.%${q}%,label.ilike.%${q}%`)
      .limit(20),
    supabase.from('products').select('id').eq('status', 'active').ilike('name', `%${q}%`).limit(20),
  ]);
  const productIds = ((products.data ?? []) as { id: string }[]).map((p) => p.id);
  let byProduct: VariantRow[] = [];
  if (productIds.length > 0) {
    const { data } = await supabase
      .from('product_variants')
      .select(VARIANT_SELECT)
      .eq('is_active', true)
      .eq('products.status', 'active')
      .in('product_id', productIds)
      .limit(40);
    byProduct = (data ?? []) as VariantRow[];
  }
  const hits = new Map<string, VariantHit>();
  for (const row of [...((bySku.data ?? []) as VariantRow[]), ...byProduct]) {
    if (!hits.has(row.id)) hits.set(row.id, toHit(row));
  }
  return [...hits.values()].slice(0, 30);
}

/** Barcode lookup: the SKU is the barcode. Returns a hit only when exactly one active variant matches. */
export async function findVariantBySku(sku: string): Promise<VariantHit | null> {
  const q = cleanSearch(sku);
  if (!q) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('product_variants')
    .select(VARIANT_SELECT)
    .eq('is_active', true)
    .eq('products.status', 'active')
    .ilike('sku', q)
    .limit(2);
  const rows = (data ?? []) as VariantRow[];
  return rows.length === 1 && rows[0] ? toHit(rows[0]) : null;
}
