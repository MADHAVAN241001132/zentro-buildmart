'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { canManageStaff, isStoreRole } from '@/lib/authz/permissions';
import { StaffError, createStaffAccount, loadMyStorePermissions, setStaffAccess, setStaffActive } from '@/lib/services/staff';
import { requireOwnerPermission } from '@/lib/services/owner';
import { ownerAccountSchema } from '@/lib/validation/admin';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Returns to the Staff page with a message. Passwords and personal data never go into the URL.
 * The request key is carried only when a retry should replay the same provisioning request.
 */
function back(kind: 'notice' | 'error', message: string, requestKey?: string): never {
  const key = requestKey && UUID.test(requestKey) ? `&key=${requestKey}` : '';
  redirect(`/owner/staff?${kind}=${encodeURIComponent(message)}${key}`);
}

function messageOf(error: unknown): string {
  return error instanceof StaffError ? error.message : 'The change could not be saved. Please try again.';
}

export async function setStaffAccessAction(formData: FormData): Promise<void> {
  const owner = await requireOwnerPermission('staff_management');
  const profileId = String(formData.get('profileId') ?? '');
  const role = String(formData.get('role') ?? '');
  const permissions = formData.getAll('permission').map(String);
  if (!UUID.test(profileId) || !isStoreRole(role)) back('error', 'Check the change and try again.');
  try {
    await setStaffAccess(owner.storeId, profileId, role, permissions);
  } catch (error) {
    back('error', messageOf(error));
  }
  revalidatePath('/owner/staff');
  back('notice', 'Access updated. The change applies immediately.');
}

export async function setStaffActiveAction(formData: FormData): Promise<void> {
  const owner = await requireOwnerPermission('staff_management');
  const profileId = String(formData.get('profileId') ?? '');
  const active = formData.get('active') === 'true';
  if (!UUID.test(profileId)) back('error', 'Check the change and try again.');
  try {
    await setStaffActive(owner.storeId, profileId, active);
  } catch (error) {
    back('error', messageOf(error));
  }
  revalidatePath('/owner/staff');
  back('notice', active ? 'Account activated.' : 'Account deactivated. The person can no longer use this store.');
}

export async function createStaffAction(formData: FormData): Promise<void> {
  const owner = await requireOwnerPermission('staff_management');
  const held = await loadMyStorePermissions(owner.storeId);
  if (!canManageStaff(held)) back('error', 'You do not have permission to manage staff.');

  const get = (key: string) => String(formData.get(key) ?? '');
  // The key identifies one provisioning request. The form supplies it; a missing or malformed key starts a new request.
  const submittedKey = get('request_key');
  const requestKey = UUID.test(submittedKey) ? submittedKey : crypto.randomUUID();
  const parsed = ownerAccountSchema.safeParse({
    storeId: owner.storeId,
    fullName: get('fullName'),
    email: get('email'),
    phone: get('phone'),
    password: get('password'),
    role: get('role') || 'staff',
  });
  if (!parsed.success) back('error', parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
  const d = parsed.data;
  try {
    await createStaffAccount({
      actorId: owner.userId,
      storeId: owner.storeId,
      callerRole: owner.role,
      callerPermissions: held,
      fullName: d.fullName,
      email: d.email,
      phone: d.phone,
      password: d.password,
      role: d.role,
      permissions: formData.getAll('permission').map(String),
      requestKey,
    });
  } catch (error) {
    // A different-details refusal starts over with a new key. Every other failure keeps the key, so a retry replays it.
    const startOver = error instanceof StaffError && error.code === 'key_reused';
    back('error', messageOf(error), startOver ? undefined : requestKey);
  }
  revalidatePath('/owner/staff');
  back('notice', `Account created for ${d.email}. Share the password through a secure channel.`);
}
