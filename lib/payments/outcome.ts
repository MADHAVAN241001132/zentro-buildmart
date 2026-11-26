/**
 * Classifies a failed provider call that was meant to create a provider order. Pure, so it can be unit tested.
 *
 * - 'refused' only when the provider answered with an explicit rejection that happens before any order is created:
 *   400 (invalid request), 401 and 403 (credentials or permission). Those carry a provider error body.
 * - 'uncertain' for everything else: timeouts, network failures, 5xx, 408, 429, and every other 4xx. A 4xx is not
 *   proof that nothing was created (for example a 409 or a 422 after a partial success), so it is reconciled, not retried.
 * A missing or unreadable response is uncertain, never refused.
 */
export type ProviderFailureClass = 'refused' | 'uncertain';

export interface ProviderFailure {
  status?: unknown;
  message?: unknown;
  /** True when the provider's JSON error body carried a description. */
  hasProviderBody?: unknown;
}

const REFUSAL_STATUSES = new Set([400, 401, 403]);

export function classifyProviderFailure(error: unknown): ProviderFailureClass {
  if (typeof error !== 'object' || error === null) return 'uncertain';
  const failure = error as ProviderFailure;
  const status = failure.status;
  if (typeof status !== 'number' || !Number.isInteger(status)) return 'uncertain';
  if (!REFUSAL_STATUSES.has(status)) return 'uncertain';
  return failure.hasProviderBody === true ? 'refused' : 'uncertain';
}

/** Safe, bounded text for storage and logs: no credentials, no request bodies. */
export function safeProviderDetail(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = (error as ProviderFailure).message;
    if (typeof message === 'string') return message.slice(0, 200);
  }
  return 'provider response not received';
}
