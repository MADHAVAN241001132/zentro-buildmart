'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerPermission } from '@/lib/services/owner';
import {
  confirmRefundNotSent,
  createOrderRefund,
  reconcileGatewayRefund,
  retryPendingRefund,
  RefundError,
  type RefundLineInput,
} from '@/lib/services/refunds';
import { uuidSchema } from '@/lib/validation';

export interface RefundState {
  ok: boolean;
  message?: string;
}

const KEY = /^[A-Za-z0-9-]{8,80}$/;
const MAX_QTY = 999;

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * Records a refund for an order (POS or guest). Quantities are read from the form, but the database decides what can be
 * returned, what it is worth, and whether it can be refunded at all. The request key makes a double submit harmless.
 */
export async function refundOrderAction(_prev: RefundState, fd: FormData): Promise<RefundState> {
  const owner = await requireOwnerPermission('refund_management');

  const orderId = uuidSchema.safeParse(text(fd, 'orderId'));
  if (!orderId.success) return { ok: false, message: 'This order could not be found' };
  const reason = text(fd, 'reason').trim();
  if (reason.length < 3 || reason.length > 200) return { ok: false, message: 'Give a reason of 3 to 200 characters' };
  const requestKey = text(fd, 'requestKey');
  if (!KEY.test(requestKey)) return { ok: false, message: 'The form expired. Reload the page and try again' };

  const lines: RefundLineInput[] = [];
  for (const key of fd.keys()) {
    if (!key.startsWith('qty:')) continue;
    const itemId = key.slice(4);
    if (!uuidSchema.safeParse(itemId).success) return { ok: false, message: 'A line is invalid. Reload the page' };
    const raw = text(fd, key).trim();
    if (raw === '' || raw === '0') continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return { ok: false, message: 'Returned quantities must be whole numbers' };
    }
    const condition = text(fd, `cond:${itemId}`) === 'damaged' ? 'damaged' : 'restock';
    lines.push({ orderItemId: itemId, quantity, condition });
  }
  if (lines.length === 0) return { ok: false, message: 'Enter how many units of at least one item are returned' };

  try {
    const outcome = await createOrderRefund({
      actorId: owner.userId,
      orderId: orderId.data,
      lines,
      reason,
      requestKey,
    });
    revalidatePath(`/owner/orders/${orderId.data}/refund`);
    revalidatePath('/owner/orders');
    return { ok: outcome.status !== 'failed', message: outcome.message };
  } catch (cause) {
    return { ok: false, message: cause instanceof RefundError ? cause.message : 'Could not record the refund. Nothing was changed.' };
  }
}

/**
 * Checks an unresolved Razorpay refund against Razorpay's own list of refunds and acts on what it finds.
 * Owners and managers only. Every check is audited.
 */
export async function reconcileRefundAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('refund_management');
  const orderId = uuidSchema.safeParse(text(fd, 'orderId'));
  const refundId = uuidSchema.safeParse(text(fd, 'refundId'));
  if (!orderId.success || !refundId.success) redirect('/owner/orders');
  let message: string;
  try {
    const result = await reconcileGatewayRefund({ storeId: owner.storeId, actorId: owner.userId, refundId: refundId.data });
    message = result.message;
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Could not check this refund with Razorpay';
  }
  revalidatePath(`/owner/orders/${orderId.data}/refund`);
  revalidatePath('/owner/orders');
  redirect(`/owner/orders/${orderId.data}/refund?notice=${encodeURIComponent(message)}`);
}

/**
 * Confirms that Razorpay holds no refund for an unresolved request, releasing its units. Requires a reason of at least
 * three characters. Razorpay's list is checked again inside the action, and the database enforces a 15-minute wait.
 */
export async function confirmNotSentAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('refund_management');
  const orderId = uuidSchema.safeParse(text(fd, 'orderId'));
  const refundId = uuidSchema.safeParse(text(fd, 'refundId'));
  if (!orderId.success || !refundId.success) redirect('/owner/orders');
  const reason = text(fd, 'reason').trim();
  let message: string;
  if (reason.length < 3 || reason.length > 200) {
    message = 'Give a reason of 3 to 200 characters before confirming';
  } else {
    try {
      message = await confirmRefundNotSent({
        storeId: owner.storeId,
        actorId: owner.userId,
        refundId: refundId.data,
        reason,
        dashboardChecked: text(fd, 'dashboardChecked') === 'yes',
      });
    } catch (cause) {
      message = cause instanceof Error ? cause.message : 'Could not confirm this refund';
    }
  }
  revalidatePath(`/owner/orders/${orderId.data}/refund`);
  revalidatePath('/owner/orders');
  redirect(`/owner/orders/${orderId.data}/refund?notice=${encodeURIComponent(message)}`);
}

/** Sends a refund that has never been sent to Razorpay. Ambiguous refunds must be checked with Razorpay instead. */
export async function retryRefundAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('refund_management');
  const orderId = uuidSchema.safeParse(text(fd, 'orderId'));
  const refundId = uuidSchema.safeParse(text(fd, 'refundId'));
  if (!orderId.success || !refundId.success) {
    redirect('/owner/orders');
  }
  let message: string;
  try {
    const outcome = await retryPendingRefund(owner.storeId, refundId.data);
    message = outcome.message;
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Could not send the refund again';
  }
  revalidatePath(`/owner/orders/${orderId.data}/refund`);
  redirect(`/owner/orders/${orderId.data}/refund?notice=${encodeURIComponent(message)}`);
}
