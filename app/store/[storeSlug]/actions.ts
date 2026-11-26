'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addToCartSchema, cartLineSchema, checkoutSchema, couponCodeSchema, firstIssue } from '@/lib/validation';
import { CartError, addToCart, removeCartItem, setCartCoupon, setCartQuantity } from '@/lib/services/cart';
import { CheckoutError, placeOrder } from '@/lib/services/checkout';
import { ensureGuestSession, readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the form must use a new checkout key (its details changed after a submission). */
  requestKey?: string;
}

const OK: ActionState = { ok: true };

function fail(message: string): ActionState {
  return { ok: false, message };
}

async function resolveStore(storeSlug: string) {
  const store = await getStoreBySlug(storeSlug);
  if (!store) throw new CartError('This showroom is not open for orders');
  return store;
}

function errorMessage(error: unknown): string {
  if (error instanceof CartError || error instanceof CheckoutError) return error.message;
  return 'Something went wrong. Please try again.';
}

export async function addToCartAction(storeSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = addToCartSchema.safeParse({
    variantId: formData.get('variantId'),
    quantity: formData.get('quantity') ?? 1,
  });
  if (!parsed.success) return fail('Choose a valid quantity');
  try {
    const store = await resolveStore(storeSlug);
    const session = await ensureGuestSession(store.id, storeSlug);
    await addToCart(store.id, session.id, parsed.data.variantId, parsed.data.quantity);
  } catch (error) {
    return fail(errorMessage(error));
  }
  revalidatePath(`/store/${storeSlug}/cart`);
  return { ...OK, message: 'Added to your cart' };
}

export async function updateCartLineAction(storeSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cartLineSchema.safeParse({ itemId: formData.get('itemId'), quantity: formData.get('quantity') });
  if (!parsed.success) return fail('Choose a valid quantity');
  try {
    const store = await resolveStore(storeSlug);
    const session = await readGuestSession(store.id, storeSlug);
    if (!session) return fail('Your cart is empty');
    await setCartQuantity(store.id, session.id, parsed.data.itemId, parsed.data.quantity);
  } catch (error) {
    return fail(errorMessage(error));
  }
  revalidatePath(`/store/${storeSlug}/cart`);
  return OK;
}

export async function removeCartLineAction(storeSlug: string, itemId: string): Promise<ActionState> {
  const parsed = cartLineSchema.pick({ itemId: true }).safeParse({ itemId });
  if (!parsed.success) return fail('Invalid item');
  try {
    const store = await resolveStore(storeSlug);
    const session = await readGuestSession(store.id, storeSlug);
    if (!session) return fail('Your cart is empty');
    await removeCartItem(store.id, session.id, parsed.data.itemId);
  } catch (error) {
    return fail(errorMessage(error));
  }
  revalidatePath(`/store/${storeSlug}/cart`);
  return OK;
}

/**
 * Applies a coupon to the guest's cart, or removes it when the code is blank. The database validates the code and
 * prices the cart; the browser's discount figure is never used.
 */
export async function applyCartCouponAction(storeSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = couponCodeSchema.safeParse(formData.get('code') ?? '');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Enter a valid coupon code');
  const code = parsed.data === '' ? null : parsed.data.toUpperCase();
  try {
    const store = await resolveStore(storeSlug);
    const session = await readGuestSession(store.id, storeSlug);
    if (!session) return fail('Your cart is empty');
    await setCartCoupon(store.id, session.id, code);
  } catch (error) {
    return fail(errorMessage(error));
  }
  revalidatePath(`/store/${storeSlug}/cart`);
  revalidatePath(`/store/${storeSlug}/checkout`);
  return { ...OK, message: code === null ? 'Coupon removed' : `Coupon ${code} applied` };
}

/**
 * Places the order and redirects to the order page. The order page shows either the online
 * payment step (Razorpay Checkout or the dev simulator) or the cash waiting screen.
 */
export async function placeOrderAction(storeSlug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = checkoutSchema.safeParse({
    customerName: formData.get('customerName'),
    customerMobile: formData.get('customerMobile'),
    customerEmail: formData.get('customerEmail') ?? '',
    method: formData.get('method'),
    supplyStateCode: formData.get('supplyStateCode') ?? '',
  });
  if (!parsed.success) return { ok: false, message: 'Please correct the highlighted fields', fieldErrors: firstIssue(parsed.error) };

  const requestKey = formData.get('request_key');
  if (typeof requestKey !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(requestKey)) {
    return fail('Please reload the checkout page and try again');
  }

  let orderNumber: string;
  try {
    const store = await resolveStore(storeSlug);
    const session = await readGuestSession(store.id, storeSlug);
    if (!session) return fail('Your cart is empty');
    const placed = await placeOrder(store, session, { ...parsed.data, requestKey });
    orderNumber = placed.orderNumber;
  } catch (error) {
    // A reused key with changed details needs a fresh key; the form adopts the one returned here.
    const reused = error instanceof CheckoutError && error.message.startsWith('Your details changed');
    return { ...fail(errorMessage(error)), ...(reused ? { requestKey: crypto.randomUUID() } : {}) };
  }
  revalidatePath(`/store/${storeSlug}/cart`);
  redirect(`/store/${storeSlug}/orders/${orderNumber}`);
}
