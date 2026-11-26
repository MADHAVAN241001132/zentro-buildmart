'use server';

import { revalidatePath } from 'next/cache';
import { checkFeature } from '@/lib/services/entitlements';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendly } from '@/lib/errors';
import { batchSchema, batchAdjustSchema } from '@/lib/validation/purchasing';
import { issuesToFields } from '@/lib/validation/owner';

export interface BatchState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function createBatchAction(_prev: BatchState, fd: FormData): Promise<BatchState> {
  const owner = await requireOwnerPermission('tile_batch_management');
  const batchBlocked = await checkFeature(owner.storeId, 'tile_batches');
  if (batchBlocked) return { ok: false, message: batchBlocked };
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  const parsed = batchSchema.safeParse({
    variantId: get('variantId'),
    batchNumber: get('batchNumber'),
    shadeCode: get('shadeCode'),
    calibre: get('calibre'),
    manufacturingDate: get('manufacturingDate'),
    supplierId: get('supplierId'),
    openingQuantity: get('openingQuantity') || '0',
  });
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('create_inventory_batch', {
    p_variant: d.variantId,
    p_batch_number: d.batchNumber,
    p_shade: d.shadeCode,
    p_calibre: d.calibre,
    p_manufacturing_date: d.manufacturingDate,
    p_supplier: d.supplierId,
    p_opening_quantity: d.openingQuantity,
  });
  if (error) return { ok: false, message: error.code === '23505' ? 'That batch number already exists for this product' : friendly(error.message) };
  revalidatePath('/owner/inventory/batches');
  revalidatePath('/owner/inventory');
  return { ok: true, message: 'Batch created' };
}

export async function updateBatchAction(_prev: BatchState, fd: FormData): Promise<BatchState> {
  const owner = await requireOwnerPermission('tile_batch_management');
  const batchId = String(fd.get('batchId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return { ok: false, message: 'Invalid batch' };
  const date = String(fd.get('manufacturingDate') ?? '');
  const supplier = String(fd.get('supplierId') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('update_inventory_batch', {
    p_batch: batchId,
    p_shade: String(fd.get('shadeCode') ?? '').trim() || null,
    p_calibre: String(fd.get('calibre') ?? '').trim() || null,
    p_manufacturing_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    p_supplier: supplier || null,
  });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath('/owner/inventory/batches');
  return { ok: true, message: 'Batch saved' };
}

export async function adjustBatchAction(_prev: BatchState, fd: FormData): Promise<BatchState> {
  const owner = await requireOwnerPermission('tile_batch_management');
  await requireOwnerPermission('inventory_management');
  const parsed = batchAdjustSchema.safeParse({ batchId: fd.get('batchId'), delta: fd.get('delta'), reason: fd.get('reason') });
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('adjust_batch_stock', { p_batch: parsed.data.batchId, p_delta: parsed.data.delta, p_reason: parsed.data.reason });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath('/owner/inventory/batches');
  revalidatePath('/owner/inventory');
  return { ok: true, message: 'Batch stock adjusted' };
}
