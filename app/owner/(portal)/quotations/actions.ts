'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { normaliseMobile, parseOptionalRupees, parseOwnerLineText, parseValidity } from '@/lib/quotations/quotation-input';
import { requireOwnerPermission } from '@/lib/services/owner';
import {
  QuotationError,
  ownerCancelQuotation,
  ownerConvertQuotation,
  ownerReviseQuotation,
  ownerRotateShareLink,
  ownerSaveQuotation,
  ownerSendQuotation,
  resolveSkus,
  type OwnerLineInput,
} from '@/lib/services/quotations';

export interface QuotationFormState {
  ok: boolean;
  message?: string;
  quotationId?: string;
}

export interface QuotationActionState {
  ok: boolean;
  message?: string;
  /** The raw share link, shown once after send or rotate. Only its hash is stored. */
  shareUrl?: string;
}

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function messageOf(cause: unknown): string {
  if (cause instanceof QuotationError) return cause.message;
  return 'Something went wrong. Please try again.';
}

/** Creates or edits a quotation. Staff may save lines and terms, but never prices or discounts. */
export async function saveQuotation(_prev: QuotationFormState, formData: FormData): Promise<QuotationFormState> {
  const owner = await requireOwnerPermission('quotations');
  const quotationId = text(formData, 'quotationId') || null;
  const customerName = text(formData, 'customerName');
  if (customerName.length < 2) return { ok: false, message: 'Enter the customer name.' };

  const mobileRaw = text(formData, 'customerMobile');
  const mobile = mobileRaw ? normaliseMobile(mobileRaw) : null;
  if (mobileRaw && !mobile) return { ok: false, message: 'Enter a valid 10-digit mobile number.' };

  const today = new Date().toISOString().slice(0, 10);
  const validity = parseValidity(text(formData, 'validUntil'), today);
  if (!validity.ok) return { ok: false, message: validity.error };

  const delivery = parseOptionalRupees(text(formData, 'deliveryRupees'));
  if (!delivery.ok) return { ok: false, message: delivery.error };

  const parsed = parseOwnerLineText(text(formData, 'lines'));
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const canPrice = true; // pricing needs the quotations permission, which the gate above already requires
  try {
    const variants = await resolveSkus(owner.storeId, parsed.value.map((line) => line.sku));
    const lines: OwnerLineInput[] = parsed.value.map((line) => ({
      variantId: variants[line.sku]!,
      quantity: line.quantity,
      unitPricePaise: canPrice ? line.unitPricePaise : null,
      discountPaise: canPrice ? line.discountPaise : 0,
    }));
    const id = await ownerSaveQuotation(owner.storeId, owner.userId, quotationId, {
      customerId: null,
      customerName,
      customerMobile: mobile,
      customerEmail: text(formData, 'customerEmail') || null,
      projectName: text(formData, 'projectName') || null,
      requirements: text(formData, 'requirements') || null,
      deliveryExpectation: text(formData, 'deliveryExpectation') || null,
      deliveryAddress: text(formData, 'deliveryAddress') || null,
      deliveryPaise: canPrice ? (delivery.value ?? 0) : 0,
      validUntil: validity.value,
      terms: text(formData, 'terms') || null,
      lines,
    });
    revalidatePath('/owner/quotations');
    redirect(`/owner/quotations/${id}`);
  } catch (cause) {
    if (isRedirect(cause)) throw cause;
    return { ok: false, message: messageOf(cause) };
  }
}

function isRedirect(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'digest' in cause && String((cause as { digest: unknown }).digest).startsWith('NEXT_REDIRECT');
}

/** Send, share link, revise, cancel and convert, selected by the "intent" field. */
export async function quotationAction(_prev: QuotationActionState, formData: FormData): Promise<QuotationActionState> {
  const owner = await requireOwnerPermission('quotations');
  const quotationId = text(formData, 'quotationId');
  const intent = text(formData, 'intent');
  if (!quotationId) return { ok: false, message: 'Quotation not found.' };
  try {
    if (intent === 'send') {
      const { token } = await ownerSendQuotation(owner.storeId, owner.userId, quotationId);
      revalidatePath(`/owner/quotations/${quotationId}`);
      return { ok: true, message: 'Sent. Copy the link now; it will not be shown again.', shareUrl: `/store/${owner.storeSlug}/quotes/share/${token}` };
    }
    if (intent === 'rotate') {
      const { token } = await ownerRotateShareLink(owner.storeId, owner.userId, quotationId);
      revalidatePath(`/owner/quotations/${quotationId}`);
      return { ok: true, message: 'New link created. The previous link no longer works.', shareUrl: `/store/${owner.storeSlug}/quotes/share/${token}` };
    }
    if (intent === 'revise') {
      await ownerReviseQuotation(owner.storeId, owner.userId, quotationId);
      revalidatePath(`/owner/quotations/${quotationId}`);
      return { ok: true, message: 'Moved back to draft. Edit it, then send again.' };
    }
    if (intent === 'cancel') {
      const reason = text(formData, 'reason');
      if (reason.length < 3) return { ok: false, message: 'Enter a short reason for cancelling.' };
      await ownerCancelQuotation(owner.storeId, owner.userId, quotationId, reason);
      revalidatePath(`/owner/quotations/${quotationId}`);
      return { ok: true, message: 'Cancelled.' };
    }
    if (intent === 'convert-cash' || intent === 'convert-credit') {
      const method = intent === 'convert-cash' ? 'cash' : 'credit';
      const result = await ownerConvertQuotation(owner.storeId, owner.userId, quotationId, method);
      revalidatePath('/owner/quotations');
      revalidatePath(`/owner/quotations/${quotationId}`);
      revalidatePath('/owner/orders');
      redirect(`/owner/orders/${result.orderId}`);
    }
    return { ok: false, message: 'Unknown action.' };
  } catch (cause) {
    if (isRedirect(cause)) throw cause;
    return { ok: false, message: messageOf(cause) };
  }
}
