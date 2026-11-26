import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { BUCKETS, SIGNED_URL_SECONDS, isStorePath } from '@/lib/storage/image-policy';
import { registerUpload } from '@/lib/services/storage';

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

const PHOTO_ERRORS: Record<string, string> = {
  P0002: 'That photograph or request was not found for this session.',
  '22023': 'Photographs can only change while the request is open.',
  '23514': 'You have reached the photograph limit.',
  '23505': 'That photograph is already attached.',
};

export interface PhotoLink { id: string; url: string }

/**
 * Signed URLs are issued only for rows the caller is allowed to see. Each query filters by store and,
 * for guests, by the guest session that created the row. Anything else returns no link.
 */
async function signLinks(storeId: string, rows: { id: string; upload_id: string }[]): Promise<PhotoLink[]> {
  if (rows.length === 0) return [];
  const admin = createSupabaseAdminClient();
  const { data: uploads } = await admin
    .from('storage_uploads')
    .select('id, bucket_id, object_path')
    .eq('store_id', storeId)
    .in('id', rows.map((r) => r.upload_id));
  const byId = new Map<string, { bucket_id: string; object_path: string }>();
  for (const u of (uploads ?? []) as { id: string; bucket_id: string; object_path: string }[]) byId.set(u.id, u);
  const links: PhotoLink[] = [];
  for (const row of rows) {
    const upload = byId.get(row.upload_id);
    if (!upload) continue;
    const bucket = upload.bucket_id;
    const path = upload.object_path;
    if (bucket !== BUCKETS.privatePhotos || !isStorePath(path, storeId)) continue;
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (!error && data) links.push({ id: row.id, url: data.signedUrl });
  }
  return links;
}

/** Photographs of one refund request, for the guest who made it. */
export async function guestRefundPhotoLinks(storeId: string, sessionId: string, requestId: string): Promise<PhotoLink[]> {
  const admin = createSupabaseAdminClient();
  const { data: owned } = await admin
    .from('refund_requests').select('id')
    .eq('id', requestId).eq('store_id', storeId).eq('guest_session_id', sessionId).maybeSingle();
  if (!owned) return [];
  const { data } = await admin
    .from('refund_request_photos').select('id, upload_id')
    .eq('store_id', storeId).eq('guest_session_id', sessionId).eq('refund_request_id', requestId)
    .order('created_at');
  return signLinks(storeId, (data ?? []) as { id: string; upload_id: string }[]);
}

/** Photographs of one refund request, for the store's owners and staff. */
export async function ownerRefundPhotoLinks(storeId: string, requestId: string): Promise<PhotoLink[]> {
  const { data } = await createSupabaseAdminClient()
    .from('refund_request_photos').select('id, upload_id')
    .eq('store_id', storeId).eq('refund_request_id', requestId).order('created_at');
  return signLinks(storeId, (data ?? []) as { id: string; upload_id: string }[]);
}

export async function guestRoomPhotoLinks(storeId: string, sessionId: string): Promise<PhotoLink[]> {
  const { data } = await createSupabaseAdminClient()
    .from('guest_room_photos').select('id, upload_id')
    .eq('store_id', storeId).eq('guest_session_id', sessionId).order('created_at');
  return signLinks(storeId, (data ?? []) as { id: string; upload_id: string }[]);
}

async function discard(storeId: string, bucket: string, path: string, uploadId: string) {
  const admin = createSupabaseAdminClient();
  await admin.from('storage_uploads').delete().eq('id', uploadId).eq('store_id', storeId);
  await admin.storage.from(bucket).remove([path]);
}

/** Deletes the object and its registry row after the database has released them. */
async function retire(storeId: string, bucket: string, path: string) {
  if (!isStorePath(path, storeId)) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (!error) await admin.from('storage_uploads').delete().eq('store_id', storeId).eq('bucket_id', bucket).eq('object_path', path);
}

export async function addRefundPhoto(storeId: string, sessionId: string, requestId: string, file: File): Promise<Outcome<{ photoId: string }>> {
  const stored = await registerUpload(storeId, 'refund_photo', file, null);
  if (!stored.ok) return stored;
  const { data, error } = await createSupabaseAdminClient().rpc('refund_photo_attach', {
    p_store: storeId, p_session: sessionId, p_request: requestId, p_upload: stored.value.uploadId,
  });
  if (error) {
    await discard(storeId, stored.value.bucket, stored.value.path, stored.value.uploadId);
    return { ok: false, error: PHOTO_ERRORS[error.code ?? ''] ?? 'The photograph could not be attached.' };
  }
  return { ok: true, value: { photoId: data as string } };
}

export async function removeRefundPhoto(storeId: string, sessionId: string, photoId: string): Promise<Outcome<null>> {
  const { data, error } = await createSupabaseAdminClient().rpc('refund_photo_remove', { p_store: storeId, p_session: sessionId, p_photo: photoId });
  if (error) return { ok: false, error: PHOTO_ERRORS[error.code ?? ''] ?? 'The photograph could not be removed.' };
  const row = ((data ?? []) as { removed_bucket: string; removed_path: string }[])[0];
  if (row) await retire(storeId, row.removed_bucket, row.removed_path);
  return { ok: true, value: null };
}

export async function addRoomPhoto(storeId: string, sessionId: string, file: File, label: string): Promise<Outcome<{ photoId: string }>> {
  const stored = await registerUpload(storeId, 'room_photo', file, null);
  if (!stored.ok) return stored;
  const { data, error } = await createSupabaseAdminClient().rpc('room_photo_attach', {
    p_store: storeId, p_session: sessionId, p_upload: stored.value.uploadId, p_label: label.trim().slice(0, 80),
  });
  if (error) {
    await discard(storeId, stored.value.bucket, stored.value.path, stored.value.uploadId);
    return { ok: false, error: PHOTO_ERRORS[error.code ?? ''] ?? 'The photograph could not be attached.' };
  }
  return { ok: true, value: { photoId: data as string } };
}

export async function removeRoomPhoto(storeId: string, sessionId: string, photoId: string): Promise<Outcome<null>> {
  const { data, error } = await createSupabaseAdminClient().rpc('room_photo_remove', { p_store: storeId, p_session: sessionId, p_photo: photoId });
  if (error) return { ok: false, error: PHOTO_ERRORS[error.code ?? ''] ?? 'The photograph could not be removed.' };
  const row = ((data ?? []) as { removed_bucket: string; removed_path: string }[])[0];
  if (row) await retire(storeId, row.removed_bucket, row.removed_path);
  return { ok: true, value: null };
}


/** The guest's room photographs with their labels and signed URLs. Scoped to the store and the guest session. */
export async function guestRoomPhotos(storeId: string, sessionId: string): Promise<{ id: string; url: string; label: string }[]> {
  const { data } = await createSupabaseAdminClient()
    .from('guest_room_photos').select('id, upload_id, label')
    .eq('store_id', storeId).eq('guest_session_id', sessionId).order('created_at');
  const rows = (data ?? []) as { id: string; upload_id: string; label: string }[];
  const links = await signLinks(storeId, rows);
  const labels = new Map(rows.map((r) => [r.id, r.label ?? '']));
  return links.map((l) => ({ id: l.id, url: l.url, label: labels.get(l.id) ?? '' }));
}
