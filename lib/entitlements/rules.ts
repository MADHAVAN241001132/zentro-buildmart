// Pure subscription and feature policy. No imports, so it runs in unit tests without
// the database. The database functions in migration 0030 implement the same rules and
// remain the source of truth for writes; this module drives reads, UI indicators and
// early, friendly refusals in services.

/**
 * setup: draft store, catalogue work only, no quota.
 * allowance: no subscription rows, a platform administrator granted a time-limited allowance.
 * unsubscribed: active store with no subscription and no valid allowance (restricted).
 */
export type SubscriptionState = 'setup' | 'allowance' | 'active' | 'upcoming' | 'expired' | 'unsubscribed';

/** New commercial operations (sales, quotations, guest orders) are allowed in these states. */
export const COMMERCE_STATES: readonly SubscriptionState[] = ['active', 'allowance'];

export type SubscriptionRow = {
  status: 'trialing' | 'active' | 'grace' | 'expired' | 'cancelled';
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  graceEndsOn: string | null;
};

export type PlanLimits = {
  maxProducts: number | null;
  productsUnlimited: boolean;
  maxUsers: number | null;
  usersUnlimited: boolean;
  features: Record<string, unknown>;
};

const DAY_MS = 86_400_000;

/** Today's calendar date in India (the business timezone), as YYYY-MM-DD. */
export function istDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function covers(row: SubscriptionRow, on: string): boolean {
  if (row.status === 'active' || row.status === 'trialing') {
    return on >= row.periodStart && on <= row.periodEnd;
  }
  if (row.status === 'grace') {
    return on >= row.periodStart && on <= (row.graceEndsOn ?? row.periodEnd);
  }
  return false;
}

export type StoreContext = {
  storeStatus: 'draft' | 'active' | 'suspended' | 'archived';
  allowanceExpiresOn: string | null;
};

/** Classifies a store on a given day (mirrors app.store_subscription_state). */
export function subscriptionState(rows: readonly SubscriptionRow[], on: string, context: StoreContext): SubscriptionState {
  if (rows.length === 0) {
    if (context.allowanceExpiresOn !== null && context.allowanceExpiresOn >= on) return 'allowance';
    return context.storeStatus === 'draft' ? 'setup' : 'unsubscribed';
  }
  if (rows.some((row) => covers(row, on))) return 'active';
  if (rows.some((row) => row.status !== 'cancelled' && row.status !== 'expired' && row.periodStart > on)) {
    return 'upcoming';
  }
  return 'expired';
}

/** The subscription row whose plan applies today: the one that covers the day and ends latest. */
export function coveringRow(rows: readonly SubscriptionRow[], on: string): SubscriptionRow | null {
  const covering = rows.filter((row) => covers(row, on));
  if (covering.length === 0) return null;
  return covering.reduce((best, row) => (row.periodEnd > best.periodEnd ? row : best));
}

/** Whole days from `on` to the end of the current period, or null when no period covers the day. */
export function daysUntilExpiry(rows: readonly SubscriptionRow[], on: string): number | null {
  const row = coveringRow(rows, on);
  if (!row) return null;
  const end = row.status === 'grace' ? row.graceEndsOn ?? row.periodEnd : row.periodEnd;
  return Math.round((Date.parse(end) - Date.parse(on)) / DAY_MS);
}

export const EXPIRY_WARNING_DAYS = 14;

/** Store context for pages that only need subscription-row classification. */
export const ACTIVE_STORE_CONTEXT: StoreContext = { storeStatus: 'active', allowanceExpiresOn: null };

/** True when the current period ends within the warning window (inclusive of today). */
export function isExpiringSoon(rows: readonly SubscriptionRow[], on: string, windowDays = EXPIRY_WARNING_DAYS): boolean {
  const days = daysUntilExpiry(rows, on);
  return days !== null && days >= 0 && days <= windowDays;
}

export type LimitDecision = { allowed: true } | { allowed: false; reason: 'limit_reached' | 'limit_not_configured' };

