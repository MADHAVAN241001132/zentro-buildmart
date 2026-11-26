import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { keyToUuid } from '@/lib/provisioning/keys';
import { canTransition, isAutomaticallyRetryable, nextStep, withoutCredentials } from '@/lib/provisioning/states';
import {
  ProvisioningRefused,
  resumeProvisioning,
  runProvisioning,
  type AuthAdapter,
  type ClaimOutcome,
  type CreateInput,
  type MembershipResult,
  type ProvisioningStore,
  type RequestRecord,
} from '@/lib/provisioning/orchestrator';

const INPUT: CreateInput = {
  actorId: 'admin-1',
  actorType: 'super_admin',
  requestKey: 'key-1',
  storeId: 'store-1',
  email: 'owner@example.com',
  fullName: 'Owner Name',
  phone: null,
  role: 'owner',
  permissions: [],
  onboardingId: null,
};

/** In-memory store double. Mirrors the database rules: one open request per email, one active claim, no re-entry. */
function fakeStore(opts: { membership?: MembershipResult; onboardingOk?: boolean } = {}) {
  const requests = new Map<string, RequestRecord & { token: string | null; leaseActive: boolean; attempts: number }>();
  const events: string[] = [];
  let seq = 0;
  const store: ProvisioningStore = {
    async create(input) {
      const open = [...requests.values()].find((r) => r.email === input.email && r.status !== 'COMPLETED' && r.status !== 'FAILED');
      if (open) throw new ProvisioningRefused('open', 'open_request_exists');
      const id = `req-${++seq}`;
      const rec = {
        id,
        status: 'REQUESTED',
        storeId: input.storeId,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role,
        permissions: input.permissions,
        onboardingId: input.onboardingId,
        profileId: null,
        reconciliationReason: null,
        token: null,
        leaseActive: false,
        attempts: 0,
      };
      requests.set(id, rec);
      return rec;
    },
    async load(id) {
      return requests.get(id) ?? null;
    },
    async claim(id): Promise<ClaimOutcome> {
      const r = requests.get(id)!;
      if (r.status === 'COMPLETED') return { outcome: 'completed', profileId: r.profileId };
      if (r.status === 'RECONCILIATION_REQUIRED') return { outcome: 'reconciliation', reason: r.reconciliationReason ?? 'auth_outcome_uncertain' };
      if (r.leaseActive) return { outcome: 'busy' };
      r.leaseActive = true;
      r.token = `tok-${++seq}`;
      r.attempts += 1;
      const step = r.profileId ? (r.status === 'AUTH_CREATED' ? 'membership' : r.status === 'MEMBERSHIP_LINKED' ? 'onboarding' : 'membership') : 'auth';
      events.push(`claim:${step}`);
      return { outcome: 'claimed', token: r.token, step: step as 'auth', profileId: r.profileId };
    },
    async recordAuth(id, token, profileId) {
      const r = requests.get(id)!;
      assert.equal(token, r.token);
      r.profileId = profileId;
      r.status = 'AUTH_CREATED';
      events.push('auth:recorded');
    },
    async linkMembership(id, token) {
      const r = requests.get(id)!;
      assert.equal(token, r.token);
      events.push('membership');
      if (opts.membership) return opts.membership;
      r.status = 'MEMBERSHIP_LINKED';
      return { status: 'linked' };
    },
    async linkOnboarding(id) {
      const r = requests.get(id)!;
      events.push('onboarding');
      if (opts.onboardingOk === false) return { ok: false, code: 'onboarding_failed', message: 'x' };
      r.status = 'ONBOARDING_LINKED';
      return { ok: true };
    },
    async complete(id) {
      const r = requests.get(id)!;
      r.status = 'COMPLETED';
      r.leaseActive = false;
      events.push('complete');
    },
    async fail(id, _token, code) {
      const r = requests.get(id)!;
      r.status = 'FAILED';
      r.leaseActive = false;
      events.push(`fail:${code}`);
    },
    async flagReconciliation(id, _token, reason) {
      const r = requests.get(id)!;
      r.status = 'RECONCILIATION_REQUIRED';
      r.reconciliationReason = reason;
      r.leaseActive = false;
      events.push(`reconcile:${reason}`);
    },
  };
  return { store, requests, events };
}

