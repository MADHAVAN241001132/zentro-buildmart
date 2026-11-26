/*
 * Pure rules that turn a cart-step database answer into what the guest is told. No network and no server-only
 * imports, so the rules are unit tested directly. Used by lib/services/once-cart.ts.
 */

export type StepOutcomeKind = 'added' | 'alreadyApplied' | 'refused' | 'uncertain';

export type StepErrorKind = 'takenOver' | 'refused' | 'uncertain';

/**
 * Classifies a database error from guest_cart_add_step.
 * - P0003: a newer attempt owns the request; nothing from this attempt was written.
 * - A SQLSTATE from the database (22, 42, P0): the transaction rolled back, so nothing changed and the line may be retried.
 * - No SQLSTATE (the call failed without a database answer): the outcome is unknown and is never repeated automatically.
 */
export function classifyStepError(code: string | undefined | null): StepErrorKind {
  if (code === 'P0003') return 'takenOver';
  if (typeof code === 'string' && /^(22|42|P0)[0-9A-Z]{3}$/.test(code)) return 'refused';
  return 'uncertain';
}

/** Maps the database's step outcome to the kind shown to the guest. Unknown values are treated as refusals. */
export function classifyStepOutcome(outcome: string | undefined | null): StepOutcomeKind {
  switch (outcome) {
    case 'added': return 'added';
    case 'done': return 'alreadyApplied';
    case 'uncertain': return 'uncertain';
    default: return 'refused';
  }
}
