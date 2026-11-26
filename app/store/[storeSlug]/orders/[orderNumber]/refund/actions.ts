'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getGuestOrder } from '@/lib/services/checkout';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import {
  guestSubmitRefundRequest,
  guestWithdrawRefundRequest,
  REFUND_REASON_CODES,
  type RefundReasonCode,
} from '@/lib/services/refund-requests';
import { RefundError } from '@/lib/services/refunds';
import { uuidSchema } from '@/lib/validation';

export interface GuestRefundState {
  ok: boolean;
  message?: string;
}

const MAX_QTY = 999;

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * A guest asks for a refund of chosen items on their own order. This only records a request. Nothing is refunded until
 * the store approves it, and the store's approval uses the same refund path as the owner's own refunds.
 */
export async function submitGuestRefundAction(
  storeSlug: string,
  orderNumber: string,
  _prev: GuestRefundState,
  fd: FormData,
): Promise<GuestRefundState> {
  const store = await getStoreBySlug(storeSlug);
  if (!store) return { ok: false, message: 'This store could not be found.' };
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) return { ok: false, message: 'Your session has ended. Open your order again.' };
  const order = await getGuestOrder(store.id, session.id, orderNumber);
  if (!order) return { ok: false, message: 'This order could not be found.' };

  const reasonCode = text(fd, 'reasonCode');
  if (!(REFUND_REASON_CODES as readonly string[]).includes(reasonCode)) {
    return { ok: false, message: 'Choose a reason for the refund.' };
  }
  const reason = text(fd, 'reason').trim();
  if (reason.length < 3 || reason.length > 500) return { ok: false, message: 'Describe the reason in 3 to 500 characters.' };

  const lines: { orderItemId: string; quantity: number }[] = [];
  for (const key of fd.keys()) {
    if (!key.startsWith('qty:')) continue;
    const itemId = key.slice(4);
    if (!uuidSchema.safeParse(itemId).success) return { ok: false, message: 'One of the items is invalid. Reload the page.' };
    const raw = text(fd, key).trim();
    if (raw === '' || raw === '0') continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return { ok: false, message: 'Quantities must be whole numbers.' };
    }
    lines.push({ orderItemId: itemId, quantity });
  }
  if (lines.length === 0) return { ok: false, message: 'Choose how many of at least one item you want to return.' };

  try {
    await guestSubmitRefundRequest({
      storeId: store.id,
      sessionId: session.id,
      orderId: order.orderId,
      reasonCode: reasonCode as RefundReasonCode,
      reason,
      lines,
    });
  } catch (cause) {
    return { ok: false, message: cause instanceof RefundError ? cause.message : 'Your request could not be sent. Please try again.' };
  }
  revalidatePath(`/store/${storeSlug}/orders/${orderNumber}/refund`);
  return { ok: true, message: 'Your refund request has been sent to the store. You will see the decision on this page.' };
}

/** Withdraws the guest's own open request. Only the session that made it can withdraw it. */
export async function withdrawGuestRefundAction(storeSlug: string, orderNumber: string, fd: FormData): Promise<void> {
  const store = await getStoreBySlug(storeSlug);
  const requestId = uuidSchema.safeParse(text(fd, 'requestId'));
  const base = `/store/${storeSlug}/orders/${orderNumber}/refund`;
  if (!store || !requestId.success) redirect(base);
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) redirect(base);
  let notice = 'Your request was withdrawn.';
  try {
    await guestWithdrawRefundRequest({ sessionId: session.id, requestId: requestId.data });
  } catch (cause) {
    notice = cause instanceof Error ? cause.message : 'Your request could not be withdrawn.';
  }
  revalidatePath(base);
  redirect(`${base}?notice=${encodeURIComponent(notice)}`);
}
