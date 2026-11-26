import 'server-only';
import { provisionAccount } from '@/lib/services/provisioning';

export interface OwnerAccountInput {
  actorId: string;
  storeId: string;
  fullName: string;
  email: string;
  phone: string | null;
  password: string;
  role: 'owner' | 'manager' | 'staff';
  /** Permissions for a manager or staff member. Owners hold all permissions implicitly. */
  permissions?: string[];
  actorType?: 'super_admin' | 'shop_owner';
  /** Stable key from the form. Repeating a submission with the same key returns the same account. */
  requestKey?: string;
  /** Onboarding record to link when the account is created by the onboarding wizard. */
  onboardingId?: string | null;
}

export type OwnerAccountResult =
  | { ok: true; profileId: string; auditFailed: boolean; requestId: string }
  | { ok: false; message: string; emailTaken: boolean; requestId?: string; needsReview?: boolean; code?: string };

/**
 * Creates a store account through the durable provisioning workflow (lib/provisioning/orchestrator.ts).
 * The request is recorded before any external call, so an interrupted attempt is resumed or reviewed, never
 * silently repeated. No Auth account is deleted here: a failed step leaves a recorded state for review.
 * The password is used for the Auth call only and is never stored, logged or audited.
 *
 * Shared by the Owners page, the onboarding wizard and staff creation.
 */
export async function createOwnerAccount(input: OwnerAccountInput): Promise<OwnerAccountResult> {
  const requestKey = input.requestKey ?? crypto.randomUUID();
  const result = await provisionAccount({
    actorId: input.actorId,
    actorType: input.actorType ?? 'shop_owner',
    requestKey,
    storeId: input.storeId,
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName,
    phone: input.phone,
    role: input.role,
    permissions: [...new Set(input.permissions ?? [])],
    onboardingId: input.onboardingId ?? null,
    password: input.password,
  });

  if (result.ok) {
    return { ok: true, profileId: result.profileId, auditFailed: result.auditFailed ?? false, requestId: result.requestId };
  }
  if (result.code === 'reconciliation') {
    return { ok: false, message: result.message, emailTaken: result.reason === 'existing_account', requestId: result.requestId, needsReview: true };
  }
  return { ok: false, message: result.message, emailTaken: false, requestId: result.requestId, code: result.code };
}
