import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyProviderFailure, safeProviderDetail } from '../lib/payments/outcome';

test('only explicit provider rejections before creation are refusals', () => {
  assert.equal(classifyProviderFailure({ status: 400, hasProviderBody: true }), 'refused');
  assert.equal(classifyProviderFailure({ status: 401, hasProviderBody: true }), 'refused');
  assert.equal(classifyProviderFailure({ status: 403, hasProviderBody: true }), 'refused');
});

test('a 4xx without a provider body is not proof of refusal', () => {
  assert.equal(classifyProviderFailure({ status: 400, hasProviderBody: false }), 'uncertain');
  assert.equal(classifyProviderFailure({ status: 400 }), 'uncertain');
});

test('conflict, unprocessable, not found, timeout and rate limit are uncertain', () => {
  for (const status of [404, 408, 409, 422, 429]) {
    assert.equal(classifyProviderFailure({ status, hasProviderBody: true }), 'uncertain', String(status));
  }
});

test('server errors and network failures are uncertain', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(classifyProviderFailure({ status, hasProviderBody: true }), 'uncertain', String(status));
  }
  assert.equal(classifyProviderFailure(new TypeError('fetch failed')), 'uncertain');
  assert.equal(classifyProviderFailure(null), 'uncertain');
  assert.equal(classifyProviderFailure('boom'), 'uncertain');
  assert.equal(classifyProviderFailure({ status: '400', hasProviderBody: true }), 'uncertain');
});

test('safe detail is bounded and never empty', () => {
  assert.equal(safeProviderDetail(new Error('x'.repeat(500))).length, 200);
  assert.equal(safeProviderDetail(new TypeError('fetch failed')), 'fetch failed');
  assert.equal(safeProviderDetail({ status: 500 }), 'provider response not received');
});
