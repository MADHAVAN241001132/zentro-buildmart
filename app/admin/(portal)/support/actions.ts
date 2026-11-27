'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ticketSchema } from '@/lib/validation/admin';

export interface TicketUpdateState {
  ok: boolean;
  message?: string;
  status?: string;
  priority?: string;
}

export async function updateTicketAction(_prev: TicketUpdateState, formData: FormData): Promise<TicketUpdateState> {
  const admin = await requireAdmin();
  const parsed = ticketSchema.safeParse({
    ticketId: String(formData.get('ticketId') ?? ''),
    status: String(formData.get('status') ?? ''),
    priority: String(formData.get('priority') ?? ''),
  });
  if (!parsed.success) {
    return { ok: false, message: 'Invalid status or priority selected.' };
  }
  const d = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data: before } = await supabase.from('support_tickets').select('store_id, status, priority').eq('id', d.ticketId).maybeSingle();
  if (!before) return { ok: false, message: 'Ticket not found.' };

  const closing = d.status === 'resolved' || d.status === 'closed';
  const { error } = await supabase
    .from('support_tickets')
    .update({ status: d.status, priority: d.priority, updated_at: new Date().toISOString(), resolved_at: closing ? new Date().toISOString() : null })
    .eq('id', d.ticketId);
  if (error) {
    return { ok: false, message: 'Could not update ticket. Please try again.' };
  }

  await recordAdminAudit({
    actorId: admin.userId,
    storeId: (before.store_id as string | null) ?? null,
    action: 'ticket.updated',
    entityType: 'support_ticket',
    entityId: d.ticketId,
    before: { status: before.status, priority: before.priority },
    after: { status: d.status, priority: d.priority },
  });
  revalidatePath('/admin/support');
  revalidatePath('/admin');
  return { ok: true, message: 'Saved', status: d.status, priority: d.priority };
}
