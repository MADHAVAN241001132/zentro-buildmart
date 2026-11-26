'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerPermission } from '@/lib/services/owner';
import { ownerApproveRefundRequest, ownerRejectRefundRequest } from '@/lib/services/refund-requests';
import { uuidSchema } from '@/lib/validation';

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

/** Approves a guest request. Owners and managers only; the service and database check the role again. */
export async function approveRefundRequestAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('refund_management');
  const requestId = uuidSchema.safeParse(text(fd, 'requestId'));
  if (!requestId.success) redirect('/owner/refund-requests');
  const base = `/owner/refund-requests/${requestId.data}`;

  const conditions: Record<string, 'restock' | 'damaged'> = {};
  for (const key of fd.keys()) {
    if (!key.startsWith('cond:')) continue;
    const itemId = key.slice(5);
    if (!uuidSchema.safeParse(itemId).success) redirect(`${base}?notice=${encodeURIComponent('An item is invalid. Reload the page.')}`);
    conditions[itemId] = text(fd, key) === 'damaged' ? 'damaged' : 'restock';
  }
  const noteRaw = text(fd, 'note').trim();
  if (noteRaw.length > 0 && noteRaw.length < 3) {
    redirect(`${base}?notice=${encodeURIComponent('Leave the note empty or write at least 3 characters.')}`);
  }

  let message: string;
  try {
    message = await ownerApproveRefundRequest({
      storeId: owner.storeId,
      actorId: owner.userId,
      requestId: requestId.data,
      conditions,
      note: noteRaw.length > 0 ? noteRaw : null,
    });
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'The request could not be approved. Nothing was refunded.';
  }
  revalidatePath(base);
  revalidatePath('/owner/refund-requests');
  redirect(`${base}?notice=${encodeURIComponent(message)}`);
}

/** Rejects a guest request. A reason of at least three characters is required so the guest knows why. */
export async function rejectRefundRequestAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('refund_management');
  const requestId = uuidSchema.safeParse(text(fd, 'requestId'));
  if (!requestId.success) redirect('/owner/refund-requests');
  const base = `/owner/refund-requests/${requestId.data}`;
  const note = text(fd, 'note').trim();

  let message: string;
  if (note.length < 3) {
    message = 'Give the customer a reason of at least 3 characters before rejecting.';
  } else {
    try {
      await ownerRejectRefundRequest({ storeId: owner.storeId, actorId: owner.userId, requestId: requestId.data, note });
      message = 'Request rejected. The customer can see your reply.';
    } catch (cause) {
      message = cause instanceof Error ? cause.message : 'The request could not be rejected.';
    }
  }
  revalidatePath(base);
  revalidatePath('/owner/refund-requests');
  redirect(`${base}?notice=${encodeURIComponent(message)}`);
}
