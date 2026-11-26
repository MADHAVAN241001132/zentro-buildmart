'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface OrderActionState {
  ok: boolean;
  message?: string;
}

const NEXT_STATUS: Record<string, string> = {
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'PACKED',
  PACKED: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'COMPLETED',
};

const inputSchema = z.object({ orderId: z.string().uuid(), currentStatus: z.string().min(1).max(40) });

/** Moves a paid pickup order to its next status. The database enforces the transition rules. */
export async function advanceOrderAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const owner = await requireOwnerPermission('order_management');

  const parsed = inputSchema.safeParse({ orderId: formData.get('orderId'), currentStatus: formData.get('currentStatus') });
  if (!parsed.success) return { ok: false, message: 'Invalid order' };
  const next = NEXT_STATUS[parsed.data.currentStatus];
  if (!next) return { ok: false, message: 'This order has no further status step' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('transition_order_status', {
    p_order: parsed.data.orderId,
    p_to: next,
    p_note: 'owner portal',
  });
  if (error) return { ok: false, message: 'The order could not be moved to that status' };
  revalidatePath('/owner/orders');
  return { ok: true, message: `Order moved to ${next.replace(/_/g, ' ').toLowerCase()}` };
}
