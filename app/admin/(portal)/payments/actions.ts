'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/services/admin';
import { attributeUnmatchedPayment, reconcileInitialisation, ReconciliationError } from '@/lib/services/payment-reconciliation';
import { uuidSchema } from '@/lib/validation';

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

function parseAction(value: string): 'adopt' | null {
  return value === 'adopt' ? 'adopt' : null;
}

const ATTRIBUTION_MESSAGES: Record<string, string> = {
  attributed_and_paid: 'Payment attributed to the order and settled once.',
  attributed_for_owner_review: 'Payment attributed. It is now in the owner\'s late-payment queue for a decision.',
};

function back(notice: string): string {
  return `/admin/payments?notice=${encodeURIComponent(notice)}`;
}

/**
 * Reconciles an uncertain payment start. Requires the administrator's confirmation that the provider dashboard was
 * checked, a verified provider order id for 'adopt', and an evidence note. Never marks a payment as paid.
 */
export async function reconcileInitialisationAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const initId = uuidSchema.safeParse(text(fd, 'initId'));
  const action = parseAction(text(fd, 'action'));
  if (!initId.success || action === null) {
    redirect(back('That record could not be found.'));
    return;
  }
  if (fd.get('dashboardChecked') !== 'on') {
    redirect(back('Check the provider dashboard first, then confirm the box before reconciling.'));
  }
  let message: string;
  try {
    await reconcileInitialisation({
      actorId: admin.userId,
      initId: initId.data,
      action,
      providerOrderId: text(fd, 'providerOrderId'),
      evidenceNote: text(fd, 'evidenceNote'),
    });
    message = 'Provider order verified, recorded and attached.';
  } catch (error) {
    message = error instanceof ReconciliationError ? error.message : 'The reconciliation could not be recorded.';
  }
  revalidatePath('/admin/payments');
  redirect(back(message));
}

/**
 * Attributes an unmatched provider payment. The provider payment and order are checked against Razorpay first; the
 * store comes from the local order. The administrator's note and any checkbox are recorded, never trusted as evidence.
 */
export async function attributeUnmatchedPaymentAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const lateId = uuidSchema.safeParse(text(fd, 'lateId'));
  if (!lateId.success) {
    redirect(back('That record could not be found.'));
    return;
  }
  let message: string;
  try {
    const outcome = await attributeUnmatchedPayment({
      actorId: admin.userId,
      lateId: lateId.data,
      orderNumber: text(fd, 'orderNumber'),
      evidenceNote: text(fd, 'evidenceNote'),
    });
    message = ATTRIBUTION_MESSAGES[outcome] ?? 'The payment was recorded.';
  } catch (error) {
    message = error instanceof ReconciliationError ? error.message : 'The attribution could not be recorded.';
  }
  revalidatePath('/admin/payments');
  redirect(back(message));
}
