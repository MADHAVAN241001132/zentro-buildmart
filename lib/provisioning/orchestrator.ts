import { isAutomaticallyRetryable, nextStep, type ProvisioningState, type ProvisioningStep } from '@/lib/provisioning/states';

/**
 * Durable provisioning workflow. Dependencies are injected: the database store (RPC wrappers in migration 0046,
 * reads from the provisioning table) and the Auth adapter. Tests supply in-memory doubles.
 * The password goes to the Auth adapter for one call and is never given to the store, logged or returned.
 */

export interface CreateInput {
  actorId: string;
  actorType: 'super_admin' | 'shop_owner';
  requestKey: string;
  storeId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: 'owner' | 'manager' | 'staff';
  permissions: string[];
  onboardingId: string | null;
}

export interface RequestRecord {
  id: string;
  status: string;
  storeId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: 'owner' | 'manager' | 'staff';
  permissions: string[];
  onboardingId: string | null;
  profileId: string | null;
  reconciliationReason: string | null;
}

export type ClaimOutcome =
  | { outcome: 'claimed'; token: string; step: ProvisioningStep; profileId: string | null }
  | { outcome: 'busy' }
  | { outcome: 'completed'; profileId: string | null }
  | { outcome: 'reconciliation'; reason: string };

export type StepResult = { ok: true } | { ok: false; code: string; message: string };
export type MembershipResult =
  | { status: 'linked' }
  | { status: 'refused'; code: string; message: string }
  | { status: 'reconciliation'; code: string };

export interface ProvisioningStore {
  create(input: CreateInput): Promise<RequestRecord>;
  load(requestId: string): Promise<RequestRecord | null>;
  claim(requestId: string): Promise<ClaimOutcome>;
  recordAuth(requestId: string, token: string, profileId: string): Promise<void>;
  linkMembership(requestId: string, token: string): Promise<MembershipResult>;
  linkOnboarding(requestId: string, token: string): Promise<StepResult>;
  complete(requestId: string, token: string): Promise<void>;
  fail(requestId: string, token: string, code: string, message: string): Promise<void>;
  flagReconciliation(requestId: string, token: string, reason: 'existing_account' | 'auth_outcome_uncertain'): Promise<void>;
}

export type AuthCreateOutcome =
  | { kind: 'created'; userId: string }
  | { kind: 'exists' }
  | { kind: 'uncertain' }
  | { kind: 'rejected'; message: string };

export interface AuthAdapter {
  createUser(input: { email: string; password: string; fullName: string }): Promise<AuthCreateOutcome>;
}

export interface ProvisioningDeps {
  store: ProvisioningStore;
  auth: AuthAdapter;
}

export type ProvisionResult =
  | { ok: true; requestId: string; profileId: string; replay: boolean }
  | {
      ok: false;
      requestId?: string;
      code: 'open_request' | 'key_reused' | 'forbidden' | 'busy' | 'needs_password' | 'reconciliation' | 'failed' | 'rejected' | 'not_found';
      reason?: string;
      message: string;
    };

/** Thrown by the store when the database refuses a request. `hint` and `sqlstate` come from the database error. */
export class ProvisioningRefused extends Error {
  constructor(message: string, readonly hint: string | null = null, readonly sqlstate: string | null = null) {
    super(message);
  }
}

const RECONCILE_MESSAGE: Record<string, string> = {
  existing_account: 'An account with this email already exists. An administrator must review it before it can be linked.',
  auth_outcome_uncertain: 'An earlier attempt to create this account had an unknown outcome. An administrator must check it.',
  membership_conflict: 'This account already has a different role in the store. An administrator must review it.',
};

/** Creates the request (idempotent by actor and key), then runs it. */
export async function runProvisioning(deps: ProvisioningDeps, input: CreateInput & { password?: string }): Promise<ProvisionResult> {
  let record: RequestRecord;
  try {
    record = await deps.store.create(input);
  } catch (error) {
    if (error instanceof ProvisioningRefused && error.hint === 'open_request_exists') {
      return { ok: false, code: 'open_request', message: 'A request for this email is already in progress. Check the provisioning list before trying again.' };
    }
    if (error instanceof ProvisioningRefused && error.hint === 'key_reused') {
      return { ok: false, code: 'key_reused', message: 'This form was submitted earlier with different details. Submit it again to start a new request.' };
    }
    throw error;
  }
  return executeProvisioning(deps, record, input.password);
}

/** Resumes a stored request, for example from the administrative reconciliation list. */
export async function resumeProvisioning(deps: ProvisioningDeps, requestId: string, password?: string): Promise<ProvisionResult> {
  const record = await deps.store.load(requestId);
  if (!record) return { ok: false, requestId, code: 'not_found', message: 'The provisioning request was not found.' };
  return executeProvisioning(deps, record, password);
}

