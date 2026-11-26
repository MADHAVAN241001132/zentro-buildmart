'use server';

import { revalidatePath } from 'next/cache';
import { checkFeature } from '@/lib/services/entitlements';
import { redirect } from 'next/navigation';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseRupeesToPaise } from '@/lib/money';
import { friendly } from '@/lib/errors';

export interface PoFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const LINE_SLOTS = 8;

/** Reads up to eight variant rows from the form. Empty rows are ignored. */
function readLines(fd: FormData): { ok: true; lines: { variant_id: string; quantity: number; unit_cost_paise: number }[] } | { ok: false; message: string } {
  const lines: { variant_id: string; quantity: number; unit_cost_paise: number }[] = [];
  for (let i = 0; i < LINE_SLOTS; i++) {
    const variant = String(fd.get(`variant_${i}`) ?? '');
    const qtyText = String(fd.get(`quantity_${i}`) ?? '').trim();
    const costText = String(fd.get(`cost_${i}`) ?? '').trim();
    if (!variant && !qtyText && !costText) continue;
    const qty = Number(qtyText);
    const cost = parseRupeesToPaise(costText || '0');
    if (!variant) return { ok: false, message: `Choose a product on line ${i + 1}` };
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, message: `Enter a whole-number quantity on line ${i + 1}` };
    if (cost === null) return { ok: false, message: `Enter a valid unit cost on line ${i + 1}` };
    lines.push({ variant_id: variant, quantity: qty, unit_cost_paise: cost });
  }
  if (lines.length === 0) return { ok: false, message: 'Add at least one product line' };
  return { ok: true, lines };
}

export async function createPurchaseOrderAction(_prev: PoFormState, fd: FormData): Promise<PoFormState> {
  const owner = await requireOwnerPermission('purchasing');
  const poBlocked = await checkFeature(owner.storeId, 'purchase_orders');
  if (poBlocked) return { ok: false, message: poBlocked };
  const supplierId = String(fd.get('supplierId') ?? '');
  const expected = String(fd.get('expectedOn') ?? '');
  if (!supplierId) return { ok: false, message: 'Choose a supplier', fieldErrors: { supplierId: 'Required' } };
  const parsed = readLines(fd);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_supplier: supplierId,
    p_expected: /^\d{4}-\d{2}-\d{2}$/.test(expected) ? expected : null,
    p_lines: parsed.lines,
  });
  if (error || !data) return { ok: false, message: friendly(error?.message ?? 'Could not create the purchase order') };
  revalidatePath('/owner/purchasing');
  redirect(`/owner/purchasing/${data as string}`);
}

export async function setPurchaseOrderStatusAction(formData: FormData): Promise<void> {
  const owner = await requireOwnerPermission('purchasing');
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['sent', 'cancelled'].includes(to)) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('set_purchase_order_status', { p_po: id, p_to: to });
  revalidatePath(`/owner/purchasing/${id}`);
  revalidatePath('/owner/purchasing');
}

/**
 * Records a goods receipt. Each row is a purchase order item with a quantity received, an optional
 * damaged count and an optional batch number. The database refuses over-receipt and damaged > received.
 */
export async function receiveGoodsAction(_prev: PoFormState, fd: FormData): Promise<PoFormState> {
  const owner = await requireOwnerPermission('purchasing');
  const poBlocked = await checkFeature(owner.storeId, 'purchase_orders');
  if (poBlocked) return { ok: false, message: poBlocked };
  const poId = String(fd.get('poId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(poId)) return { ok: false, message: 'Invalid purchase order' };

  const lines: Record<string, unknown>[] = [];
  for (const key of fd.keys()) {
    const m = /^qty_([0-9a-f-]{36})$/i.exec(key);
    if (!m) continue;
    const itemId = m[1];
    const qty = Number(fd.get(key));
    if (!qty) continue;
    if (!Number.isInteger(qty) || qty < 0) return { ok: false, message: 'Quantities must be whole numbers' };
    const damaged = Number(fd.get(`dmg_${itemId}`) || 0);
    if (!Number.isInteger(damaged) || damaged < 0) return { ok: false, message: 'Damaged counts must be whole numbers' };
    if (damaged > qty) return { ok: false, message: 'Damaged units cannot exceed units received' };
    const batch = String(fd.get(`batch_${itemId}`) ?? '').trim().slice(0, 60);
    lines.push({ po_item_id: itemId, quantity: qty, damaged, batch_number: batch || null });
  }
  if (lines.length === 0) return { ok: false, message: 'Enter a received quantity for at least one line' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('receive_goods', { p_po: poId, p_lines: lines, p_notes: String(fd.get('notes') ?? '').slice(0, 300) || null });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath(`/owner/purchasing/${poId}`);
  revalidatePath('/owner/inventory');
  revalidatePath('/owner/inventory/batches');
  return { ok: true, message: 'Goods receipt recorded and stock updated' };
}
