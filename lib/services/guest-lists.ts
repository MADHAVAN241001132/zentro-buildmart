import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { CartError, addToCart } from '@/lib/services/cart';
import { getProductDetailsByIds, type ProductDetail } from '@/lib/services/storefront';
import { planCartMoves, buildComparison, MAX_COMPARE, type CompareRow, type CompareInput } from '@/lib/lists/compare-rules';

/** A message that is safe to show to the guest. */
export class ListError extends Error {}

const UNIQUE_VIOLATION = '23505';
const SCOPE_VIOLATION = '42501';
const COMPARE_LIMIT = 'P0001';

function dbFailure(): never {
  throw new ListError('Something went wrong. Please try again.');
}

/** Product ids on the guest's wishlist, oldest first. */
export async function listWishlistIds(storeId: string, sessionId: string): Promise<string[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('guest_wishlist_items')
    .select('product_id')
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) dbFailure();
  return (data ?? []).map((row) => row.product_id as string);
}

export async function countWishlist(storeId: string, sessionId: string): Promise<number> {
  const { count, error } = await createSupabaseAdminClient()
    .from('guest_wishlist_items')
    .select('product_id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId);
  if (error) dbFailure();
  return count ?? 0;
}

/** The wishlist with current prices, stock and photographs. Products no longer sold are left out. */
export async function getWishlist(storeId: string, sessionId: string): Promise<ProductDetail[]> {
  const ids = await listWishlistIds(storeId, sessionId);
  return getProductDetailsByIds(storeId, ids);
}

export async function addToWishlist(storeId: string, sessionId: string, productId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('guest_wishlist_items')
    .insert({ store_id: storeId, guest_session_id: sessionId, product_id: productId });
  if (error && error.code !== UNIQUE_VIOLATION) {
    if (error.code === SCOPE_VIOLATION) throw new ListError('This product is not available in this showroom.');
    dbFailure();
  }
}

export async function removeFromWishlist(storeId: string, sessionId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  const { error } = await createSupabaseAdminClient()
    .from('guest_wishlist_items')
    .delete()
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .in('product_id', productIds);
  if (error) dbFailure();
}

export async function listComparisonIds(storeId: string, sessionId: string): Promise<string[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('guest_compare_items')
    .select('product_id')
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) dbFailure();
  return (data ?? []).map((row) => row.product_id as string);
}

export async function countComparison(storeId: string, sessionId: string): Promise<number> {
  return (await listComparisonIds(storeId, sessionId)).length;
}

export async function getComparison(storeId: string, sessionId: string): Promise<ProductDetail[]> {
  const ids = await listComparisonIds(storeId, sessionId);
  return getProductDetailsByIds(storeId, ids);
}

/** Adds a product to the comparison. The database enforces the limit of four and the store scope. */
export async function addToComparison(storeId: string, sessionId: string, productId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('guest_compare_items')
    .insert({ store_id: storeId, guest_session_id: sessionId, product_id: productId });
  if (!error || error.code === UNIQUE_VIOLATION) return;
  if (error.code === COMPARE_LIMIT) throw new ListError(`You can compare up to ${MAX_COMPARE} products. Remove one to add another.`);
  if (error.code === SCOPE_VIOLATION) throw new ListError('This product is not available in this showroom.');
  dbFailure();
}

export async function removeFromComparison(storeId: string, sessionId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  const { error } = await createSupabaseAdminClient()
    .from('guest_compare_items')
    .delete()
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .in('product_id', productIds);
  if (error) dbFailure();
}

/** The comparison table for the current selection. */
export async function getComparisonTable(storeId: string, sessionId: string): Promise<{ products: ProductDetail[]; rows: CompareRow[] }> {
  const products = await getComparison(storeId, sessionId);
  const inputs: CompareInput[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    material: p.material,
    finish: p.finish,
    colour: p.colour,
    application: p.application,
    warrantyMonths: p.warrantyMonths,
    gstRateBps: p.gstRateBps,
    sizeLabel: p.defaultVariant?.sizeLabel ?? null,
    priceUnit: p.defaultVariant?.priceUnit ?? p.unitOfSale,
    salePricePaise: p.defaultVariant?.salePricePaise ?? null,
    mrpPaise: p.defaultVariant?.mrpPaise ?? null,
    availableUnits: p.defaultVariant?.availableUnits ?? 0,
    specs: p.specs,
  }));
  return { products, rows: buildComparison(inputs) };
}

export interface CartMoveResult {
  moved: string[];
  skipped: { productId: string; name: string; reason: string }[];
}

/**
 * Adds the default variant of each selected product to the cart, one unit each. Every line goes through the
 * cart's own price, stock and quantity checks. Products that cannot be added are reported, not silently dropped.
 */
export async function addProductsToCart(storeId: string, sessionId: string, productIds: string[]): Promise<CartMoveResult> {
  const products = await getProductDetailsByIds(storeId, productIds);
  const plan = planCartMoves(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      variantId: p.defaultVariant?.id ?? null,
      availableUnits: p.defaultVariant?.availableUnits ?? 0,
    })),
  );
  const skipped = [...plan.skipped];
  const moved: string[] = [];
  for (const line of plan.toCart) {
    try {
      await addToCart(storeId, sessionId, line.variantId, 1);
      moved.push(line.productId);
    } catch (error) {
      const name = products.find((p) => p.id === line.productId)?.name ?? 'Product';
      skipped.push({
        productId: line.productId,
        name,
        reason: error instanceof CartError ? (error as CartError).message : 'Could not add this product to your cart.',
      });
    }
  }
  return { moved, skipped };
}
