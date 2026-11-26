import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { KIND_BUCKET, PUBLIC_BUCKETS, isStorePath, type UploadKind } from '@/lib/storage/image-policy';
import { registerUpload } from '@/lib/services/storage';

export type MediaTarget = 'category' | 'brand' | 'logo' | 'banner';

interface TargetSpec {
  table: 'categories' | 'brands' | 'stores';
  /** Column that holds the store: store_id on catalogue tables, id on the stores table itself. */
  storeColumn: 'store_id' | 'id';
  urlColumn: string;
  pathColumn: string;
  kind: UploadKind;
}

const TARGETS: Record<MediaTarget, TargetSpec> = {
  category: { table: 'categories', storeColumn: 'store_id', urlColumn: 'image_url', pathColumn: 'image_path', kind: 'category' },
  brand: { table: 'brands', storeColumn: 'store_id', urlColumn: 'logo_url', pathColumn: 'logo_path', kind: 'brand' },
  logo: { table: 'stores', storeColumn: 'id', urlColumn: 'logo_url', pathColumn: 'logo_path', kind: 'logo' },
  banner: { table: 'stores', storeColumn: 'id', urlColumn: 'banner_url', pathColumn: 'banner_path', kind: 'banner' },
};

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

function publicUrl(bucket: string, path: string): string {
  const { data } = createSupabaseAdminClient().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Removes a store object. The row is released first, so a failed removal is retried by the orphan job. */
async function retireObject(storeId: string, bucket: string, path: string): Promise<void> {
  if (!PUBLIC_BUCKETS.includes(bucket) && bucket !== KIND_BUCKET.refund_photo) return;
  if (!isStorePath(path, storeId)) return;
  const admin = createSupabaseAdminClient();
  await admin.rpc('storage_release_object', { p_store: storeId, p_bucket: bucket, p_path: path });
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (!error) {
    await admin.from('storage_uploads').delete().eq('store_id', storeId).eq('bucket_id', bucket).eq('object_path', path);
  }
}

async function loadTarget(storeId: string, target: MediaTarget, targetId: string): Promise<Outcome<{ spec: TargetSpec; oldPath: string | null }>> {
  const spec = TARGETS[target];
  if (spec.table === 'stores' && targetId !== storeId) return { ok: false, error: 'The store was not found.' };
  const admin = createSupabaseAdminClient();
  const res =
    spec.table === 'stores'
      ? await admin.from('stores').select(spec.pathColumn).eq('id', targetId).maybeSingle()
      : spec.table === 'categories'
        ? await admin.from('categories').select(spec.pathColumn).eq('id', targetId).eq('store_id', storeId).maybeSingle()
        : await admin.from('brands').select(spec.pathColumn).eq('id', targetId).eq('store_id', storeId).maybeSingle();
  if (res.error || !res.data) return { ok: false, error: 'The item was not found for this store.' };
  const row = res.data as unknown as Record<string, string | null>;
  return { ok: true, value: { spec, oldPath: row[spec.pathColumn] ?? null } };
}

async function updateMediaColumns(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  spec: TargetSpec,
  targetId: string,
  storeId: string,
  url: string | null,
  path: string | null,
) {
  if (spec.table === 'stores') {
    const patch = spec.kind === 'logo' ? { logo_url: url, logo_path: path } : { banner_url: url, banner_path: path };
    return admin.from('stores').update(patch).eq('id', targetId);
  }
  if (spec.table === 'categories') {
    return admin.from('categories').update({ image_url: url, image_path: path }).eq('id', targetId).eq('store_id', storeId);
  }
  return admin.from('brands').update({ logo_url: url, logo_path: path }).eq('id', targetId).eq('store_id', storeId);
}

/** Replaces the image of a category, brand, logo or banner. The old object is retired only after the new one is recorded. */
export async function setMediaImage(storeId: string, target: MediaTarget, targetId: string, file: File, actorId: string | null): Promise<Outcome<{ url: string }>> {
  const loaded = await loadTarget(storeId, target, targetId);
  if (!loaded.ok) return loaded;
  const { spec, oldPath } = loaded.value;
  const bucket = KIND_BUCKET[spec.kind];

  const stored = await registerUpload(storeId, spec.kind, file, actorId);
  if (!stored.ok) return stored;
  const admin = createSupabaseAdminClient();
  const url = publicUrl(bucket, stored.value.path);

  const discard = async () => {
    await admin.from('storage_uploads').delete().eq('id', stored.value.uploadId);
    await admin.storage.from(bucket).remove([stored.value.path]);
  };

  const { data: claimedPath, error: claimError } = await admin.rpc('storage_claim_upload', {
    p_store: storeId, p_upload: stored.value.uploadId, p_kind: spec.kind, p_public_url: url,
  });
  if (claimError || typeof claimedPath !== 'string') {
    await discard();
    return { ok: false, error: 'The image could not be recorded. Try again.' };
  }

  const { error: updateError } = await updateMediaColumns(admin, spec, targetId, storeId, url, claimedPath);
  if (updateError) {
    await discard();
    return { ok: false, error: 'The image could not be saved. The previous image is unchanged.' };
  }

  if (oldPath && oldPath !== claimedPath) await retireObject(storeId, bucket, oldPath);
  return { ok: true, value: { url } };
}

/** Removes the image from the record, then retires the object. */
export async function clearMediaImage(storeId: string, target: MediaTarget, targetId: string): Promise<Outcome<null>> {
  const loaded = await loadTarget(storeId, target, targetId);
  if (!loaded.ok) return loaded;
  const { spec, oldPath } = loaded.value;
  const { error } = await updateMediaColumns(createSupabaseAdminClient(), spec, targetId, storeId, null, null);
  if (error) return { ok: false, error: 'The image could not be removed.' };
  if (oldPath) await retireObject(storeId, KIND_BUCKET[spec.kind], oldPath);
  return { ok: true, value: null };
}
