import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_TITLES, TOTAL_STEPS, activationIssues, subscriptionCovers } from '../lib/onboarding/rules';

test('the wizard has exactly eight steps with titles', () => {
  assert.equal(TOTAL_STEPS, 8);
  assert.equal(STEP_TITLES.length, 8);
  assert.equal(STEP_TITLES[0], 'Store information');
  assert.equal(STEP_TITLES[7], 'Review and activation');
});

test('subscription coverage includes both ends of the period', () => {
  assert.equal(subscriptionCovers('2026-11-26', '2026-11-26', '2027-11-25'), true);
  assert.equal(subscriptionCovers('2027-11-25', '2026-11-26', '2027-11-25'), true);
  assert.equal(subscriptionCovers('2027-11-26', '2026-11-26', '2027-11-25'), false);
  assert.equal(subscriptionCovers('2026-11-25', '2026-11-26', '2027-11-25'), false);
});

test('a store cannot be activated until every requirement is met, and the issues name the missing steps', () => {
  const none = {
    infoSaved: false,
    ownerLinked: false,
    taxSaved: false,
    subscriptionCurrent: false,
    featuresSaved: false,
    qrReady: false,
    alreadyCompleted: false,
  };
  assert.equal(activationIssues(none).length, 6);
  assert.deepEqual(
    activationIssues({ ...none, infoSaved: true, ownerLinked: true, taxSaved: true, subscriptionCurrent: true, featuresSaved: true, qrReady: true }),
    [],
  );
  const missingQr = activationIssues({ ...none, infoSaved: true, ownerLinked: true, taxSaved: true, subscriptionCurrent: true, featuresSaved: true });
  assert.deepEqual(missingQr, ['Generate the store QR code (step 7).']);
});

test('a completed onboarding reports no issues, so a repeated activation is harmless', () => {
  assert.deepEqual(
    activationIssues({ infoSaved: false, ownerLinked: false, taxSaved: false, subscriptionCurrent: false, featuresSaved: false, qrReady: false, alreadyCompleted: true }),
    [],
  );
});