function fakeAuth(outcome: Awaited<ReturnType<AuthAdapter['createUser']>>) {
  const calls: unknown[] = [];
  const auth: AuthAdapter = {
    async createUser(input) {
      calls.push(input);
      return outcome;
    },
  };
  return { auth, calls };
}

test('creates an account and completes the request', async () => {
  const { store, requests, events } = fakeStore();
  const { auth, calls } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const res = await runProvisioning({ store, auth }, { ...INPUT, password: 'correct-horse-1' });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(requests.get('req-1')!.status, 'COMPLETED');
  assert.deepEqual(events, ['claim:auth', 'auth:recorded', 'membership', 'complete']);
});

test('duplicate open request for the same email is refused', async () => {
  const { store } = fakeStore();
  const { auth } = fakeAuth({ kind: 'uncertain' });
  await runProvisioning({ store, auth }, { ...INPUT, password: 'p', requestKey: 'a' });
  const dup = await runProvisioning({ store, auth }, { ...INPUT, password: 'p', requestKey: 'b' });
  assert.equal(dup.ok === false && dup.code, 'open_request');
});

test('replay of a completed request does not call Auth again', async () => {
  const { store, requests } = fakeStore();
  const { auth, calls } = fakeAuth({ kind: 'created', userId: 'user-1' });
  await runProvisioning({ store, auth }, { ...INPUT, password: 'p' });
  const again = await resumeProvisioning({ store, auth }, 'req-1');
  assert.equal(again.ok && again.replay, true);
  assert.equal(calls.length, 1);
  assert.equal(requests.get('req-1')!.status, 'COMPLETED');
});

test('busy claim is reported and does not call Auth', async () => {
  const { store, requests } = fakeStore();
  const { auth, calls } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const first = await store.create(INPUT);
  requests.get(first.id)!.leaseActive = true;
  const res = await resumeProvisioning({ store, auth }, first.id, 'p');
  assert.equal(res.ok === false && res.code, 'busy');
  assert.equal(calls.length, 0);
});

test('existing Auth account is routed to review and never linked silently', async () => {
  const { store, requests } = fakeStore();
  const { auth } = fakeAuth({ kind: 'exists' });
  const res = await runProvisioning({ store, auth }, { ...INPUT, password: 'p' });
  assert.equal(res.ok === false && res.code, 'reconciliation');
  assert.equal(requests.get('req-1')!.status, 'RECONCILIATION_REQUIRED');
  assert.equal(requests.get('req-1')!.profileId, null);
});

test('uncertain Auth outcome is routed to review and not repeated', async () => {
  const { store, requests } = fakeStore();
  const { auth, calls } = fakeAuth({ kind: 'uncertain' });
  const res = await runProvisioning({ store, auth }, { ...INPUT, password: 'p' });
  assert.equal(res.ok === false && res.code, 'reconciliation');
  assert.equal(calls.length, 1);
  assert.equal(requests.get('req-1')!.reconciliationReason, 'auth_outcome_uncertain');
  // Resume must not repeat the Auth call.
  const resumed = await resumeProvisioning({ store, auth }, 'req-1', 'p');
  assert.equal(resumed.ok === false && resumed.code, 'reconciliation');
  assert.equal(calls.length, 1);
});

test('Auth created but membership refused, then retry resumes without a second Auth call', async () => {
  const refused: MembershipResult = { status: 'refused', code: 'user_limit', message: 'The user limit for the current plan has been reached' };
  const failing = fakeStore({ membership: refused });
  const { auth, calls } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const first = await runProvisioning({ store: failing.store, auth }, { ...INPUT, password: 'p' });
  assert.equal(first.ok, false);
  assert.equal(failing.requests.get('req-1')!.profileId, 'user-1');
  // Retry against a store where the membership now links. The stored profile is reused and no password is needed.
  const healthy = fakeStore();
  healthy.requests.set('req-1', { ...failing.requests.get('req-1')!, status: 'AUTH_CREATED', leaseActive: false });
  const retry = await resumeProvisioning({ store: healthy.store, auth }, 'req-1');
  assert.equal(retry.ok, true);
  assert.equal(calls.length, 1);
});

