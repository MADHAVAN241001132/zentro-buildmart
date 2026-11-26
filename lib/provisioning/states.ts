/**
 * Provisioning states and transitions. Pure, with no server imports, so it can be tested directly.
 * The database enforces the same states (migrations 0044 to 0046). This module decides the next step to run.
 */
export const PROVISIONING_STATES = [
  'REQUESTED',
  'AUTH_PENDING',
  'AUTH_CREATED',
  'MEMBERSHIP_PENDING',
  'MEMBERSHIP_LINKED',
  'ONBOARDING_LINKED',
  'COMPLETED',
  'FAILED',
  'RECONCILIATION_REQUIRED',
] as const;

export type ProvisioningState = (typeof PROVISIONING_STATES)[number];
export type ProvisioningStep = 'auth' | 'membership' | 'onboarding' | 'complete';

const TRANSITIONS: Record<ProvisioningState, readonly ProvisioningState[]> = {
  REQUESTED: ['AUTH_PENDING', 'RECONCILIATION_REQUIRED', 'FAILED'],
  AUTH_PENDING: ['AUTH_CREATED', 'RECONCILIATION_REQUIRED', 'FAILED'],
  AUTH_CREATED: ['MEMBERSHIP_PENDING', 'FAILED'],
  MEMBERSHIP_PENDING: ['MEMBERSHIP_LINKED', 'FAILED', 'RECONCILIATION_REQUIRED'],
  MEMBERSHIP_LINKED: ['ONBOARDING_LINKED', 'COMPLETED', 'FAILED'],
  ONBOARDING_LINKED: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['AUTH_PENDING', 'AUTH_CREATED', 'MEMBERSHIP_PENDING', 'MEMBERSHIP_LINKED', 'ONBOARDING_LINKED', 'FAILED'],
  RECONCILIATION_REQUIRED: ['AUTH_CREATED', 'FAILED'],
};

export function canTransition(from: ProvisioningState, to: ProvisioningState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The step to run next, derived from recorded facts rather than from the status alone. */
export function nextStep(facts: { hasProfile: boolean; membershipLinked: boolean; onboardingPending: boolean }): ProvisioningStep {
  if (!facts.hasProfile) return 'auth';
  if (!facts.membershipLinked) return 'membership';
  if (facts.onboardingPending) return 'onboarding';
  return 'complete';
}

/** Whether an automatic retry is safe. An Auth step with no recorded result is never retried automatically. */
export function isAutomaticallyRetryable(state: ProvisioningState, hasProfile: boolean): boolean {
  if (state === 'COMPLETED' || state === 'RECONCILIATION_REQUIRED') return false;
  if (state === 'AUTH_PENDING' && !hasProfile) return false;
  return true;
}

/** Keys that may hold a credential or a claim token. They are removed before any record leaves the server. */
const SECRET_KEY = /pass|secret|credential|claim_token|token/i;

/** Removes credential-like fields, so nothing secret reaches a log, a page or an audit entry. */
export function withoutCredentials<T extends Record<string, unknown>>(record: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!SECRET_KEY.test(key)) out[key] = value;
  }
  return out as Partial<T>;
}
