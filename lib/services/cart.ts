import 'server-only';
import { friendly } from '@/lib/errors';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { priceCart, type OrderTotals } from '@/lib/pricing';
import { storeTaxMode } from '@/lib/gst/policy';
import { orderProductPhotos } from '@/lib/storage/photo-order';

export class CartError extends Error {}

export const MAX_LINE_QUANTITY = 999;

export interface CartLine {
  itemId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  priceUnit: string;
  unitPricePaise: number;
  costPricePaise: number;
  gstRateBps: number;
  hsnCode: string | null;
  quantity: number;
  availableUnits: number;
  slug: string;
  /** Primary product photograph for the cart and checkout, or null when none has been uploaded. */
  imageUrl: string | null;
}

export interface CartCoupon {
  code: string;
  /** Order-level discount from the database quote. Zero while the coupon has an error. */
  discountPaise: number;
  /** Why the coupon cannot be used right now. Checkout refuses to place the order while this is set. */
  error: string | null;
}

export type PricingMode = 'inclusive' | 'exclusive' | 'not_collected';

export interface CartView {
  cartId: string | null;
  lines: CartLine[];
  totals: OrderTotals | null;
  itemCount: number;
  coupon: CartCoupon | null;
  /** How the configured prices relate to GST for this showroom. Drives the breakdown labels. */
  pricingMode: PricingMode;
}

interface CouponQuote {
  discount_paise: number;
  lines: { cart_item_id: string; discount_paise: number }[];
}

/**
 * Asks the database for the coupon's discount on this cart and each line's share. The quote covers every cart item,
 * so it can only be used when every item is visible and priced. Otherwise the coupon reports an error instead.
 */
async function quoteCoupon(cartId: string, code: string, visibleItemIds: string[]): Promise<CouponQuote> {
  const { data, error } = await createSupabaseAdminClient().rpc('guest_cart_coupon_quote', { p_cart: cartId, p_code: code });
  if (error) throw new CartError(friendly(error.message));
  const quote = data as CouponQuote;
  const quoted = new Set(quote.lines.map((line) => line.cart_item_id));
  if (quote.lines.length !== visibleItemIds.length || visibleItemIds.some((id) => !quoted.has(id))) {
    throw new CartError('An item in your cart is no longer available. Remove it to use this coupon.');
  }
  return quote;
}

async function readCouponCode(cartId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient().from('carts').select('coupon_code').eq('id', cartId).maybeSingle();
  if (error) throw new Error('Could not read cart');
  return (data?.coupon_code as string | null) ?? null;
}

interface RawCartItem {
  id: string;
  quantity: number;
  variant_id: string;
  product_variants: {
    id: string;
    sku: string;
    label: string;
    price_unit: string;
    sale_price_paise: number;
    cost_price_paise: number;
    is_active: boolean;
    products: {
      name: string;
      slug: string;
      hsn_code: string | null;
      gst_rate_bps: number;
      status: string;
      visibility: string;
      images: { public_url: string; alt_text: string | null; is_primary: boolean; sort_order: number }[] | null;
    } | null;
    inventory: { on_hand: number; reserved: number }[] | { on_hand: number; reserved: number } | null;
  } | null;
}

type InventoryRows = { on_hand: number; reserved: number }[] | { on_hand: number; reserved: number } | null;

function available(inventory: InventoryRows): number {
  if (!inventory) return 0;
  const rows = Array.isArray(inventory) ? inventory : [inventory];
  return rows.reduce((sum, row) => sum + Math.max(0, row.on_hand - row.reserved), 0);
}

