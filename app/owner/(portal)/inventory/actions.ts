'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { damageSchema, issuesToFields, reorderSchema, stockAdjustSchema } from '@/lib/validation/owner';

export interface StockResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const text = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');

async function ownerWithWrite() {
  const owner = await requireOwnerPermission('inventory_management');
  return owner;
}

/** Count correction through adjust_stock. The database refuses to drop on-hand below reserved stock. */
export async function adjustStockAction(_prev: StockResult, fd: FormData): Promise<StockResult> {
  try {
    await ownerWithWrite();
    const parsed = stockAdjustSchema.safeParse({ variantId: text(fd, 'variantId'), delta: text(fd, 'delta'), reason: text(fd, 'reason') });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_variant: parsed.data.variantId, p_delta: parsed.data.delta, p_reason: parsed.data.reason,
    });
    if (error) {
      return { ok: false, message: error.message.includes('below reserved') ? 'This would reduce on-hand stock below the units reserved for customers' : 'Could not adjust stock' };
    }
    revalidatePath('/owner/inventory');
    revalidatePath(`/owner/inventory/${parsed.data.variantId}`);
    return { ok: true, message: `Stock adjusted. On hand is now ${String(data)}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not adjust stock' };
  }
}

/** Moves sellable stock into the damaged count through mark_damaged. */
export async function markDamagedAction(_prev: StockResult, fd: FormData): Promise<StockResult> {
  try {
    await ownerWithWrite();
    const parsed = damageSchema.safeParse({ variantId: text(fd, 'variantId'), quantity: text(fd, 'quantity'), reason: text(fd, 'reason') });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('mark_damaged', {
      p_variant: parsed.data.variantId, p_qty: parsed.data.quantity, p_reason: parsed.data.reason, p_batch: null,
    });
    if (error) return { ok: false, message: 'Not enough sellable stock to mark that many as damaged' };
    revalidatePath('/owner/inventory');
    revalidatePath(`/owner/inventory/${parsed.data.variantId}`);
    return { ok: true, message: 'Damaged stock recorded' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not record damage' };
  }
}

/**
 * Sets the reorder level. No RLS write policy exists on inventory, so the service role performs the
 * update, after confirming the variant belongs to the owner's store. The value is not stock, so no
 * stock movement is needed.
 */
export async function setReorderLevelAction(_prev: StockResult, fd: FormData): Promise<StockResult> {
  try {
    const owner = await ownerWithWrite();
    const parsed = reorderSchema.safeParse({ variantId: text(fd, 'variantId'), reorderLevel: text(fd, 'reorderLevel') });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const admin = createSupabaseAdminClient();
    const { data: row } = await admin.from('inventory').select('id').eq('variant_id', parsed.data.variantId).eq('store_id', owner.storeId).maybeSingle();
    if (!row) return { ok: false, message: 'This product has no stock record' };
    const { error } = await admin.from('inventory').update({ reorder_level: parsed.data.reorderLevel, updated_at: new Date().toISOString() }).eq('id', row.id as string);
    if (error) return { ok: false, message: 'Could not save the reorder level' };
    revalidatePath('/owner/inventory');
    return { ok: true, message: 'Reorder level saved' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save' };
  }
}
