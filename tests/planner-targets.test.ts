import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectTarget, projectPathAfterAdd } from '../lib/planner/targets';

const P = '0a0b0c0d-0000-4000-8000-0000000000a1';
const R = '0a0b0c0d-0000-4000-8000-0000000000b2';

test('new project target', () => {
  assert.deepEqual(parseProjectTarget('new'), { kind: 'new' });
});

test('existing project, whole project and room targets', () => {
  assert.deepEqual(parseProjectTarget(P), { kind: 'existing', projectId: P, roomId: null });
  assert.deepEqual(parseProjectTarget(`${P}|`), { kind: 'existing', projectId: P, roomId: null });
  assert.deepEqual(parseProjectTarget(`${P}|${R}`), { kind: 'existing', projectId: P, roomId: R });
});

test('malformed or empty targets are refused, never treated as new', () => {
  assert.equal(parseProjectTarget('').kind, 'invalid');
  assert.equal(parseProjectTarget('not-a-uuid').kind, 'invalid');
  assert.equal(parseProjectTarget(`${P}|${R}|${R}`).kind, 'invalid');
  assert.equal(parseProjectTarget(`${P}|bad`).kind, 'invalid');
});

test('navigation after adding goes to that project page', () => {
  assert.equal(projectPathAfterAdd('my-store', P), `/store/my-store/projects/${P}`);
});
