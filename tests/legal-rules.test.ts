import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gstRequirementMessage, gstinFormatMessage, normaliseGstin } from '../lib/onboarding/legal-rules';

test('a registered business must give a GSTIN', () => {
  assert.equal(gstRequirementMessage('regular', null), 'Enter the GSTIN for a registered business');
  assert.equal(gstRequirementMessage('composition', null), 'Enter the GSTIN for a registered business');
  assert.equal(gstRequirementMessage('regular', '29ABCDE1234F1Z5'), null);
});

test('an unregistered business may leave the GSTIN blank', () => {
  assert.equal(gstRequirementMessage('unregistered', null), null);
  assert.equal(gstRequirementMessage('unregistered', '29ABCDE1234F1Z5'), null);
});

test('GSTIN format is 15 characters, upper case and alphanumeric', () => {
  assert.equal(gstinFormatMessage('29ABCDE1234F1Z5'), null);
  assert.equal(gstinFormatMessage(''), null);
  assert.equal(gstinFormatMessage('29ABCDE1234F1Z'), 'GSTIN must be 15 characters');
  assert.equal(gstinFormatMessage('29abcde1234f1z5'), 'GSTIN must be 15 characters');
});

test('blank GSTIN is stored as null and lower case is normalised', () => {
  assert.equal(normaliseGstin('   '), null);
  assert.equal(normaliseGstin(' 29abcde1234f1z5 '), '29ABCDE1234F1Z5');
});
