'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ticketSchema } from '@/lib/validation/admin';

export async function updateTicketAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = ticketSchema.safeParse({
    ticketId: String(formData.get('ticketId') ?? ''),
    status: String(formData.get('status') ?? ''),
    priority: String(formData.get('priority') ?? ''),
  });
  if (!parsed.success) return;
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('support_tickets').select('store_id, status, priority').eq('id', d.ticketId).maybeSingle();
  if (!before) return;
  const closing = d.status === 'resolved' || d.status === 'closed';
  const { error } = await supabase
    .from('support_tickets')
    .update({ status: d.status, priority: d.priority, updated_at: new Date().toISOString(), resolved_at: closing ? new Date().toISOString() : null })
    .eq('id', d.ticketId);
  if (error) return;

  await recordAdminAudit({ actorId: admin.userId, storeId: (before.store_id as string | null) ?? null, action: 'ticket.updated', entityType: 'support_ticket', entityId: d.ticketId, before: { status: before.status, priority: before.priority }, after: { status: d.status, priority: d.priority } });
  revalidatePath('/admin/support');
}
