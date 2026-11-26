import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Database-backed idempotency for transaction-critical guest requests (cart adds from the visualizer
 * and planner, planner quotation requests).
 *
 * - A claim holds a lease. Only a request whose lease has expired, or that failed, can be reclaimed.
 * - Each reclaim increments `attempt`. Completion, failure and renewal are fenced on that attempt, so an
 *   older request that wakes up late cannot overwrite the result of a newer one.
 * - Cart lines are recorded one by one in guest_request_steps. A line that was started but never
 *   confirmed is reported as uncertain and is never retried automatically, so reclaiming a request
 *   cannot add the same line twice.
 */

export type RequestKind = 'visualizer_cart' | 'visualizer_project' | 'planner_cart' | 'planner_quotation';

export interface Claim {
  id: string;
  attempt: number;
  /** Values an earlier attempt of this request already created (for example project ids). */
  progress?: Record<string, unknown>;
}

export type ClaimResult =
  | { state: 'claimed'; claim: Claim }
  | { state: 'done'; result: Record<string, unknown> | null }
  | { state: 'in_flight' };

/** How long a claim is held before another request may take it over. */
export const LEASE_MS = 3 * 60 * 1000;
const UNIQUE_VIOLATION = '23505';
export const MAX_STEPS = 200;

export class RequestKeyError extends Error {}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;

export function validRequestKey(value: unknown): string | null {
  return typeof value === 'string' && KEY_PATTERN.test(value) ? value : null;
}

function fail(): never {
  throw new RequestKeyError('Something went wrong. Please try again.');
}

export async function claimRequestKey(
  storeId: string,
  sessionId: string,
  kind: RequestKind,
  requestKey: string,
): Promise<ClaimResult> {
  const admin = createSupabaseAdminClient();
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  const { data: inserted, error: insertError } = await admin
    .from('guest_request_keys')
    .insert({
      store_id: storeId,
      guest_session_id: sessionId,
      kind,
      request_key: requestKey,
      status: 'pending',
      attempt: 1,
      lease_expires_at: leaseUntil,
    })
    .select('id, attempt')
    .maybeSingle();
  if (inserted && !insertError) {
    return { state: 'claimed', claim: { id: inserted.id as string, attempt: Number(inserted.attempt), progress: {} } };
  }
  if (insertError && insertError.code !== UNIQUE_VIOLATION) fail();

  const { data: existing, error: readError } = await admin
    .from('guest_request_keys')
    .select('id, status, result, attempt, lease_expires_at, progress')
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .eq('kind', kind)
    .eq('request_key', requestKey)
    .maybeSingle();
  if (readError || !existing) fail();

  if (existing.status === 'done') {
    return { state: 'done', result: (existing.result as Record<string, unknown> | null) ?? null };
  }
  const leaseEnded = !existing.lease_expires_at || new Date(String(existing.lease_expires_at)).getTime() <= Date.now();
  const reclaimable = existing.status === 'failed' || (existing.status === 'pending' && leaseEnded);
  if (!reclaimable) return { state: 'in_flight' };

  // Compare-and-swap on the attempt number: exactly one concurrent reclaimer can win.
  const nextAttempt = Number(existing.attempt) + 1;
  const { data: reclaimed, error: reclaimError } = await admin
    .from('guest_request_keys')
    .update({ status: 'pending', attempt: nextAttempt, lease_expires_at: leaseUntil, completed_at: null })
    .eq('id', existing.id)
    .eq('attempt', existing.attempt)
    .select('id')
    .maybeSingle();
  if (reclaimError) fail();
  if (reclaimed) {
    return {
      state: 'claimed',
      claim: { id: existing.id as string, attempt: nextAttempt, progress: (existing.progress as Record<string, unknown>) ?? {} },
    };
  }
  return { state: 'in_flight' };
}

/** Marks the claim done. Returns false when a newer attempt has taken over, so the result is not written. */
export async function completeRequestKey(claim: Claim, result: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from('guest_request_keys')
    .update({ status: 'done', result, completed_at: new Date().toISOString(), lease_expires_at: null })
    .eq('id', claim.id)
    .eq('attempt', claim.attempt)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) fail();
  return Boolean(data);
}

export async function failRequestKey(claim: Claim): Promise<void> {
  await createSupabaseAdminClient()
    .from('guest_request_keys')
    .update({ status: 'failed', completed_at: new Date().toISOString(), lease_expires_at: null })
    .eq('id', claim.id)
    .eq('attempt', claim.attempt)
    .eq('status', 'pending');
}

/** Extends the lease while a long request is still working. Returns false when the claim was taken over. */
export async function renewRequestKey(claim: Claim): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from('guest_request_keys')
    .update({ lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq('id', claim.id)
    .eq('attempt', claim.attempt)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) fail();
  return Boolean(data);
}

export type StepState = 'claimed' | 'done' | 'uncertain';

export interface StepRecord {
  index: number;
  variantId: string;
  quantity: number;
  status: 'started' | 'done' | 'failed';
}

/**
 * Claims one cart line of a request. Returns 'claimed' for a line never started, or one whose previous
 * attempt definitely failed. 'done' means it was already applied. 'uncertain' means a previous attempt
 * started it without confirming; it is never retried automatically.
 */
export async function claimStep(requestId: string, index: number, variantId: string, quantity: number): Promise<StepState> {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_STEPS) fail();
  const admin = createSupabaseAdminClient();
  const { error: insertError } = await admin.from('guest_request_steps').insert({
    request_id: requestId, step_index: index, status: 'started', variant_id: variantId, quantity,
  });
  if (!insertError) return 'claimed';
  if (insertError.code !== UNIQUE_VIOLATION) fail();

  const { data: existing, error: readError } = await admin
    .from('guest_request_steps')
    .select('status')
    .eq('request_id', requestId)
    .eq('step_index', index)
    .maybeSingle();
  if (readError || !existing) fail();
  if (existing.status === 'done') return 'done';
  if (existing.status === 'started') return 'uncertain';

  // Previously failed: retry, conditional on it still being failed.
  const { data: retried, error: retryError } = await admin
    .from('guest_request_steps')
    .update({ status: 'started', updated_at: new Date().toISOString() })
    .eq('request_id', requestId)
    .eq('step_index', index)
    .eq('status', 'failed')
    .select('request_id')
    .maybeSingle();
  if (retryError) fail();
  return retried ? 'claimed' : 'uncertain';
}

export async function finishStep(requestId: string, index: number, outcome: 'done' | 'failed'): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('guest_request_steps')
    .update({ status: outcome, updated_at: new Date().toISOString() })
    .eq('request_id', requestId)
    .eq('step_index', index)
    .eq('status', 'started');
  if (error) fail();
}

export async function listSteps(requestId: string): Promise<StepRecord[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('guest_request_steps')
    .select('step_index, variant_id, quantity, status')
    .eq('request_id', requestId)
    .order('step_index', { ascending: true });
  if (error) fail();
  return (data ?? []).map((row) => ({
    index: Number(row.step_index),
    variantId: row.variant_id as string,
    quantity: Number(row.quantity),
    status: row.status as StepRecord['status'],
  }));
}

/**
 * Saves what a multi-stage request has already created (for example the project id), so a retry resumes instead of
 * creating it again. Returns false when this attempt no longer owns the request.
 */
export async function saveRequestProgress(claim: Claim, progress: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient().rpc('guest_request_progress_set', {
    p_request: claim.id, p_attempt: claim.attempt, p_progress: progress,
  });
  if (error) fail();
  return data === true;
}