async function findActiveCart(storeId: string, guestSessionId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('carts')
    .select('id')
    .eq('store_id', storeId)
    .eq('guest_session_id', guestSessionId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error('Could not read cart');
  return data ? (data.id as string) : null;
}

/** Full cart with live prices and stock. Prices are always read from the database, never from the client. */
/** The store's pricing basis, read the same way checkout reads it (migrations 0058 and 0060). */
async function readPricing(storeId: string): Promise<{ taxCollected: boolean; inclusive: boolean }> {
  const { data, error } = await createSupabaseAdminClient()
    .from('stores')
    .select('gst_registration, gstin, state_code, prices_include_gst')
    .eq('id', storeId)
    .maybeSingle();
  if (error || !data) throw new CartError('We could not load this showroom. Please try again.');
  const taxCollected = storeTaxMode({
    gst_registration: data.gst_registration,
    gstin: data.gstin,
    state_code: data.state_code,
  }) === 'taxed';
  return { taxCollected, inclusive: Boolean(data.prices_include_gst) && taxCollected };
}

export async function getCartView(storeId: string, guestSessionId: string): Promise<CartView> {
  const cartId = await findActiveCart(storeId, guestSessionId);
  if (!cartId) return { cartId: null, lines: [], totals: null, itemCount: 0, coupon: null, pricingMode: 'exclusive' };

  const { data, error } = await createSupabaseAdminClient()
    .from('cart_items')
    .select(
      `id, quantity, variant_id,
       product_variants(id, sku, label, price_unit, sale_price_paise, cost_price_paise, is_active,
         products(name, slug, hsn_code, gst_rate_bps, status, visibility, images:product_images(public_url, alt_text, is_primary, sort_order)),
         inventory(on_hand, reserved))`,
    )
    .eq('cart_id', cartId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Could not load cart');

  const rows = ((data ?? []) as unknown as RawCartItem[]).filter(
    (row) => row.product_variants?.products?.status === 'active' && row.product_variants?.products?.visibility === 'public',
  );
  const lines: CartLine[] = rows.map((row) => {
    const variant = row.product_variants!;
    const product = variant.products!;
    return {
      itemId: row.id,
      variantId: row.variant_id,
      productName: product.name,
      imageUrl: orderProductPhotos(product.images, product.name)[0]?.url ?? null,
      variantLabel: variant.label,
      sku: variant.sku,
      priceUnit: variant.price_unit,
      unitPricePaise: variant.sale_price_paise,
      costPricePaise: variant.cost_price_paise,
      gstRateBps: product.gst_rate_bps,
      hsnCode: product.hsn_code,
      quantity: row.quantity,
      availableUnits: available(variant.inventory),
      slug: product.slug,
    };
  });

  const pricingLines = lines.map((l) => ({ key: l.itemId, unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBps: l.gstRateBps }));
  // Only a regular store with a valid GSTIN collects GST (migration 0058). Inclusive prices extract the tax after
  // discount (migration 0060). The preview uses the same policy the database verifies at checkout.
  const pricing = lines.length ? await readPricing(storeId) : { taxCollected: true, inclusive: false };
  const code = lines.length ? await readCouponCode(cartId) : null;

  let coupon: CartCoupon | null = null;
  let totals: OrderTotals | null = lines.length ? priceCart(pricingLines, pricing) : null;
  if (code && lines.length) {
    try {
      const quote = await quoteCoupon(cartId, code, lines.map((l) => l.itemId));
      const shares = new Map(quote.lines.map((line) => [line.cart_item_id, line.discount_paise]));
      totals = priceCart(pricingLines, {
        ...pricing,
        discountPaise: quote.discount_paise,
        lineDiscountsPaise: lines.map((l) => shares.get(l.itemId) ?? 0),
      });
      coupon = { code, discountPaise: quote.discount_paise, error: null };
    } catch (cause) {
      coupon = { code, discountPaise: 0, error: cause instanceof Error ? cause.message : 'This coupon cannot be used' };
    }
  }
  const pricingMode: PricingMode = !pricing.taxCollected ? 'not_collected' : pricing.inclusive ? 'inclusive' : 'exclusive';
  return { cartId, lines, totals, itemCount: lines.reduce((sum, l) => sum + l.quantity, 0), coupon, pricingMode };
}

/**
 * Applies or removes a coupon on the guest's cart. The code is validated by the database quote before it is saved,
 * so an invalid, expired or exhausted code is refused here rather than at checkout.
 */
export async function setCartCoupon(storeId: string, guestSessionId: string, code: string | null): Promise<void> {
  const cartId = await findActiveCart(storeId, guestSessionId);
  if (!cartId) throw new CartError('Your cart is empty');
  const admin = createSupabaseAdminClient();

  if (code === null) {
    const { error } = await admin.from('carts').update({ coupon_code: null, updated_at: new Date().toISOString() }).eq('id', cartId);
    if (error) throw new Error('Could not remove the coupon');
    return;
  }

  const { data: visible } = await admin
    .from('cart_items')
    .select('id, product_variants(is_active, products(status, visibility))')
    .eq('cart_id', cartId);
  const visibleIds = ((visible ?? []) as unknown as {
    id: string;
    product_variants: { is_active: boolean; products: { status: string; visibility: string } | null } | null;
  }[])
    .filter(
      (row) =>
        row.product_variants?.is_active === true &&
        row.product_variants.products?.status === 'active' &&
        row.product_variants.products.visibility === 'public',
    )
    .map((row) => row.id);
  if (visibleIds.length === 0) throw new CartError('Add an item to your cart before applying a coupon');

  const normalised = code.trim().toUpperCase();
  await quoteCoupon(cartId, normalised, visibleIds);
  const { error } = await admin
    .from('carts')
    .update({ coupon_code: normalised, updated_at: new Date().toISOString() })
    .eq('id', cartId);
  if (error) throw new Error('Could not apply the coupon');
}

function validQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    throw new CartError(`Quantity must be a whole number from 1 to ${MAX_LINE_QUANTITY}`);
  }
  return quantity;
}

