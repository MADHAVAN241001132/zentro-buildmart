/**
 * Pure legal and tax rules, kept free of schema libraries so they can be unit-tested without dependencies.
 * Tax assumptions here are placeholders for professional confirmation before the GST release.
 */

export const GST_REGISTRATION_VALUES = ['regular', 'composition', 'unregistered'] as const;
export type GstRegistrationValue = (typeof GST_REGISTRATION_VALUES)[number];

const GSTIN_PATTERN = /^[0-9A-Z]{15}$/;

/** A registered business (regular or composition) must have a GSTIN. An unregistered one may not. */
export function gstRequirementMessage(registration: GstRegistrationValue, gstin: string | null): string | null {
  if (registration !== 'unregistered' && (gstin === null || gstin === '')) {
    return 'Enter the GSTIN for a registered business';
  }
  return null;
}

/** Checks the format of a GSTIN after trimming and upper-casing. Empty input is not a format error. */
export function gstinFormatMessage(gstin: string): string | null {
  if (gstin === '' || GSTIN_PATTERN.test(gstin)) return null;
  return 'GSTIN must be 15 characters';
}

/** Storage value for a blank GSTIN field. */
export function normaliseGstin(input: string): string | null {
  const value = input.trim().toUpperCase();
  return value === '' ? null : value;
}
