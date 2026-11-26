/**
 * Store onboarding rules that need no schema library, so they can be unit tested without installed
 * dependencies. Field validation lives in schemas.ts.
 */

export const STEP_TITLES = [
  'Store information',
  'Owner account',
  'Business and tax',
  'Store branding',
  'Subscription',
  'Feature configuration',
  'Store QR',
  'Review and activation',
] as const;

export const TOTAL_STEPS = STEP_TITLES.length;

/** Whether a subscription period covers the given date (YYYY-MM-DD, store time zone). Both ends are inclusive. */
export function subscriptionCovers(today: string, periodStart: string, periodEnd: string): boolean {
  return periodStart <= today && today <= periodEnd;
}

export interface ActivationState {
  infoSaved: boolean;
  ownerLinked: boolean;
  taxSaved: boolean;
  subscriptionCurrent: boolean;
  featuresSaved: boolean;
  qrReady: boolean;
  alreadyCompleted: boolean;
}

/** Reasons a store cannot be activated yet. An empty list means activation is allowed. */
export function activationIssues(state: ActivationState): string[] {
  if (state.alreadyCompleted) return [];
  const issues: string[] = [];
  if (!state.infoSaved) issues.push('Complete store information (step 1).');
  if (!state.ownerLinked) issues.push('Create the owner account (step 2).');
  if (!state.taxSaved) issues.push('Complete business and tax information (step 3).');
  if (!state.subscriptionCurrent) issues.push('Select a subscription that covers today (step 5).');
  if (!state.featuresSaved) issues.push('Save the feature configuration (step 6).');
  if (!state.qrReady) issues.push('Generate the store QR code (step 7).');
  return issues;
}
