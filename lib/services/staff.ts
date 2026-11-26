import 'server-only';
import { changesOutsideAuthority, isPermissionKey, isStoreRole, type StoreRole } from '@/lib/authz/permissions';
import { createOwnerAccount } from '@/lib/services/owner-accounts';
export { loadMyStorePermissions } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface StoreMember {
  profileId: string;
  fullName: string | null;
  role: StoreRole;
  isActive: boolean;
  permissions: string[];
  createdAt: string;
}

/** A failure the page can show. Messages come from the database rules or from this module, never from a stack trace. */
export class StaffError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 500, message: string, readonly code?: string) {
    super(message);
  }
}

const PASS_THROUGH_CODES = new Set(['42501', 'P0001', 'P0002', '22023']);

function fromDatabase(error: { code?: string; message?: string }): StaffError {
  if (error.code && PASS_THROUGH_CODES.has(error.code) && error.message) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : 409;
    return new StaffError(status, error.message);
  }
  return new StaffError(500, 'The change could not be saved. Please try again.');
}

export async function listStoreMembers(storeId: string): Promise<StoreMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('zb_store_members', { p_store: storeId });
  if (error) throw fromDatabase(error);
  return ((data ?? []) as Array<{ profile_id: string; full_name: string | null; role: string; is_active: boolean; permissions: string[] | null; created_at: string }>)
    .filter((row) => isStoreRole(row.role))
    .map((row) => ({
      profileId: row.profile_id,
      fullName: row.full_name,
      role: row.role as StoreRole,
      isActive: row.is_active,
      permissions: (row.permissions ?? []).filter(isPermissionKey),
      createdAt: row.created_at,
    }));
}

function cleanPermissions(permissions: string[]): string[] {
  const unique = [...new Set(permissions)];
  if (!unique.every(isPermissionKey)) throw new StaffError(400, 'Unknown permission');
  return unique;
}

export async function setStaffAccess(storeId: string, profileId: string, role: StoreRole, permissions: string[]): Promise<void> {
  if (!isStoreRole(role)) throw new StaffError(400, 'Unknown role');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('zb_set_store_member_access', {
    p_store: storeId,
    p_profile: profileId,
    p_role: role,
    p_permissions: role === 'owner' ? [] : cleanPermissions(permissions),
  });
  if (error) throw fromDatabase(error);
}

export async function setStaffActive(storeId: string, profileId: string, active: boolean): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('zb_set_store_member_active', { p_store: storeId, p_profile: profileId, p_active: active });
  if (error) throw fromDatabase(error);
}

export interface StaffAccountInput {
  actorId: string;
  storeId: string;
  callerRole: StoreRole;
  callerPermissions: string[];
  fullName: string;
  email: string;
  phone: string | null;
  password: string;
  role: StoreRole;
  permissions: string[];
  /** Stable key from the form, so a repeated submission returns the same account. */
  requestKey?: string;
}

/**
 * Creates a store account for a manager or staff member, or an owner. Only an owner may create an owner, and the
 * permissions given can be no more than the caller holds. The user quota is enforced by the database when the
 * membership is inserted. A failed step is recorded for review; no account is deleted automatically.
 */
export async function createStaffAccount(input: StaffAccountInput): Promise<{ profileId: string; auditFailed: boolean }> {
  if (input.role === 'owner' && input.callerRole !== 'owner') {
    throw new StaffError(403, 'Only an owner can create an owner account');
  }
  const permissions = cleanPermissions(input.permissions);
  if (changesOutsideAuthority(input.callerPermissions, [], permissions).length > 0) {
    throw new StaffError(403, 'You cannot give a permission you do not hold');
  }
  const result = await createOwnerAccount({
    actorId: input.actorId,
    storeId: input.storeId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    password: input.password,
    role: input.role,
    permissions,
    actorType: 'shop_owner',
    requestKey: input.requestKey,
  });
  if (!result.ok) throw new StaffError(result.emailTaken || result.code === 'key_reused' ? 409 : 500, result.message, result.code);
  return { profileId: result.profileId, auditFailed: result.auditFailed };
}
