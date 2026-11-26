import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  BUCKETS,
  KIND_BUCKET,
  MAX_PRODUCT_IMAGES,
  PUBLIC_BUCKETS,
  SIGNED_URL_SECONDS,
  buildObjectPath,
  isStorePath,
  validateImageUpload,
  type UploadKind,
} from '@/lib/storage/image-policy';

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

const UPLOAD_ERRORS: Record<string, string> = {
  '23505': 'That image is already attached.',
  '23514': `A product can have at most ${MAX_PRODUCT_IMAGES} images.`,
  P0002: 'The item was not found for this store.',
  '22023': 'The image link does not match the uploaded file.',
};

function publicUrl(bucket: string, path: string): string | null {
  if (!PUBLIC_BUCKETS.includes(bucket)) return null;
  const { data } = createSupabaseAdminClient().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Validates the bytes, stores the object under the store folder, and records it as unclaimed. */
export async function registerUpload(storeId: string, kind: UploadKind, file: File, actorId: string | null): Promise<Outcome<{ uploadId: string; bucket: string; path: string }>> {
  const bucket = KIND_BUCKET[kind];
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const checked = validateImageUpload({ bucket, size: file.size, head });
  if (!checked.ok) return { ok: false, error: checked.error };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = buildObjectPath(storeId, kind, checked.image, crypto.randomUUID());
  const admin = createSupabaseAdminClient();
  const { error: storeError } = await admin.storage.from(bucket).upload(path, bytes, { contentType: checked.image.mime, upsert: false });
  if (storeError) return { ok: false, error: 'The image could not be stored. Try again.' };

  const { data, error } = await admin
    .from('storage_uploads')
    .insert({ store_id: storeId, bucket_id: bucket, object_path: path, kind, mime_type: checked.image.mime, size_bytes: file.size, uploaded_by: actorId })
    .select('id')
    .single();
  if (error || !data) {
    await admin.storage.from(bucket).remove([path]);
    return { ok: false, error: 'The image could not be recorded. Try again.' };
  }
  return { ok: true, value: { uploadId: data.id as string, bucket, path } };
}

/** Attaches a registered upload to a product. The database checks the store, the product and the URL. */
export async function attachProductImage(storeId: string, productId: string, uploadId: string, altText: string): Promise<Outcome<{ imageId: string }>> {
  const admin = createSupabaseAdminClient();
  const { data: upload } = await admin.from('storage_uploads').select('bucket_id, object_path').eq('id', uploadId).eq('store_id', storeId).maybeSingle();
  if (!upload) return { ok: false, error: 'The upload was not found.' };
  const url = publicUrl(upload.bucket_id as string, upload.object_path as string);
  if (!url) return { ok: false, error: 'This upload is not public.' };
  const { data, error } = await admin.rpc('product_image_attach', {
    p_store: storeId, p_product: productId, p_upload: uploadId, p_alt: altText.slice(0, 200), p_public_url: url,
  });
  if (error) return { ok: false, error: UPLOAD_ERRORS[error.code ?? ''] ?? 'The image could not be attached.' };
  return { ok: true, value: { imageId: data as string } };
}

export async function setPrimaryImage(storeId: string, productId: string, imageId: string): Promise<Outcome<null>> {
  const { error } = await createSupabaseAdminClient().rpc('product_image_set_primary', { p_store: storeId, p_product: productId, p_image: imageId });
  if (error) return { ok: false, error: UPLOAD_ERRORS[error.code ?? ''] ?? 'The primary image could not be set.' };
  return { ok: true, value: null };
}

/** Moves one image one place earlier (-1) or later (+1) by rewriting the full order. */
export async function moveProductImage(storeId: string, productId: string, imageId: string, step: -1 | 1): Promise<Outcome<null>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('product_images').select('id').eq('product_id', productId).eq('store_id', storeId).order('sort_order').order('created_at').order('id');
  if (error || !data) return { ok: false, error: 'The images could not be loaded.' };
  const ids = data.map((r) => r.id as string);
  const at = ids.indexOf(imageId);
  const to = at + step;
  if (at < 0) return { ok: false, error: 'The image was not found.' };
  if (to < 0 || to >= ids.length) return { ok: true, value: null };
  const a = ids[at];
  const b = ids[to];
  if (a !== undefined && b !== undefined) {
    ids[at] = b;
    ids[to] = a;
  }
  const { error: rpcError } = await admin.rpc('product_image_reorder', { p_store: storeId, p_product: productId, p_ids: ids });
  if (rpcError) return { ok: false, error: 'The order could not be saved.' };
  return { ok: true, value: null };
}

