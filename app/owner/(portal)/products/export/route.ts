import { NextResponse } from 'next/server';
import { ownerPermissionForRoute, routeDeniedResponse } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { parseProductFilters } from '../product-filters';

export const dynamic = 'force-dynamic';

/** CSV export of the same filtered product list. RLS limits rows to the owner's store. */
export async function GET(request: Request) {
  let owner;
  try {
    owner = await ownerPermissionForRoute('product_management');
  } catch (error) {
    return routeDeniedResponse(error);
  }

  const url = new URL(request.url);
  const filters = parseProductFilters(Object.fromEntries(url.searchParams.entries()));
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('products')
    .select('sku, name, slug, status, visibility, gst_rate_bps, hsn_code, unit_of_sale, category:categories(name), brand:brands(name), product_variants(sku, label, sale_price_paise, cost_price_paise, mrp_paise, price_unit, is_default, is_active)')
    .eq('store_id', owner.storeId)
    .order('name', { ascending: true })
    .limit(5000);
  if (filters.q) query = query.textSearch('search_tsv', filters.q, { config: 'simple', type: 'websearch' });
  if (filters.category) query = query.eq('category_id', filters.category);
  if (filters.brand) query = query.eq('brand_id', filters.brand);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'export failed' }, { status: 500 });

  type Row = {
    sku: string; name: string; slug: string; status: string; visibility: string; gst_rate_bps: number; hsn_code: string | null;
    unit_of_sale: string; category: { name: string } | null; brand: { name: string } | null;
    product_variants: { sku: string; label: string; sale_price_paise: number; cost_price_paise: number; mrp_paise: number | null; price_unit: string; is_default: boolean; is_active: boolean }[];
  };
  const lines: (string | number | boolean | null)[][] = [];
  for (const p of (data ?? []) as unknown as Row[]) {
    for (const v of p.product_variants) {
      lines.push([
        p.sku, p.name, p.slug, p.status, p.visibility, p.category?.name ?? '', p.brand?.name ?? '',
        p.hsn_code, p.gst_rate_bps / 100, v.sku, v.label,
        (v.sale_price_paise / 100).toFixed(2), (v.cost_price_paise / 100).toFixed(2),
        v.mrp_paise === null ? '' : (v.mrp_paise / 100).toFixed(2), v.price_unit, v.is_default, v.is_active,
      ]);
    }
  }
  const body = toCsv(
    ['product_sku', 'product_name', 'slug', 'status', 'visibility', 'category', 'brand', 'hsn_code', 'gst_percent', 'variant_sku', 'variant_label', 'sale_price_inr', 'cost_price_inr', 'mrp_inr', 'price_unit', 'is_default', 'is_active'],
    lines,
  );
  return csvResponse(`products-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