async function loadVariantForStore(storeId: string, variantId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('product_variants')
    .select('id, store_id, is_active, sale_price_paise, products(status, visibility), inventory(on_hand, reserved)')
    .eq('id', variantId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw new Error('Could not read product');
  if (!data) throw new CartError('This product is not available in this store');
  const row = data as unknown as {
    is_active: boolean;
    products: { status: string; visibility: string } | null;
    inventory: { on_hand: number; reserved: number }[] | { on_hand: number; reserved: number } | null;
  };
  if (!row.is_active || row.products?.status !== 'active' || row.products.visibility !== 'public') {
    throw new CartError('This product is no longer available');
  }
  return { availableUnits: available(row.inventory) };
}

/**
 * Adds units of a variant to the guest cart, or increases the quantity if the line exists. The database performs the
 * product, stock and quantity checks and the mutation under row locks, so concurrent adds never lose a quantity.
 */
export async function addToCart(storeId: string, guestSessionId: string, variantId: string, quantity: number): Promise<void> {
  const requested = validQuantity(quantity);
  const { data, error } = await createSupabaseAdminClient().rpc('guest_cart_add_line', {
    p_store: storeId, p_session: guestSessionId, p_variant: variantId, p_quantity: requested,
  });
  if (error) throw new Error('Could not update cart');
  const outcome = data as { outcome: string; message?: string } | null;
  if (!outcome || outcome.outcome !== 'added') throw new CartError(outcome?.message ?? 'This item could not be added');
}

async function ownLine(storeId: string, guestSessionId: string, itemId: string) {
  const cartId = await findActiveCart(storeId, guestSessionId);
  if (!cartId) throw new CartError('Your cart is empty');
  const { data, error } = await createSupabaseAdminClient()
    .from('cart_items')
    .select('id, variant_id')
    .eq('id', itemId)
    .eq('cart_id', cartId)
    .maybeSingle();
  if (error) throw new Error('Could not read cart item');
  if (!data) throw new CartError('That item is no longer in your cart');
  return { id: data.id as string, variantId: data.variant_id as string };
}

export async function setCartQuantity(storeId: string, guestSessionId: string, itemId: string, quantity: number): Promise<void> {
  const requested = validQuantity(quantity);
  const line = await ownLine(storeId, guestSessionId, itemId);
  const { availableUnits } = await loadVariantForStore(storeId, line.variantId);
  if (Math.ceil(requested) > availableUnits) {
    throw new CartError(availableUnits > 0 ? `Only ${availableUnits} left in stock` : 'This item is out of stock');
  }
  const { error } = await createSupabaseAdminClient().from('cart_items').update({ quantity: requested }).eq('id', line.id);
  if (error) throw new Error('Could not update quantity');
}

export async function removeCartItem(storeId: string, guestSessionId: string, itemId: string): Promise<void> {
  const line = await ownLine(storeId, guestSessionId, itemId);
  const { error } = await createSupabaseAdminClient().from('cart_items').delete().eq('id', line.id);
  if (error) throw new Error('Could not remove item');
}
