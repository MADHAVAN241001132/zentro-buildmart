import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const SERVICE = 'lib/services/onboarding.ts';
const ACTIONS = 'app/admin/(portal)/onboarding/actions.ts';

test('the onboarding service never stores a password', () => {
  const source = read(SERVICE);
  assert.match(source, /const \{ password, \.\.\.details \} = input;/, 'password is split off before any draft is written');
  const drafts = source.match(/step_data: [^\n]+/g) ?? [];
  for (const line of drafts) {
    assert.doesNotMatch(line, /password/, `draft write includes a password: ${line}`);
  }
});

test('owner accounts are created only through the shared service, and only once per onboarding', () => {
  const source = read(SERVICE);
  assert.match(source, /createOwnerAccount\(/);
  assert.match(source, /if \(onb\.ownerProfileId\) return done\(/, 'a linked owner is never created again');
  assert.match(source, /onboardingId: onb\.id/, 'the provisioning workflow links the owner to this onboarding');
  assert.doesNotMatch(source, /owner_profile_id: created\.profileId/, 'the service does not write the owner link itself');
  assert.doesNotMatch(read(ACTIONS), /auth\.admin\.createUser/, 'actions do not create auth users directly');
});

test('the store is created once: creation and the onboarding link happen in one database transaction', () => {
  const source = read(SERVICE);
  assert.match(source, /\.rpc\('onboarding_create_store'/, 'store creation goes through the atomic RPC');
  const create = source.slice(source.indexOf("rpc('onboarding_create_store'"), source.indexOf("return done('Store information saved as a draft.')"));
  assert.doesNotMatch(create, /\.delete\(/, 'no compensating delete: a failed link leaves no store behind');
  const migration = read('supabase/migrations/0033_store_legal_profile.sql');
  assert.match(migration, /for update/, 'the onboarding row is locked while the store is created');
  assert.match(migration, /already has a store/, 'a second creation for one onboarding is refused');
});

test('activation checks every requirement through the rules module and only moves drafts', () => {
  const source = read(SERVICE);
  const activate = source.slice(source.indexOf('export async function activateStore'));
  assert.match(activate, /activationIssues\(state\)/);
  assert.match(activate, /\.eq\('status', 'draft'\)/, 'only draft stores become active');
  assert.match(activate, /if \(onb\.status === 'completed'\) return done\(/, 'repeat activation changes nothing');
});

test('every wizard step is reachable only in order and re-validated on the server', () => {
  const actions = read(ACTIONS);
  assert.match(actions, /if \(step > onb\.currentStep\) return \{ ok: false/);
  for (const step of [1, 2, 3, 4, 5, 6, 7]) {
    assert.match(actions, new RegExp(`case ${step}:`), `step ${step} has a server handler`);
  }
  assert.match(actions, /safeParse\(/, 'inputs are parsed on the server');
});

test('the activation action is the only path that changes a store to active', () => {
  const service = read(SERVICE);
  const actions = read(ACTIONS);
  assert.doesNotMatch(actions, /status: 'active'/);
  // Only the store update sets the store to active. The subscription insert also uses the word "active" for its own status.
  assert.equal((service.match(/\.update\(\{ status: 'active'/g) ?? []).length, 1);
});

test('the Owners page uses the shared owner-account service', () => {
  const source = read('app/admin/(portal)/owners/actions.ts');
  assert.match(source, /createOwnerAccount/);
  assert.doesNotMatch(source, /auth\.admin\.createUser/);
});
