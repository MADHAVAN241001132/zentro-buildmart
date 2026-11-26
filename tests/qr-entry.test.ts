import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY_TOKEN_PATTERN, isEntryToken, trackedEntryUrl } from '../lib/qr/entry';

test('accepts 32 lowercase hex characters as an entry token', () => {
  assert.equal(isEntryToken('0123456789abcdef0123456789abcdef'), true);
  assert.equal(ENTRY_TOKEN_PATTERN.test('a'.repeat(32)), true);
});

test('rejects tokens with the wrong length, case, characters or injected text', () => {
  for (const bad of ['', 'abc', 'A'.repeat(32), 'g'.repeat(32), `${'a'.repeat(31)}/`, `${'a'.repeat(32)}x`, '../../etc/passwd']) {
    assert.equal(isEntryToken(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test('builds a tracked URL on the /q route and strips a trailing slash', () => {
  const token = 'f'.repeat(32);
  assert.equal(trackedEntryUrl('https://zentro.example/', token), `https://zentro.example/q/${token}`);
  assert.equal(trackedEntryUrl('https://zentro.example', token), `https://zentro.example/q/${token}`);
});

test('refuses to build a tracked URL from an invalid token', () => {
  assert.throws(() => trackedEntryUrl('https://zentro.example', 'not-a-token'), /invalid entry token/);
});
