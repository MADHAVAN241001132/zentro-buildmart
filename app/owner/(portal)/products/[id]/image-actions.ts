'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerPermission } from '@/lib/services/owner';
import { MAX_FILES_PER_UPLOAD } from '@/lib/storage/image-policy';
import { attachProductImage, deleteProductImage, moveProductImage, registerUpload, setPrimaryImage } from '@/lib/services/storage';

export type ImageActionState = { ok: boolean; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function productIdFrom(formData: FormData): string | null {
  const id = String(formData.get('productId') ?? '');
  return UUID.test(id) ? id : null;
}

function refresh(productId: string) {
  revalidatePath(`/owner/products/${productId}`);
}

export async function uploadProductImagesAction(_previous: ImageActionState, formData: FormData): Promise<ImageActionState> {
  const owner = await requireOwnerPermission('product_management');
  const productId = productIdFrom(formData);
  if (!productId) return { ok: false, message: 'Choose a valid product.' };
  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, message: 'Choose at least one image.' };
  if (files.length > MAX_FILES_PER_UPLOAD) return { ok: false, message: `Upload up to ${MAX_FILES_PER_UPLOAD} images at a time.` };

  const problems: string[] = [];
  let added = 0;
  for (const file of files) {
    const stored = await registerUpload(owner.storeId, 'product', file, owner.userId);
    if (!stored.ok) { problems.push(`${file.name}: ${stored.error}`); continue; }
    const attached = await attachProductImage(owner.storeId, productId, stored.value.uploadId, '');
    if (!attached.ok) { problems.push(`${file.name}: ${attached.error}`); continue; }
    added += 1;
  }
  refresh(productId);
  if (problems.length === 0) return { ok: true, message: `${added} image${added === 1 ? '' : 's'} added.` };
  return { ok: false, message: `${added} added. ${problems.join(' ')}` };
}

export async function setPrimaryImageAction(formData: FormData): Promise<void> {
  const owner = await requireOwnerPermission('product_management');
  const productId = productIdFrom(formData);
  const imageId = String(formData.get('imageId') ?? '');
  if (!productId || !UUID.test(imageId)) throw new Error('Invalid image request.');
  const result = await setPrimaryImage(owner.storeId, productId, imageId);
  if (!result.ok) throw new Error(result.error);
  refresh(productId);
}

export async function moveImageAction(formData: FormData): Promise<void> {
  const owner = await requireOwnerPermission('product_management');
  const productId = productIdFrom(formData);
  const imageId = String(formData.get('imageId') ?? '');
  const step = formData.get('step') === '-1' ? -1 : 1;
  if (!productId || !UUID.test(imageId)) throw new Error('Invalid image request.');
  const result = await moveProductImage(owner.storeId, productId, imageId, step);
  if (!result.ok) throw new Error(result.error);
  refresh(productId);
}

export async function deleteImageAction(formData: FormData): Promise<void> {
  const owner = await requireOwnerPermission('product_management');
  const productId = productIdFrom(formData);
  const imageId = String(formData.get('imageId') ?? '');
  if (!productId || !UUID.test(imageId)) throw new Error('Invalid image request.');
  const result = await deleteProductImage(owner.storeId, imageId);
  if (!result.ok) throw new Error(result.error);
  refresh(productId);
}
