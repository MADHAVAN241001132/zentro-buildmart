/**
 * Polling policy for live status. Pure functions so the timing and change-detection rules can be tested.
 *
 * Visible pages poll every 10 seconds. Hidden tabs poll once a minute. Failures back off exponentially
 * up to two minutes, and a successful response resets the back-off.
 */

export const VISIBLE_INTERVAL_MS = 10_000;
export const HIDDEN_INTERVAL_MS = 60_000;
export const MAX_BACKOFF_MS = 120_000;

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

export function nextDelayMs(consecutiveFailures: number, visible: boolean): number {
  const base = visible ? VISIBLE_INTERVAL_MS : HIDDEN_INTERVAL_MS;
  if (consecutiveFailures <= 0) return base;
  return Math.min(base * 2 ** Math.min(consecutiveFailures, 10), MAX_BACKOFF_MS);
}

export function connectionState(consecutiveFailures: number, online: boolean): ConnectionState {
  if (!online) return 'offline';
  if (consecutiveFailures > 0) return 'reconnecting';
  return 'live';
}

/** A snapshot counts as changed only when its fingerprint differs from the last one seen. Duplicates are ignored. */
export function hasChanged(previous: string | null, next: string | null): boolean {
  return next !== null && next !== previous;
}