test('membership created but onboarding link fails, then the request is marked failed', async () => {
  const { store, requests } = fakeStore({ onboardingOk: false });
  const { auth } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const res = await runProvisioning({ store, auth }, { ...INPUT, onboardingId: 'onb-1', password: 'p' });
  assert.equal(res.ok, false);
  assert.equal(requests.get('req-1')!.status, 'FAILED');
  assert.equal(requests.get('req-1')!.profileId, 'user-1');
});

test('quota refusal is reported and the Auth account is kept for review', async () => {
  const { store, requests } = fakeStore({ membership: { status: 'refused', code: 'user_limit', message: 'The user limit for the current plan has been reached' } });
  const { auth } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const res = await runProvisioning({ store, auth }, { ...INPUT, password: 'p' });
  assert.equal(res.ok === false && res.message.includes('user limit'), true);
  assert.equal(requests.get('req-1')!.profileId, 'user-1');
});

test('no password and no stored profile asks for a password before taking a claim', async () => {
  const { store, requests } = fakeStore();
  const { auth, calls } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const req = await store.create(INPUT);
  const res = await resumeProvisioning({ store, auth }, req.id);
  assert.equal(res.ok === false && res.code, 'needs_password');
  assert.equal(requests.get(req.id)!.status, 'REQUESTED');
  assert.equal(calls.length, 0);
});

test('a rejected Auth call fails the request with a safe message', async () => {
  const { store, requests } = fakeStore();
  const { auth } = fakeAuth({ kind: 'rejected', message: 'The password or email was not accepted.' });
  const res = await runProvisioning({ store, auth }, { ...INPUT, password: 'p' });
  assert.equal(res.ok === false && res.code, 'rejected');
  assert.equal(requests.get('req-1')!.status, 'FAILED');
});

test('transitions and next step follow the state machine', () => {
  assert.equal(canTransition('REQUESTED', 'AUTH_PENDING'), true);
  assert.equal(canTransition('COMPLETED', 'REQUESTED'), false);
  assert.equal(nextStep({ hasProfile: false, membershipLinked: false, onboardingPending: false }), 'auth');
  assert.equal(nextStep({ hasProfile: true, membershipLinked: false, onboardingPending: false }), 'membership');
  assert.equal(nextStep({ hasProfile: true, membershipLinked: true, onboardingPending: true }), 'onboarding');
  assert.equal(nextStep({ hasProfile: true, membershipLinked: true, onboardingPending: false }), 'complete');
  assert.equal(isAutomaticallyRetryable('COMPLETED', true), false);
  assert.equal(isAutomaticallyRetryable('RECONCILIATION_REQUIRED', true), false);
  assert.equal(isAutomaticallyRetryable('AUTH_PENDING', false), false);
});

test('credentials are removed from records and logs', () => {
  const clean = withoutCredentials({ id: 'r', email: 'a@b.c', password: 'x', claim_token: 't', note: 'ok' } as Record<string, unknown>);
  assert.deepEqual(Object.keys(clean).sort(), ['email', 'id', 'note']);
});

test('a reused request key with different details is refused, not replayed', async () => {
  const base = fakeStore();
  const { auth, calls } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const throwing: ProvisioningStore = { ...base.store, create: async () => { throw new ProvisioningRefused('key', 'key_reused'); } };
  const res = await runProvisioning({ store: throwing, auth }, { ...INPUT, password: 'p' });
  assert.equal(res.ok === false && res.code, 'key_reused');
  assert.equal(calls.length, 0);
});

test('a revoked actor is refused at claim time and Auth is not called', async () => {
  const base = fakeStore();
  const { auth, calls } = fakeAuth({ kind: 'created', userId: 'user-1' });
  const req = await base.store.create(INPUT);
  const refusing: ProvisioningStore = {
    ...base.store,
    claim: async () => { throw new ProvisioningRefused('forbidden', null, '42501'); },
  };
  const res = await resumeProvisioning({ store: refusing, auth }, req.id, 'p');
  assert.equal(res.ok === false && res.code, 'forbidden');
  assert.equal(calls.length, 0);
});

test('request keys map to stable UUIDs, and different keys map to different UUIDs', () => {
  const a = keyToUuid('onboarding:abc:owner');
  assert.equal(a, keyToUuid('onboarding:abc:owner'));
  assert.notEqual(a, keyToUuid('onboarding:abd:owner'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});