/**
 * Quota decision. An unlimited plan must set its unlimited flag explicitly; a null limit
 * without that flag is refused, never treated as unlimited.
 */
export function quotaDecision(current: number, limit: number | null, unlimited: boolean): LimitDecision {
  if (unlimited) return { allowed: true };
  if (limit === null) return { allowed: false, reason: 'limit_not_configured' };
  return current < limit ? { allowed: true } : { allowed: false, reason: 'limit_reached' };
}

/**
 * Feature decision, mirroring app.store_feature_allowed:
 * setup and allowance stores are blocked only by an explicit disabled flag; subscribed stores
 * need an active subscription, an enabled flag, and a plan that does not explicitly disable the key.
 */
export function featureDecision(
  state: SubscriptionState,
  flagEnabled: boolean | undefined,
  planFeatures: Record<string, unknown>,
  key: string,
): boolean {
  if (state === 'setup' || state === 'allowance') return flagEnabled ?? true;
  if (state !== 'active') return false;
  if (!flagEnabled) return false;
  return planFeatures[key] !== false;
}

/** Keys that gate premium modules. Kept in step with FEATURE_KEYS in lib/validation/admin.ts. */
export const PREMIUM_FEATURE_KEYS = [
  'pos_billing',
  'quotations',
  'room_visualiser',
  'house_project_planner',
  'bulk_imports',
  'qr_scan_analytics',
  'tile_batches',
  'purchase_orders',
  'reports',
] as const;

export type PremiumFeatureKey = (typeof PREMIUM_FEATURE_KEYS)[number];

export type LimitCode = 'subscription_inactive' | 'limit_reached' | 'limit_not_configured';

// Order matters: the "not configured" messages also contain "product limit" / "user limit",
// so they are matched first.
const DB_LIMIT_MESSAGES: Array<{ match: string; message: string; code: LimitCode }> = [
  { match: 'no product limit configured', message: 'The plan has no product limit configured. Contact the platform administrator.', code: 'limit_not_configured' },
  { match: 'no user limit configured', message: 'The plan has no user limit configured. Contact the platform administrator.', code: 'limit_not_configured' },
  { match: 'subscription for this store is not active', message: 'The subscription for this store is not active. Renew it to make changes.', code: 'subscription_inactive' },
  { match: 'product limit for the current plan', message: 'The product limit for the current plan has been reached. Archive a product or upgrade the plan.', code: 'limit_reached' },
  { match: 'user limit for the current plan', message: 'The user limit for the current plan has been reached. Deactivate a user or upgrade the plan.', code: 'limit_reached' },
];

/** Matches a database limit message (raised with errcode P0001) to a friendly message. Null when unrelated. */
export function classifyDatabaseLimitMessage(message: string): { code: LimitCode; message: string } | null {
  const hit = DB_LIMIT_MESSAGES.find((rule) => message.includes(rule.match));
  return hit ? { code: hit.code, message: hit.message } : null;
}

export type UsageLevel = 'unlimited' | 'not_configured' | 'ok' | 'near' | 'reached';

export type UsageSummary = {
  used: number;
  limit: number | null;
  remaining: number | null;
  level: UsageLevel;
};

/** Share of the limit at which a near-limit warning appears. */
export const NEAR_LIMIT_RATIO = 0.8;

/**
 * Usage for the Admin screen. Uses the same rule as the database triggers: a count is refused
 * when it is at or above the limit, and an explicit unlimited flag means no limit at all.
 */
export function usageSummary(used: number, limit: number | null, unlimited: boolean): UsageSummary {
  if (unlimited) return { used, limit: null, remaining: null, level: 'unlimited' };
  if (limit === null) return { used, limit: null, remaining: null, level: 'not_configured' };
  const remaining = Math.max(0, limit - used);
  if (used >= limit) return { used, limit, remaining: 0, level: 'reached' };
  if (used >= limit * NEAR_LIMIT_RATIO) return { used, limit, remaining, level: 'near' };
  return { used, limit, remaining, level: 'ok' };
}
