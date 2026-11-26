import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStepError, classifyStepOutcome } from '../lib/planner/cart-step-outcome';

test('a newer attempt (P0003) is a takeover, not a failure', () => {
  assert.equal(classifyStepError('P0003'), 'takenOver');
});

test('database refusals (22, 42, P0) roll back and may be retried', () => {
  assert.equal(classifyStepError('22023'), 'refused');
  assert.equal(classifyStepError('42501'), 'refused');
  assert.equal(classifyStepError('P0001'), 'refused');
});

test('a call with no database answer is uncertain and never repeated', () => {
  assert.equal(classifyStepError(undefined), 'uncertain');
  assert.equal(classifyStepError(''), 'uncertain');
  assert.equal(classifyStepError('ECONNRESET'), 'uncertain');
});

test('step outcomes map to guest-facing kinds', () => {
  assert.equal(classifyStepOutcome('added'), 'added');
  assert.equal(classifyStepOutcome('done'), 'alreadyApplied');
  assert.equal(classifyStepOutcome('uncertain'), 'uncertain');
  assert.equal(classifyStepOutcome('refused'), 'refused');
});

test('an unknown outcome is never reported as added', () => {
  assert.equal(classifyStepOutcome('weird'), 'refused');
  assert.equal(classifyStepOutcome(undefined), 'refused');
});
