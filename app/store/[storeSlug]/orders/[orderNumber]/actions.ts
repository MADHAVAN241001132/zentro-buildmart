'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CheckoutError, retryOnlinePayment } from '@/lib/services/checkout';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';

const ORDER_NUMBER = /^[A-Za-z0-9-]{3,40}$/;

/**
 * Starts a new provider payment after a definite refusal. The Guest session must own the order; the service and the
 * database both refuse retry in any other state, including an uncertain start.
 */
export async function retryPaymentAction(fd: FormData): Promise<void> {
  const slug = typeof fd.get('storeSlug') === 'string' ? (fd.get('storeSlug') as string) : '';
  const orderNumber = typeof fd.get('orderNumber') === 'string' ? (fd.get('orderNumber') as string) : '';
  if (!ORDER_NUMBER.test(orderNumber) || slug.length === 0) redirect('/');

  const store = await getStoreBySlug(slug);
  if (!store) redirect('/');
  const session = await readGuestSession(store.id, slug);
  if (!session) redirect(`/store/${slug}`);

  const base = `/store/${slug}/orders/${orderNumber}`;
  try {
    await retryOnlinePayment(store.id, session.id, orderNumber);
  } catch (error) {
    const message = error instanceof CheckoutError ? error.message : 'The payment could not be started. Check your order before trying again.';
    revalidatePath(base);
    redirect(`${base}?notice=${encodeURIComponent(message)}`);
  }
  revalidatePath(base);
  redirect(base);
}
