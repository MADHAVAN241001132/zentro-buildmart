import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Shapes returned by zb_admin_dashboard (migration 0048). Money is integer paise. */
export interface DashboardStores {
  total: number;
  active: number;
  inactive: number;
  draft: number;
  created_in_range: number;
  onboarding: { incomplete: number; completed: number };
  recent: { id: string; name: string; status: string; created_at: string }[];
}

export interface DashboardSubscriptions {
  active: number;
  expired: number;
  expiring_within_14_days: number;
  migration_allowances_active: number;
  expected_plan_value_paise: number;
  recorded_payments_paise: number;
  plan_distribution: { plan: string; count: number }[];
  near_limit: {
    store_id: string;
    store_name: string;
    plan_name: string;
    products_used: number;
    max_products: number | null;
    users_used: number;
    max_users: number | null;
    percent: number;
  }[];
  renewals: { store: string; paid_on: string; amount_paise: number }[];
}

export interface DashboardMerchant {
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
  refunded: number;
  partially_refunded: number;
  gross_order_value_paise: number;
  collected_paise: number;
  payments: number;
  refunds_paise: number;
  refunds: number;
  refund_adjusted_revenue_paise: number;
  by_store: {
    store_id: string;
    store_name: string;
    orders: number;
    paid_orders: number;
    gross_paise: number;
    collected_paise: number;
    refunds_paise: number;
    net_paise: number;
  }[];
  trend: { day: string; orders: number; gross_paise: number; collected_paise: number; refunds_paise: number }[];
}

export interface DashboardActivity {
  actions_in_range: number;
  permission_changes_in_range: number;
  recent: { action: string; entity_type: string; actor_type: string; created_at: string }[];
  onboarding: { updated_in_range: number; recent: { store: string; status: string; updated_at: string }[] };
  provisioning: {
    requests: number;
    requests_in_range: number;
    unresolved: number;
    reconciliation_required: number;
    failed: number;
    completed_in_range: number;
  };
  support: {
    in_range: number;
    pending: number;
    recent_pending: { subject: string; status: string; priority: string; created_at: string }[];
  };
}

export interface AdminDashboard {
  range: { from: string; to: string; store_id: string | null };
  stores: DashboardStores;
  owners: { owner_accounts: number; active_owner_accounts: number; active_memberships: number };
  subscriptions: DashboardSubscriptions;
  merchant: DashboardMerchant;
  activity: DashboardActivity;
}

export class DashboardError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 500,
  ) {
    super(message);
  }
}

/**
 * Loads the platform dashboard in one database call. The function checks the signed-in platform administrator itself,
 * so this service adds no authority of its own.
 */
export async function loadAdminDashboard(fromDate: string, toDate: string, storeId: string | null): Promise<AdminDashboard> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('zb_admin_dashboard', { p_from: fromDate, p_to: toDate, p_store: storeId });
  if (error) {
    if (error.code === '42501') throw new DashboardError('Only platform administrators can view these figures.', 403);
    if (error.code === '22023') throw new DashboardError('Choose a date range of up to 366 days.', 400);
    if (error.code === 'P0002') throw new DashboardError('That store was not found.', 404);
    throw new DashboardError('The dashboard could not be loaded. Please try again.', 500);
  }
  return data as AdminDashboard;
}

/** Stores for the filter list. Platform administrators can read every store. */
export async function dashboardStoreOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('stores').select('id, name').order('name').limit(500);
  return (data ?? []) as { id: string; name: string }[];
}
