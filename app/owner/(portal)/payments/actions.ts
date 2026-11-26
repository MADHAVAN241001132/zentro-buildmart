'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerPermission } from '@/lib/services/owner';
import { decideLatePayment, requestLatePaymentRefund, LatePaymentError } from '@/lib/services/late-payments';
import { uuidSchema } from '@/lib/validation';

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

function back(notice: string): string {
  return `/owner/payments?notice=${encodeURIComponent(notice)}`;
}

/** Records the owner's decision on a late payment. Moves no money; the database checks the owner's store. */
export async function decideLatePaymentAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('refund_management');
  const lateId = uuidSchema.safeParse(text(fd, 'lateId'));
  const decision = text(fd, 'decision');
  if (!lateId.success || !['refund', 'fulfil', 'dismiss'].includes(decision)) redirect(back('That late payment could not be found.'));
  try {
    await decideLatePayment({ actorId: owner.userId, lateId: lateId.data, decision: decision as 'refund' | 'fulfil' | 'dismiss', note: text(fd, 'note') });
  } catch (error) {
    redirect(back(error instanceof LatePaymentError ? error.message : 'The decision could not be recorded.'));
  }
  revalidatePath('/owner/payments');
  redirect(back('Decision recorded.'));
}

/** Starts the refund for a late payment whose decision is 'refund'. The refund engine enforces the state. */
export async function initiateLateRefundAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('refund_management');
  const lateId = uuidSchema.safeParse(text(fd, 'lateId'));
  if (!lateId.success) redirect(back('That late payment could not be found.'));
  let message: string;
  try {
    const outcome = await requestLatePaymentRefund({ actorId: owner.userId, lateId: lateId.data });
    message = `Refund ${outcome.status === 'succeeded' ? 'completed' : 'sent — check its status below'}.`;
  } catch (error) {
    message = error instanceof LatePaymentError ? error.message : 'The refund could not be started. Check the status below before retrying.';
  }
  revalidatePath('/owner/payments');
  redirect(back(message));
}
