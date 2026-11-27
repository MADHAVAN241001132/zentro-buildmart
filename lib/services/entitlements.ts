import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  COMMERCE_STATES,
  classifyDatabaseLimitMessage,
  coveringRow,
  featureDecision,
  istDate,
  type SubscriptionRow,
  type SubscriptionState,
} from '@/lib/entitlements/rules';
import { FEATURE_KEYS } from '@/lib/validation/admin';

export type FeatureKey = (typeof FEATURE_KEYS)[number];

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

const FEATURE_MESSAGE: Record<FeatureKey, string> = {
  online_payments: 'Online payments are not enabled for this store.',
  pos_billing: 'POS billing is not enabled for this store.',
  quotations: 'Quotations are not enabled for this store.',
  credit_ledger: 'Credit ledger is not enabled for this store.',
  delivery: 'Delivery is not enabled for this store.',
  coupons: 'Coupons are not enabled for this store.',
  tile_batches: 'Tile batches are not enabled for this store.',
  purchase_orders: 'Purchasing is not enabled for this store.',
  room_visualiser: 'The Room Visualizer is not enabled for this store.',
  qr_scan_analytics: 'QR analytics is not enabled for this store.',
  house_project_planner: 'The House Project Planner is not enabled for this store.',
  bulk_imports: 'Bulk imports are not enabled for this store.',
  reports: 'Reports and exports are not enabled for this store.',
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

/** Refuses modules that are not enabled/assigned for the store today. */
export async function assertFeature(storeId: string, key: FeatureKey): Promise<void> {
  if (!(FEATURE_KEYS as readonly string[]).includes(key)) throw new Error('Unknown feature key');
  const enabled = await isFeatureEnabled(storeId, key);
  if (!enabled) throw new EntitlementError('feature_disabled', FEATURE_MESSAGE[key]);
}

/** Boolean form of assertFeature that fails closed on any error. Uses the single authoritative store feature resolver. */
export async function isFeatureEnabled(storeId: string, key: FeatureKey): Promise<boolean> {
  if (!(FEATURE_KEYS as readonly string[]).includes(key)) return false;
  try {
    const enabledFeatures = await getStoreEnabledFeatures(storeId);
    return enabledFeatures.has(key);
  } catch {
    return false;
  }
}

/**
 * Loads all currently enabled & assigned feature keys for a store in one batched pass,
 * mirroring app.store_feature_allowed. Fails closed (empty set) if any query fails.
 */
export async function getStoreEnabledFeatures(storeId: string): Promise<Set<FeatureKey>> {
  try {
    const admin = createSupabaseAdminClient();
    const [stateRes, flagsRes, subsRes] = await Promise.all([
      admin.rpc('zb_subscription_state', { p_store: storeId }),
      admin.from('feature_flags').select('feature_key, enabled').eq('store_id', storeId),
      admin
        .from('subscriptions')
        .select('status, period_start, period_end, grace_ends_on, subscription_plans(features)')
        .eq('store_id', storeId),
    ]);
    if (stateRes.error || typeof stateRes.data !== 'string' || flagsRes.error || subsRes.error) {
      return new Set();
    }
    const state = stateRes.data as SubscriptionState;
    const flagMap = new Map<string, boolean>();
    for (const f of flagsRes.data ?? []) {
      flagMap.set(f.feature_key as string, Boolean(f.enabled));
    }

    let planFeatures: Record<string, unknown> = {};
    if (state === 'active') {
      const today = istDate();
      const rows = (subsRes.data ?? []).map((r) => ({
        status: r.status as SubscriptionRow['status'],
        periodStart: r.period_start as string,
        periodEnd: r.period_end as string,
        graceEndsOn: (r.grace_ends_on as string | null) ?? null,
        features: ((Array.isArray(r.subscription_plans) ? r.subscription_plans[0] : r.subscription_plans) as { features?: Record<string, unknown> } | null)?.features ?? {},
      }));
      const best = coveringRow(rows, today);
      if (best) {
        const matched = rows.find((r) => r.periodStart === best.periodStart && r.periodEnd === best.periodEnd && r.status === best.status);
        planFeatures = matched?.features ?? {};
      }
    }

    const enabled = new Set<FeatureKey>();
    for (const key of FEATURE_KEYS) {
      if (featureDecision(state, flagMap.get(key), planFeatures, key)) {
        enabled.add(key);
      }
    }
    return enabled;
  } catch {
    return new Set();
  }
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
export async function checkFeature(storeId: string, key: FeatureKey): Promise<string | null> {
  try {
    await assertFeature(storeId, key);
    return null;
  } catch (error) {
    if (error instanceof EntitlementError) return error.message;
    throw error;
  }
}
