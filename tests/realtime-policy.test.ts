import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIDDEN_INTERVAL_MS,
  MAX_BACKOFF_MS,
  VISIBLE_INTERVAL_MS,
  connectionState,
  hasChanged,
  nextDelayMs,
} from '../lib/realtime/poll-policy';

test('visible pages poll every 10 seconds and hidden tabs every minute', () => {
  assert.equal(nextDelayMs(0, true), 10_000);
  assert.equal(nextDelayMs(0, false), 60_000);
  assert.equal(VISIBLE_INTERVAL_MS, 10_000);
  assert.equal(HIDDEN_INTERVAL_MS, 60_000);
});

test('failures back off exponentially and never beyond two minutes', () => {
  assert.equal(nextDelayMs(1, true), 20_000);
  assert.equal(nextDelayMs(2, true), 40_000);
  assert.equal(nextDelayMs(3, true), 80_000);
  assert.equal(nextDelayMs(4, true), MAX_BACKOFF_MS);
  assert.equal(nextDelayMs(50, true), MAX_BACKOFF_MS);
  assert.equal(nextDelayMs(50, false), MAX_BACKOFF_MS);
});

test('a successful poll resets the delay to the normal interval', () => {
  assert.equal(nextDelayMs(0, true), VISIBLE_INTERVAL_MS);
});

test('connection state reports offline first, then reconnecting, then live', () => {
  assert.equal(connectionState(0, true), 'live');
  assert.equal(connectionState(2, true), 'reconnecting');
  assert.equal(connectionState(0, false), 'offline');
  assert.equal(connectionState(3, false), 'offline');
});

test('duplicate snapshots are not reported as changes', () => {
  assert.equal(hasChanged('abc', 'abc'), false);
  assert.equal(hasChanged('abc', 'def'), true);
  assert.equal(hasChanged(null, 'abc'), true);
  assert.equal(hasChanged('abc', null), false);
});
