'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Turns a showroom QR code on or off. The storefront refuses to serve a store without an active showroom QR. */
export async function setShowroomQrActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === 'true';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('qr_codes').select('store_id, is_active').eq('id', id).maybeSingle();
  if (!before) return;
  const { error } = await supabase.from('qr_codes').update({ is_active: active }).eq('id', id);
  if (error) return;
  await recordAdminAudit({ actorId: admin.userId, storeId: before.store_id as string, action: active ? 'qr.activated' : 'qr.deactivated', entityType: 'qr_code', entityId: id, before: { is_active: before.is_active }, after: { is_active: active } });
  revalidatePath('/admin/qr');
}
