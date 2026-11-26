import 'server-only';
import { keyToUuid } from '@/lib/provisioning/keys';
import { recordAdminAudit } from '@/lib/services/audit';
import { entitlementErrorFrom } from '@/lib/services/entitlements';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  ProvisioningRefused,
  resumeProvisioning,
  runProvisioning,
  type AuthAdapter,
  type AuthCreateOutcome,
  type ClaimOutcome,
  type CreateInput,
  type MembershipResult,
  type ProvisioningDeps,
  type ProvisioningStore,
  type ProvisionResult,
  type RequestRecord,
  type StepResult,
} from '@/lib/provisioning/orchestrator';

type Row = {
  id: string;
  status: string;
  store_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: 'owner' | 'manager' | 'staff';
  permissions: string[];
  onboarding_id: string | null;
  profile_id: string | null;
  reconciliation_reason: string | null;
};

function toRecord(row: Row): RequestRecord {
  return {
    id: row.id,
    status: row.status,
    storeId: row.store_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    permissions: row.permissions ?? [],
    onboardingId: row.onboarding_id,
    profileId: row.profile_id,
    reconciliationReason: row.reconciliation_reason,
  };
}

/** Database store. Every write is a checked RPC wrapper (migrations 0044 to 0046). Reads use the provisioning table. */
export function supabaseProvisioningStore(): ProvisioningStore {
  const admin = createSupabaseAdminClient();

  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) {
      const refusal = new ProvisioningRefused(error.message, error.hint ?? null, error.code ?? null);
      if (/stale claim/i.test(error.message)) throw new Error(error.message);
      throw refusal;
    }
    return data as T;
  }

  return {
    async create(input: CreateInput): Promise<RequestRecord> {
      const row = await call<Row>('zb_prov_create', {
        p_store: input.storeId,
        p_actor: input.actorId,
        p_actor_type: input.actorType,
        p_key: keyToUuid(input.requestKey),
        p_email: input.email,
        p_full_name: input.fullName,
        p_phone: input.phone,
        p_role: input.role,
        p_permissions: input.permissions,
        p_onboarding: input.onboardingId,
      });
      return toRecord(row);
    },
    async load(requestId: string): Promise<RequestRecord | null> {
      const { data, error } = await admin
        .from('account_provisioning_requests')
        .select('id, status, store_id, email, full_name, phone, role, permissions, onboarding_id, profile_id, reconciliation_reason')
        .eq('id', requestId)
        .maybeSingle();
      if (error) throw new Error('Could not load the provisioning request');
      return data ? toRecord(data as Row) : null;
    },
    async claim(requestId: string): Promise<ClaimOutcome> {
      const result = await call<Record<string, unknown>>('zb_prov_claim', { p_id: requestId, p_lease_seconds: 120 });
      switch (result.outcome) {
        case 'claimed':
          return { outcome: 'claimed', token: String(result.token), step: result.step as 'auth', profileId: (result.profile_id as string | null) ?? null };
        case 'completed':
          return { outcome: 'completed', profileId: (result.profile_id as string | null) ?? null };
        case 'reconciliation':
          return { outcome: 'reconciliation', reason: String(result.reason) };
        default:
          return { outcome: 'busy' };
      }
    },
    async recordAuth(requestId, token, profileId) {
      await call('zb_prov_record_auth', { p_id: requestId, p_token: token, p_profile: profileId });
    },
    async linkMembership(requestId, token): Promise<MembershipResult> {
      const result = await call<Record<string, unknown>>('zb_prov_link_membership', { p_id: requestId, p_token: token });
      if (result.ok === true) return { status: 'linked' };
      if (result.code === 'membership_conflict') return { status: 'reconciliation', code: 'membership_conflict' };
      return { status: 'refused', code: String(result.code), message: String(result.message ?? 'The membership could not be linked') };
    },
    async linkOnboarding(requestId, token): Promise<StepResult> {
      const result = await call<Record<string, unknown>>('zb_prov_link_onboarding', { p_id: requestId, p_token: token });
      return result.ok === true ? { ok: true } : { ok: false, code: String(result.code), message: 'The onboarding could not be linked' };
    },
    async complete(requestId, token) {
      await call('zb_prov_complete', { p_id: requestId, p_token: token });
    },
    async fail(requestId, token, code, message) {
      await call('zb_prov_fail', { p_id: requestId, p_token: token, p_code: code, p_message: message });
    },
    async flagReconciliation(requestId, token, reason) {
      await call('zb_prov_flag_reconciliation', { p_id: requestId, p_token: token, p_reason: reason });
    },
  };
}

/**
 * Auth adapter. Only createUser is used. The outcome is classified so a failure that may have created the
 * account is never treated as a clean failure. Deletion is not part of this adapter.
 */
export function supabaseAuthAdapter(): AuthAdapter {
  const admin = createSupabaseAdminClient();
  return {
    async createUser({ email, password, fullName }): Promise<AuthCreateOutcome> {
      try {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error) {
          if (/already|registered/i.test(error.message)) return { kind: 'exists' };
          const status = (error as { status?: number }).status;
          // A server-side failure, or no response, can mean the account was created. Treat it as uncertain.
          if (!status || status >= 500) return { kind: 'uncertain' };
          return { kind: 'rejected', message: 'The password or email was not accepted. Check them and try again.' };
        }
        if (!data.user) return { kind: 'uncertain' };
        return { kind: 'created', userId: data.user.id };
      } catch {
        return { kind: 'uncertain' };
      }
    },
  };
}

export function provisioningDeps(): ProvisioningDeps {
  return { store: supabaseProvisioningStore(), auth: supabaseAuthAdapter() };
}

/**
 * Provisions one store account. The caller must already have checked the actor's authority in the UI and
 * server action; the database re-checks it. Writes an audit entry when the account is complete.
 */
export async function provisionAccount(input: CreateInput & { password: string }): Promise<ProvisionResult & { auditFailed?: boolean }> {
  const result = await runProvisioning(provisioningDeps(), input);
  if (!result.ok || result.replay) return result;
  let auditFailed = false;
  try {
    await recordAdminAudit({
      actorId: input.actorId,
      storeId: input.storeId,
      action: 'owner.created',
      entityType: 'store_owner',
      entityId: result.profileId,
      after: { role: input.role, request_id: result.requestId },
      actorType: input.actorType,
    });
  } catch {
    auditFailed = true;
  }
  return { ...result, auditFailed };
}

export { resumeProvisioning, entitlementErrorFrom };
