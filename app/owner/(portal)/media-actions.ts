'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerPermission } from '@/lib/services/owner';
import { clearMediaImage, setMediaImage, type MediaTarget } from '@/lib/services/media';

export type MediaActionState = { ok: boolean; message: string };

const TARGETS: readonly string[] = ['category', 'brand', 'logo', 'banner'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function targetFrom(formData: FormData): { target: MediaTarget; targetId: string } | null {
  const target = String(formData.get('target') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  if (!TARGETS.includes(target) || !UUID.test(targetId)) return null;
  return { target: target as MediaTarget, targetId };
}

function refresh(target: MediaTarget) {
  revalidatePath(target === 'logo' || target === 'banner' ? '/owner/settings' : '/owner/categories');
}

/** Requires the product management permission. Without it the catalogue is visible but its images cannot change. */
async function managerOwner() {
  const owner = await requireOwnerPermission('product_management');
  return owner;
}

export async function uploadMediaAction(_previous: MediaActionState, formData: FormData): Promise<MediaActionState> {
  try {
    const owner = await managerOwner();
    const parsed = targetFrom(formData);
    if (!parsed) return { ok: false, message: 'Choose a valid item.' };
    const file = formData.get('image');
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose an image.' };
    const targetId = parsed.target === 'logo' || parsed.target === 'banner' ? owner.storeId : parsed.targetId;
    const result = await setMediaImage(owner.storeId, parsed.target, targetId, file, owner.userId);
    refresh(parsed.target);
    return result.ok ? { ok: true, message: 'Image saved.' } : { ok: false, message: result.error };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The image could not be saved.' };
  }
}

export async function clearMediaAction(formData: FormData): Promise<void> {
  const owner = await managerOwner();
  const parsed = targetFrom(formData);
  if (!parsed) throw new Error('Invalid image request.');
  const targetId = parsed.target === 'logo' || parsed.target === 'banner' ? owner.storeId : parsed.targetId;
  const result = await clearMediaImage(owner.storeId, parsed.target, targetId);
  if (!result.ok) throw new Error(result.error);
  refresh(parsed.target);
}
