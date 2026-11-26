'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { MAX_GUEST_REQUEST_LINES, MAX_QUOTE_QUANTITY, normaliseMobile } from '@/lib/quotations/quotation-input';
import { ensureGuestSession, readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import {
  QuotationError,
  cartLinesForQuotation,
  convertQuotation,
  guestRequestQuotation,
  guestWithdrawQuotation,
  respondToQuotation,
} from '@/lib/services/quotations';

export interface GuestQuoteState {
  ok: boolean;
  message?: string;
}

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isRedirect(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'digest' in cause && String((cause as { digest: unknown }).digest).startsWith('NEXT_REDIRECT');
}

function messageOf(cause: unknown): string {
  if (cause instanceof QuotationError) return cause.message;
  return 'Something went wrong. Please try again.';
}

async function storeOrThrow(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store) throw new QuotationError('Store not found.', 404);
  return store;
}

/** Submits a quotation request from the cart (when source is "cart") or from one product (source "variant"). */
export async function requestQuotation(_prev: GuestQuoteState, formData: FormData): Promise<GuestQuoteState> {
  const slug = text(formData, 'storeSlug');
  const customerName = text(formData, 'customerName');
  const mobile = normaliseMobile(text(formData, 'customerMobile'));
  if (customerName.length < 2) return { ok: false, message: 'Enter your name.' };
  if (!mobile) return { ok: false, message: 'Enter a valid 10-digit mobile number.' };

  try {
    const store = await storeOrThrow(slug);
    const session = await ensureGuestSession(store.id, slug);
    let lines: { variantId: string; quantity: number }[];
    if (text(formData, 'source') === 'variant') {
      const variantId = text(formData, 'variantId');
      const quantity = Number(text(formData, 'quantity') || '1');
      if (!/^[0-9a-f-]{36}$/i.test(variantId) || !(quantity > 0) || quantity > MAX_QUOTE_QUANTITY) {
        return { ok: false, message: 'Choose a product and a quantity above 0.' };
      }
      lines = [{ variantId, quantity }];
    } else {
      const cart = await cartLinesForQuotation(store.id, session.id);
      lines = cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity }));
    }
    if (lines.length === 0) return { ok: false, message: 'Your cart is empty. Add products or request a quotation from a product page.' };
    if (lines.length > MAX_GUEST_REQUEST_LINES) return { ok: false, message: `A request can have at most ${MAX_GUEST_REQUEST_LINES} products.` };

    const id = await guestRequestQuotation(store.id, session.id, {
      customerName,
      customerMobile: mobile,
      customerEmail: text(formData, 'customerEmail') || null,
      projectName: text(formData, 'projectName') || null,
      requirements: text(formData, 'requirements') || null,
      deliveryAddress: text(formData, 'deliveryAddress') || null,
      deliveryExpectation: text(formData, 'deliveryExpectation') || null,
      lines,
    });
    revalidatePath(`/store/${slug}/quotes`);
    redirect(`/store/${slug}/quotes/${id}`);
  } catch (cause) {
    if (isRedirect(cause)) throw cause;
    return { ok: false, message: messageOf(cause) };
  }
}

/** Withdraw, accept, reject, or convert. Authority is the guest session (own quotations) or the share token. */
export async function quotationCustomerAction(_prev: GuestQuoteState, formData: FormData): Promise<GuestQuoteState> {
  const slug = text(formData, 'storeSlug');
  const quotationId = text(formData, 'quotationId');
  const token = text(formData, 'token') || null;
  const intent = text(formData, 'intent');
  try {
    const store = await storeOrThrow(slug);
    const session = token ? null : await readGuestSession(store.id, slug);
    if (!token && !session) return { ok: false, message: 'Quotation not found.' };

    if (intent === 'withdraw') {
      if (!session) return { ok: false, message: 'Quotation not found.' };
      await guestWithdrawQuotation(store.id, session.id, quotationId);
      revalidatePath(`/store/${slug}/quotes`);
      return { ok: true, message: 'Request withdrawn.' };
    }
    if (intent === 'accept' || intent === 'reject') {
      const note = text(formData, 'note') || null;
      const outcome = await respondToQuotation({ storeId: store.id, quotationId, sessionId: session?.id ?? null, token, decision: intent, note });
      if (outcome === 'EXPIRED') return { ok: false, message: 'This quotation has expired. Ask the store for a new one.' };
      revalidatePath(`/store/${slug}/quotes`);
      return { ok: true, message: intent === 'accept' ? 'Accepted. You can now place the order.' : 'Rejected. The store has been told.' };
    }
    if (intent === 'convert-online' || intent === 'convert-cash') {
      const guest = token ? await ensureGuestSession(store.id, slug) : session!;
      const result = await convertQuotation({
        storeId: store.id,
        quotationId,
        method: intent === 'convert-online' ? 'online' : 'cash',
        actorId: null,
        sessionId: guest.id,
        token,
      });
      revalidatePath(`/store/${slug}/quotes`);
      redirect(`/store/${slug}/orders/${result.orderNumber}`);
    }
    return { ok: false, message: 'Unknown action.' };
  } catch (cause) {
    if (isRedirect(cause)) throw cause;
    return { ok: false, message: messageOf(cause) };
  }
}