/** Deletes the image row, then removes the object. An object left behind is cleared by the orphan job. */
export async function deleteProductImage(storeId: string, imageId: string): Promise<Outcome<null>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('product_image_delete', { p_store: storeId, p_image: imageId });
  if (error) return { ok: false, error: UPLOAD_ERRORS[error.code ?? ''] ?? 'The image could not be deleted.' };
  const removed = (data ?? []) as { removed_bucket: string | null; removed_path: string | null }[];
  for (const r of removed) {
    if (r.removed_bucket && r.removed_path) await admin.storage.from(r.removed_bucket).remove([r.removed_path]);
  }
  return { ok: true, value: null };
}

/** A short-lived link for a private photograph. Only paths under the store folder are signed. */
export async function signedPhotoUrl(storeId: string, path: string): Promise<Outcome<string>> {
  if (!isStorePath(path, storeId)) return { ok: false, error: 'The photograph was not found.' };
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from('storage_uploads').select('id').eq('store_id', storeId).eq('bucket_id', BUCKETS.privatePhotos).eq('object_path', path).maybeSingle();
  if (!row) return { ok: false, error: 'The photograph was not found.' };
  const { data, error } = await admin.storage.from(BUCKETS.privatePhotos).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) return { ok: false, error: 'The link could not be created.' };
  return { ok: true, value: data.signedUrl };
}

/** Removes unclaimed objects older than the cut-off. Returns how many were removed. */
export async function cleanupOrphanUploads(olderThanHours = 24, limit = 200): Promise<number> {
  const admin = createSupabaseAdminClient();
  const before = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  const { data, error } = await admin.rpc('storage_orphan_candidates', { p_before: before, p_limit: limit });
  if (error || !data) return 0;
  const rows = data as { upload_id: string; bucket_id: string; object_path: string }[];
  const byBucket = new Map<string, string[]>();
  for (const r of rows) byBucket.set(r.bucket_id, [...(byBucket.get(r.bucket_id) ?? []), r.object_path]);
  for (const [bucket, paths] of byBucket) await admin.storage.from(bucket).remove(paths);
  await admin.from('storage_uploads').delete().in('id', rows.map((r) => r.upload_id));
  return rows.length;
}

export interface ChosenPhoto {
  file: File;
  primary: boolean;
}

export interface NewImagesResult {
  attached: number;
  failed: { name: string; reason: string }[];
}

/**
 * Attaches photographs chosen while a product is being created. Each file passes through the same
 * registry and attach functions as the product page, so the same type, size, tenant and count checks apply.
 * A failed file does not stop the others, and it does not undo the product: the owner can upload again
 * from the product page. The chosen primary photograph is set last; without a choice the first saved one is used.
 */
export async function attachNewProductImages(storeId: string, productId: string, photos: ChosenPhoto[], actorId: string): Promise<NewImagesResult> {
  const failed: { name: string; reason: string }[] = [];
  let attached = 0;
  let firstImageId: string | null = null;
  let chosenImageId: string | null = null;

  for (const photo of photos) {
    const stored = await registerUpload(storeId, 'product', photo.file, actorId);
    if (!stored.ok) {
      failed.push({ name: photo.file.name, reason: stored.error });
      continue;
    }
    const saved = await attachProductImage(storeId, productId, stored.value.uploadId, '');
    if (!saved.ok) {
      failed.push({ name: photo.file.name, reason: saved.error });
      continue;
    }
    attached += 1;
    firstImageId ??= saved.value.imageId;
    if (photo.primary) chosenImageId = saved.value.imageId;
  }

  const primaryId = chosenImageId ?? firstImageId;
  if (primaryId) {
    const set = await setPrimaryImage(storeId, productId, primaryId);
    if (!set.ok) failed.push({ name: 'Primary photograph', reason: set.error });
  }
  return { attached, failed };
}