async function executeProvisioning(deps: ProvisioningDeps, record: RequestRecord, password: string | undefined): Promise<ProvisionResult> {
  if (record.status === 'COMPLETED') {
    return { ok: true, requestId: record.id, profileId: record.profileId ?? '', replay: true };
  }

  // Credentials are needed only to create a new Auth account. Ask before taking a claim, so no lease is held without them.
  if (!record.profileId && !password && isAutomaticallyRetryable(record.status as ProvisioningState, false)) {
    return { ok: false, requestId: record.id, code: 'needs_password', message: 'Enter the password again to continue creating this account.' };
  }

  let claim: ClaimOutcome;
  try {
    claim = await deps.store.claim(record.id);
  } catch (error) {
    // The database re-checks the stored actor on every claim. A refusal here means that authority has gone.
    if (error instanceof ProvisioningRefused && error.sqlstate === '42501') {
      return { ok: false, requestId: record.id, code: 'forbidden', message: 'The person who started this request no longer has the authority to complete it.' };
    }
    throw error;
  }
  if (claim.outcome === 'busy') return { ok: false, requestId: record.id, code: 'busy', message: 'This request is already being processed.' };
  if (claim.outcome === 'completed') return { ok: true, requestId: record.id, profileId: claim.profileId ?? '', replay: true };
  if (claim.outcome === 'reconciliation') {
    return {
      ok: false,
      requestId: record.id,
      code: 'reconciliation',
      reason: claim.reason,
      message: RECONCILE_MESSAGE[claim.reason] ?? 'An administrator must review this request.',
    };
  }

  const { token } = claim;
  try {
    let profileId = claim.profileId;
    let step: ProvisioningStep = claim.step;

    if (step === 'auth') {
      if (!password) {
        await deps.store.fail(record.id, token, 'needs_password', 'The password is needed to create this account.');
        return { ok: false, requestId: record.id, code: 'needs_password', message: 'Enter the password again to continue creating this account.' };
      }
      // The password is used for this one Auth call. It is not kept on the record or in any log.
      const created = await deps.auth.createUser({ email: record.email, password, fullName: record.fullName });
      if (created.kind === 'exists') {
        await deps.store.flagReconciliation(record.id, token, 'existing_account');
        return { ok: false, requestId: record.id, code: 'reconciliation', reason: 'existing_account', message: RECONCILE_MESSAGE.existing_account ?? 'An account with this email already exists.' };
      }
      if (created.kind === 'uncertain') {
        // The Auth call may have succeeded. It is not repeated; an administrator checks first.
        await deps.store.flagReconciliation(record.id, token, 'auth_outcome_uncertain');
        return {
          ok: false,
          requestId: record.id,
          code: 'reconciliation',
          reason: 'auth_outcome_uncertain',
          message: RECONCILE_MESSAGE.auth_outcome_uncertain ?? 'Account creation outcome is uncertain. Please reconcile.',
        };
      }
      if (created.kind === 'rejected') {
        await deps.store.fail(record.id, token, 'auth_rejected', created.message);
        return { ok: false, requestId: record.id, code: 'rejected', message: created.message };
      }
      await deps.store.recordAuth(record.id, token, created.userId);
      profileId = created.userId;
      step = 'membership';
    }

    if (step === 'membership') {
      const linked = await deps.store.linkMembership(record.id, token);
      if (linked.status === 'reconciliation') {
        return {
          ok: false,
          requestId: record.id,
          code: 'reconciliation',
          reason: linked.code,
          message: RECONCILE_MESSAGE[linked.code] ?? 'An administrator must review this request.',
        };
      }
      if (linked.status === 'refused') return { ok: false, requestId: record.id, code: 'failed', message: linked.message };
      step = nextStep({ hasProfile: true, membershipLinked: true, onboardingPending: record.onboardingId !== null });
    }

    if (step === 'onboarding') {
      const onboarding = await deps.store.linkOnboarding(record.id, token);
      if (!onboarding.ok) {
        await deps.store.fail(record.id, token, onboarding.code, onboarding.message);
        return { ok: false, requestId: record.id, code: 'failed', message: onboarding.message };
      }
    }

    await deps.store.complete(record.id, token);
    return { ok: true, requestId: record.id, profileId: profileId ?? '', replay: false };
  } catch (error) {
    // A stale claim means another attempt owns the request now. Its state is not changed here.
    const message = error instanceof Error ? error.message : 'unknown error';
    if (/stale claim/i.test(message)) return { ok: false, requestId: record.id, code: 'busy', message: 'This request is already being processed.' };
    await deps.store.fail(record.id, token, 'unexpected_error', 'The step did not complete. It can be retried.').catch(() => undefined);
    return { ok: false, requestId: record.id, code: 'failed', message: 'The account could not be completed. Retry from the provisioning list.' };
  }
}
