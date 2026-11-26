'use server';

import { revalidatePath } from 'next/cache';
import { checkFeature } from '@/lib/services/entitlements';
import { redirect } from 'next/navigation';
import { requireOwnerPermission } from '@/lib/services/owner';
import { previewImport, confirmImport } from '@/lib/services/product-import';
import { IMPORT_LIMITS } from '@/lib/imports/read-spreadsheet';
import type { DuplicateMode, ImportKind } from '@/lib/imports/catalogue-rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failImport(message: string): never {
  redirect(`/owner/products/import?error=${encodeURIComponent(message)}`);
  throw new Error('redirect did not run');
}

/** Owners and managers only. Staff see no import controls, and this check holds even when they post the form. */
async function importOwner() {
  const owner = await requireOwnerPermission('product_management');
  return owner;
}

/** Uploads a file, validates it against the current catalogue and saves a preview. Nothing changes until confirmation. */
export async function previewImportAction(formData: FormData): Promise<void> {
  const owner = await importOwner();
  const importBlocked = await checkFeature(owner.storeId, 'bulk_imports');
  if (importBlocked) failImport(importBlocked);

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) failImport('Choose a CSV or Excel file to upload.');
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    failImport(`The file is larger than ${Math.round(IMPORT_LIMITS.maxFileBytes / (1024 * 1024))} MB. Split it into smaller files.`);
  }

  const kindValue = formData.get('kind');
  const kind: ImportKind = kindValue === 'prices' ? 'prices' : 'catalogue';
  const modeValue = formData.get('mode');
  const mode: DuplicateMode = modeValue === 'update' ? 'update' : 'skip';

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await previewImport({
    storeId: owner.storeId,
    actorId: owner.userId,
    kind,
    mode,
    fileName: file.name,
    bytes,
  });
  if (!result.ok) failImport(result.error);
  redirect(`/owner/products/import/${result.batchId}`);
}

/** Applies a previewed batch in one transaction. A failed confirmation changes nothing and can be retried safely. */
export async function confirmImportAction(formData: FormData): Promise<void> {
  const owner = await importOwner();
  const importBlocked = await checkFeature(owner.storeId, 'bulk_imports');
  if (importBlocked) failImport(importBlocked);
  const batchId = formData.get('batchId');
  if (typeof batchId !== 'string' || !UUID.test(batchId)) failImport('This import was not found.');

  const result = await confirmImport({ storeId: owner.storeId, actorId: owner.userId, batchId });
  if (!result.ok) redirect(`/owner/products/import/${batchId}?error=${encodeURIComponent(result.error)}`);

  revalidatePath('/owner/products');
  revalidatePath(`/owner/products/import/${batchId}`);
  redirect(`/owner/products/import/${batchId}?applied=1`);
}
