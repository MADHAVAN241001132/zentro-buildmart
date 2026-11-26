'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ensureGuestSession, readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import {
  ListError,
  addToComparison,
  addToWishlist,
  addProductsToCart,
  removeFromComparison,
  removeFromWishlist,
} from '@/lib/services/guest-lists';
import { cleanProductIds, safeReturnPath } from '@/lib/lists/compare-rules';

export interface ListState {
  ok: boolean;
  message?: string;
}

const INTENTS = ['wishlist-add', 'wishlist-remove', 'compare-add', 'compare-remove'] as const;
type ToggleIntent = (typeof INTENTS)[number];

/** The store slug posted by the form. Only a well-formed slug is accepted; anything else is refused. */
function slugFrom(formData: FormData): string | null {
  const value = text(formData, 'storeSlug');
  return /^[a-z0-9-]{3,40}$/.test(value) ? value : null;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function failure(error: unknown): string {
  return error instanceof ListError ? (error as ListError).message : 'Something went wrong. Please try again.';
}

/**
 * Save or remove one product from the wishlist or comparison, from a product card or detail page.
 * Returns a message for the button to show; the page data is refreshed for the whole storefront (header counts too).
 */
export async function toggleListAction(_prev: ListState, formData: FormData): Promise<ListState> {
  const storeSlug = slugFrom(formData);
  if (!storeSlug) return { ok: false, message: 'This showroom is not open.' };
  const intent = text(formData, 'intent') as ToggleIntent;
  const productIds = cleanProductIds([text(formData, 'productId')]);
  if (!(INTENTS as readonly string[]).includes(intent) || productIds.length !== 1) return { ok: false, message: 'That product could not be found.' };
  const productId = productIds[0]!;
  try {
    const store = await getStoreBySlug(storeSlug);
    if (!store) return { ok: false, message: 'This showroom is not open.' };
    if (intent === 'wishlist-add' || intent === 'compare-add') {
      const session = await ensureGuestSession(store.id, storeSlug);
      if (intent === 'wishlist-add') await addToWishlist(store.id, session.id, productId);
      else await addToComparison(store.id, session.id, productId);
    } else {
      const session = await readGuestSession(store.id, storeSlug);
      if (session) {
        if (intent === 'wishlist-remove') await removeFromWishlist(store.id, session.id, [productId]);
        else await removeFromComparison(store.id, session.id, [productId]);
      }
    }
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
  revalidatePath(`/store/${storeSlug}`, 'layout');
  const saved = intent === 'wishlist-add' ? 'Saved to your wishlist' : intent === 'compare-add' ? 'Added to comparison' : intent === 'wishlist-remove' ? 'Removed from your wishlist' : 'Removed from comparison';
  return { ok: true, message: saved };
}

/**
 * Bulk actions from the wishlist and comparison pages. Products come from the single productId field or from
 * the selected checkboxes. Returns to the same page with counts; it never redirects outside the store.
 */
export async function listPageAction(formData: FormData): Promise<void> {
  const storeSlug = slugFrom(formData);
  if (!storeSlug) redirect('/');
  const returnTo = safeReturnPath(storeSlug, formData.get('returnTo'));
  const intent = text(formData, 'intent');
  const ids = cleanProductIds([...formData.getAll('productId'), ...formData.getAll('selected')]);
  const params = new URLSearchParams();
  try {
    const store = await getStoreBySlug(storeSlug);
    if (!store) throw new ListError('This showroom is not open.');
    if (ids.length === 0) throw new ListError('Select at least one product.');

    if (intent === 'wishlist-remove') {
      const session = await readGuestSession(store.id, storeSlug);
      if (session) await removeFromWishlist(store.id, session.id, ids);
      params.set('notice', `Removed ${ids.length} from your wishlist.`);
    } else if (intent === 'wishlist-move') {
      const session = await readGuestSession(store.id, storeSlug);
      if (!session) throw new ListError('Your wishlist is empty.');
      const result = await addProductsToCart(store.id, session.id, ids);
      await removeFromWishlist(store.id, session.id, result.moved);
      params.set('notice', summary('Moved to your cart', result.moved.length, result.skipped));
    } else if (intent === 'compare-remove') {
      const session = await readGuestSession(store.id, storeSlug);
      if (session) await removeFromComparison(store.id, session.id, ids);
      params.set('notice', `Removed ${ids.length} from comparison.`);
    } else if (intent === 'compare-move') {
      const session = await readGuestSession(store.id, storeSlug);
      if (!session) throw new ListError('Your comparison is empty.');
      const result = await addProductsToCart(store.id, session.id, ids);
      params.set('notice', summary('Added to your cart', result.moved.length, result.skipped));
    } else {
      throw new ListError('That action is not available.');
    }
  } catch (error) {
    params.set('error', failure(error));
  }
  revalidatePath(`/store/${storeSlug}`, 'layout');
  const query = params.toString();
  redirect(`${returnTo}${query ? `?${query}` : ''}`);
}

function summary(lead: string, moved: number, skipped: { name: string; reason: string }[]): string {
  const parts = [`${lead}: ${moved}.`];
  if (skipped.length > 0) parts.push(`Not added: ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`);
  return parts.join(' ').slice(0, 300);
}
