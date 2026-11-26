'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createOwnerAccount } from '@/lib/services/owner-accounts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ownerAccountSchema } from '@/lib/validation/admin';
import { issuesToFields } from '@/lib/validation/owner';

export interface OwnerFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Creates an owner account for a store. The account, profile and store link are created by the shared
 * owner-account service, which rolls back partial work. The password is shown to the administrator once,
 * by the administrator's own choice, and is never stored in the database or in audit logs.
 */
export async function createOwnerAction(_prev: OwnerFormState, fd: FormData): Promise<OwnerFormState> {
  const admin = await requireAdmin();
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  const parsed = ownerAccountSchema.safeParse({
    storeId: get('storeId'),
    fullName: get('fullName'),
    email: get('email'),
    phone: get('phone'),
    password: get('password'),
    role: get('role') || 'owner',
  });
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const d = parsed.data;

  const result = await createOwnerAccount({
    actorId: admin.userId,
    storeId: d.storeId,
    fullName: d.fullName,
    email: d.email,
    phone: d.phone,
    password: d.password,
    role: d.role,
  });
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/admin/owners');
  if (result.auditFailed) {
    return { ok: true, message: 'Owner account created, but the audit entry could not be written. Check the audit log configuration.' };
  }
  return { ok: true, message: `Owner account created for ${d.email}. Share the password through a secure channel.` };
}

export async function setOwnerActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const storeId = String(formData.get('storeId') ?? '');
  const profileId = String(formData.get('profileId') ?? '');
  const active = formData.get('active') === 'true';
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !/^[0-9a-f-]{36}$/i.test(profileId)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('store_owners').update({ is_active: active }).eq('store_id', storeId).eq('profile_id', profileId);
  if (error) return;
  await recordAdminAudit({ actorId: admin.userId, storeId, action: active ? 'owner.reactivated' : 'owner.deactivated', entityType: 'store_owner', entityId: profileId, after: { is_active: active } });
  revalidatePath('/admin/owners');
}
