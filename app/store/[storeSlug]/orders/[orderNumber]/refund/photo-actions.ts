'use server';

import { revalidatePath } from 'next/cache';
import { readGuestSession } from '@/lib/services/guest';
import { addRefundPhoto, removeRefundPhoto } from '@/lib/services/guest-photos';
import { getStoreBySlug } from '@/lib/services/storefront';

export interface PhotoState { ok: boolean; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PER_REQUEST = 4;

/** The guest's session comes from the cookie for this store. Nothing in the form decides ownership. */
export async function addRefundPhotoAction(storeSlug: string, orderNumber: string, requestId: string, _previous: PhotoState, formData: FormData): Promise<PhotoState> {
  const store = await getStoreBySlug(storeSlug);
  if (!store) return { ok: false, message: 'This store could not be found.' };
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) return { ok: false, message: 'Your session has expired. Open the order again.' };
  if (!UUID.test(requestId)) return { ok: false, message: 'Choose a valid refund request.' };
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a photograph.' };
  const result = await addRefundPhoto(store.id, session.id, requestId, file);
  revalidatePath(`/store/${storeSlug}/orders/${orderNumber}/refund`);
  if (!result.ok) return { ok: false, message: result.error };
  return { ok: true, message: `Photograph added (up to ${MAX_PER_REQUEST}).` };
}

export async function removeRefundPhotoAction(storeSlug: string, orderNumber: string, formData: FormData): Promise<void> {
  const store = await getStoreBySlug(storeSlug);
  if (!store) throw new Error('This store could not be found.');
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) throw new Error('Your session has expired. Open the order again.');
  const photoId = String(formData.get('photoId') ?? '');
  if (!UUID.test(photoId)) throw new Error('Invalid photograph.');
  const result = await removeRefundPhoto(store.id, session.id, photoId);
  if (!result.ok) throw new Error(result.error);
  revalidatePath(`/store/${storeSlug}/orders/${orderNumber}/refund`);
}
