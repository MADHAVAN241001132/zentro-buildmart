import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  featureStepSchema,
  infoSchema,
  ownerDetailsSchema,
  ownerPasswordSchema,
  subscriptionStepSchema,
  taxSchema,
} from '../lib/onboarding/schemas';

const goodInfo = {
  name: 'Sri Tile House',
  slug: 'sri-tile-house',
  category: 'Tiles and flooring',
  phone: '9876543210',
  email: 'shop@example.com',
  addressLine: '',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  pincode: '641001',
  description: '',
  brandColour: '#6A0D2A',
};

test('store information accepts a valid store and turns blanks into null', () => {
  const parsed = infoSchema.safeParse(goodInfo);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.addressLine, null);
    assert.equal(parsed.data.description, null);
  }
});

test('store slug rules match the storefront address rules', () => {
  assert.equal(infoSchema.safeParse({ ...goodInfo, slug: 'Bad Slug' }).success, false);
  assert.equal(infoSchema.safeParse({ ...goodInfo, slug: 'ab' }).success, false);
  assert.equal(infoSchema.safeParse({ ...goodInfo, slug: '-leading' }).success, false);
  assert.equal(infoSchema.safeParse({ ...goodInfo, slug: 'double--hyphen' }).success, false);
});

test('a business category and a 6-digit pincode are required when given', () => {
  assert.equal(infoSchema.safeParse({ ...goodInfo, category: '' }).success, false);
  assert.equal(infoSchema.safeParse({ ...goodInfo, pincode: '6410' }).success, false);
});

test('owner details exclude passwords, and passwords need 10 to 72 characters', () => {
  const details = ownerDetailsSchema.safeParse({ fullName: 'Asha', email: 'asha@example.com', phone: '', role: 'owner' });
  assert.equal(details.success, true);
  if (details.success) assert.equal('password' in details.data, false);
  assert.equal(ownerPasswordSchema.safeParse('short').success, false);
  assert.equal(ownerPasswordSchema.safeParse('a'.repeat(10)).success, true);
  assert.equal(ownerPasswordSchema.safeParse('a'.repeat(73)).success, false);
});

test('GSTIN is optional for unregistered businesses and must be 15 characters when given', () => {
  const base = {
    legalName: 'Sri Tile House Pvt Ltd',
    businessState: 'Tamil Nadu',
    billingAddress: '12 Market Road, Coimbatore',
    pricesIncludeGst: true,
  };
  assert.equal(taxSchema.safeParse({ ...base, gstRegistration: 'unregistered', gstin: '' }).success, true);
  assert.equal(taxSchema.safeParse({ ...base, gstRegistration: 'regular', gstin: '33ABCDE1234F1Z5' }).success, true);
  assert.equal(taxSchema.safeParse({ ...base, gstRegistration: 'regular', gstin: 'SHORT' }).success, false);
});

test('subscription end date must be after the start date', () => {
  const planId = '6f1d0c4e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';
  assert.equal(subscriptionStepSchema.safeParse({ planId, periodStart: '2026-12-01', periodEnd: '2027-12-01' }).success, true);
  assert.equal(subscriptionStepSchema.safeParse({ planId, periodStart: '2026-12-01', periodEnd: '2026-12-01' }).success, false);
  assert.equal(subscriptionStepSchema.safeParse({ planId: 'not-a-uuid', periodStart: '2026-12-01', periodEnd: '2027-01-01' }).success, false);
});

test('feature configuration accepts only known feature keys and defaults missing ones to off', () => {
  const parsed = featureStepSchema.safeParse({ quotations: true, room_visualiser: true });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.quotations, true);
    assert.equal(parsed.data.pos_billing, false);
  }
  assert.equal(featureStepSchema.safeParse({ made_up_feature: true }).success, true, 'unknown keys are stripped, not stored');
});

