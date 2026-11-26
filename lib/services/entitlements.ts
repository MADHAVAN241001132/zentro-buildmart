import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { COMMERCE_STATES, PREMIUM_FEATURE_KEYS, classifyDatabaseLimitMessage, type PremiumFeatureKey, type SubscriptionState } from '@/lib/entitlements/rules';

/**
 * Central subscription and feature authorisation. Services, server actions and API routes
 * call these functions before a restricted operation. The database (migration 0030) repeats
 * the product and user quota checks inside the write transaction, so a bypassed service
 * still cannot exceed a limit.
 *
 * All checks fail closed: if the check itself cannot run, the operation is refused.
 */

export type EntitlementCode = 'subscription_inactive' | 'feature_disabled' | 'limit_reached' | 'limit_not_configured';

export class EntitlementError extends Error {
  readonly code: EntitlementCode;
  constructor(code: EntitlementCode, message: string) {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
  }
}

const FEATURE_MESSAGE: Record<PremiumFeatureKey, string> = {
  pos_billing: 'POS billing is not included in this store’s subscription.',
  quotations: 'Quotations are not included in this store’s subscription.',
  room_visualiser: 'The Room Visualizer is not included in this store’s subscription.',
  house_project_planner: 'The House Project Planner is not included in this store’s subscription.',
  bulk_imports: 'Bulk imports are not included in this store’s subscription.',
  qr_scan_analytics: 'QR analytics is not included in this store’s subscription.',
  tile_batches: 'Tile batches are not included in this store’s subscription.',
  purchase_orders: 'Purchasing is not included in this store’s subscription.',
  reports: 'Reports and exports are not included in this store’s subscription.',
};



/** Maps a database error from a guarded write to a friendly EntitlementError, or null when unrelated. */
export function entitlementErrorFrom(error: { message?: string; code?: string } | null | undefined): EntitlementError | null {
  if (!error || error.code !== 'P0001' || !error.message) return null;
  const hit = classifyDatabaseLimitMessage(error.message);
  return hit ? new EntitlementError(hit.code, hit.message) : null;
}

export async function getSubscriptionState(storeId: string): Promise<SubscriptionState> {
  const { data, error } = await createSupabaseAdminClient().rpc('zb_subscription_state', { p_store: storeId });
  if (error || typeof data !== 'string') throw new Error('Could not check the subscription');
  return data as SubscriptionState;
}

const COMMERCE_REFUSAL = 'The subscription for this store is not active. Renew it to make changes.';

/**
 * Refuses new commercial operations (sales, quotations, guest orders, POS bills) unless the
 * store is active or has a current migration allowance. Cancellation, settlement, refunds and
 * reads of existing records are not routed through this check.
 */
export async function assertSubscriptionActive(storeId: string): Promise<void> {
  const state = await getSubscriptionState(storeId);
  if ((COMMERCE_STATES as readonly string[]).includes(state)) return;
  throw new EntitlementError('subscription_inactive', COMMERCE_REFUSAL);
}

/** Like assertSubscriptionActive, for actions that return a message rather than throwing. */
export async function checkCommerce(storeId: string): Promise<string | null> {
  try {
    await assertSubscriptionActive(storeId);
    return null;
  } catch (error) {
    if (error instanceof EntitlementError) return error.message;
    throw error;
  }
}

/** Refuses premium modules that are not enabled for the store today. */
export async function assertFeature(storeId: string, key: PremiumFeatureKey): Promise<void> {
  if (!(PREMIUM_FEATURE_KEYS as readonly string[]).includes(key)) throw new Error('Unknown feature key');
  const { data, error } = await createSupabaseAdminClient().rpc('zb_feature_allowed', { p_store: storeId, p_key: key });
  if (error) throw new Error('Could not check the feature');
  if (data !== true) throw new EntitlementError('feature_disabled', FEATURE_MESSAGE[key]);
}

export type SubscriptionSummaryRow = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  graceEndsOn: string | null;
  planName: string;
};

/** Subscription history for one store, newest period first. Used by admin screens. */
export async function listSubscriptionHistory(storeId: string): Promise<SubscriptionSummaryRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('subscriptions')
    .select('id, status, period_start, period_end, grace_ends_on, subscription_plans(name)')
    .eq('store_id', storeId)
    .order('period_end', { ascending: false });
  if (error) throw new Error('Could not load subscription history');
  return (data ?? []).map((row: Record<string, unknown>) => {
    const plan = row.subscription_plans as unknown as { name: string } | null;
    return {
      id: row.id as string,
      status: row.status as string,
      periodStart: row.period_start as string,
      periodEnd: row.period_end as string,
      graceEndsOn: (row.grace_ends_on as string | null) ?? null,
      planName: plan?.name ?? 'Unknown plan',
    };
  });
}

/**
 * For server actions that return a message rather than throwing: resolves to the friendly
 * refusal text when the feature is not available, or null when it is. Unexpected failures
 * still throw, so a failed check never allows the operation.
 */
export async function checkFeature(storeId: string, key: PremiumFeatureKey): Promise<string | null> {
  try {
    await assertFeature(storeId, key);
    return null;
  } catch (error) {
    if (error instanceof EntitlementError) return error.message;
    throw error;
  }
}
