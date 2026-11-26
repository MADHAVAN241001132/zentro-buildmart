import Link from 'next/link';
import { AlertTriangle, ArrowRight, Boxes, Banknote, ClipboardList, IndianRupee, PackageCheck, ReceiptText, TrendingUp } from 'lucide-react';
import { loadMyStorePermissions, requireOwner } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/owner/stat-card';
import { PageHeader } from '@/components/owner/page-header';

export const dynamic = 'force-dynamic';

const IST = 'Asia/Kolkata';

interface Metrics {
  gross_sales_paise?: number;
  paid_orders?: number;
  orders_placed?: number;
  gross_profit_paise?: number;
  expenses_paise?: number;
  pending_cash_count?: number;
  pending_cash_paise?: number;
  low_stock_count?: number;
  hidden_sections?: string[];
}

interface RecentOrder {
  id: string;
  order_number: string;
  customer_name: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  total_paise: number;
  created_at: string;
}

const SECTION_LABEL: Record<string, string> = {
  orders: 'orders',
  reports: 'reports and financial totals',
  cash: 'cash confirmation',
  inventory: 'inventory',
};

const QUICK_ACTIONS = [
  { href: '/owner/pos/new', label: 'New POS bill', permission: 'pos_billing', icon: ReceiptText },
  { href: '/owner/orders', label: 'Review orders', permission: 'order_management', icon: ClipboardList },
  { href: '/owner/cash', label: 'Confirm cash', permission: 'cash_confirmation', icon: Banknote },
  { href: '/owner/inventory', label: 'Check stock', permission: 'inventory_management', icon: Boxes },
  { href: '/owner/products', label: 'Manage products', permission: 'product_management', icon: PackageCheck },
  { href: '/owner/reports', label: 'Open reports', permission: 'reports_exports', icon: TrendingUp },
] as const;

/** Greeting in the store's own timezone, so a server in another zone still greets correctly. */
function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: IST }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function istDayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: IST }).format(new Date(iso));
}

export default async function OwnerDashboard() {
  const owner = await requireOwner();
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const to = now;
  const from = new Date(now.getFullYear(), now.getMonth(), 1);

  const [metricsResult, permissions] = await Promise.all([
    supabase.rpc('store_dashboard_metrics', {
      p_store: owner.storeId,
      p_from: from.toISOString(),
      p_to: new Date(to.getTime() + 60_000).toISOString(),
    }),
    loadMyStorePermissions(owner.storeId),
  ]);
  const { data, error } = metricsResult;
  const held = new Set(permissions);
  const metrics = data ? (data as unknown as Metrics) : null;
  const hidden = new Set(metrics?.hidden_sections ?? []);

  // Recent orders and the daily trend read the same table the Orders page uses, scoped to this store.
  // They are shown only where the RPC did not withhold the orders or reports section.
  let recent: RecentOrder[] = [];
  let trend: { day: string; paise: number; count: number }[] = [];
  if (metrics && !hidden.has('orders')) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, payment_method, payment_status, order_status, total_paise, created_at')
      .eq('store_id', owner.storeId)
      .order('created_at', { ascending: false })
      .limit(6);
    recent = (orders ?? []) as RecentOrder[];
  }
  if (metrics && !hidden.has('reports')) {
    const { data: paid } = await supabase
      .from('orders')
      .select('total_paise, created_at')
      .eq('store_id', owner.storeId)
      .eq('payment_status', 'PAID')
      .gte('created_at', from.toISOString())
      .limit(5000);
    const buckets = new Map<string, { paise: number; count: number }>();
    for (const row of (paid ?? []) as { total_paise: number; created_at: string }[]) {
      const key = istDayKey(row.created_at);
      const bucket = buckets.get(key) ?? { paise: 0, count: 0 };
      bucket.paise += row.total_paise;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    const daysSoFar = Number(new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: IST }).format(now));
    const year = Number(new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: IST }).format(now));
    const month = Number(new Intl.DateTimeFormat('en-GB', { month: '2-digit', timeZone: IST }).format(now));
    trend = Array.from({ length: daysSoFar }, (_, i) => {
      const day = i + 1;
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const bucket = buckets.get(key) ?? { paise: 0, count: 0 };
      return { day: key, ...bucket };
    });
  }

  const withheld = [...hidden].map((section) => SECTION_LABEL[section]).filter(Boolean);
  const quick = QUICK_ACTIONS.filter((action) => held.has(action.permission));
  const lowStock = metrics?.low_stock_count ?? 0;
  const pendingCash = metrics?.pending_cash_count ?? 0;
  const showCashAlert = pendingCash > 0 && held.has('cash_confirmation') && !hidden.has('cash');
  const showStockAlert = lowStock > 0 && held.has('inventory_management') && !hidden.has('inventory');

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={`${greeting(now)} · ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: IST }).format(now)}`}
        title={owner.storeName}
        description="Month-to-date figures for this showroom. Values come from the store's own orders, payments and stock records."
      />

      {error || !metrics ? (
        <EmptyState title="Dashboard unavailable" body="The metrics could not be loaded. Refresh the page or try again shortly." />
      ) : (
        <>
          {withheld.length > 0 ? (
            <p className="rounded-card border border-line bg-card p-4 text-sm text-ink-muted">
              Some figures are not shown because your role in this store does not include access to {withheld.join(', ')}.
            </p>
          ) : null}

          {showCashAlert || showStockAlert ? (
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {showCashAlert ? (
                <li>
                  <Link href="/owner/cash" className="flex items-center gap-3 rounded-card border border-warning/60 bg-warning/5 p-4 hover:shadow-hover">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
                    <span>
                      <strong className="font-semibold text-ink">{pendingCash} cash payment{pendingCash === 1 ? '' : 's'}</strong> waiting for confirmation
                    </span>
                  </Link>
                </li>
              ) : null}
              {showStockAlert ? (
                <li>
                  <Link href="/owner/inventory" className="flex items-center gap-3 rounded-card border border-warning/60 bg-warning/5 p-4 hover:shadow-hover">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
                    <span>
                      <strong className="font-semibold text-ink">{lowStock} item{lowStock === 1 ? '' : 's'}</strong> at or below the low-stock level
                    </span>
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}

          <section aria-labelledby="kpi-heading" className="grid gap-4">
            <h2 id="kpi-heading" className="sr-only">Key figures</h2>
            {metrics.gross_sales_paise === undefined && metrics.paid_orders === undefined && metrics.orders_placed === undefined ? (
              <EmptyState title="Nothing to show" body="Your role in this store does not include any dashboard figures." />
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.gross_sales_paise !== undefined ? (
                  <li><StatCard label="Gross sales" value={formatINR(metrics.gross_sales_paise)} icon={<IndianRupee className="h-5 w-5" />} hint="This month" tone="positive" /></li>
                ) : null}
                {metrics.gross_profit_paise !== undefined ? (
                  <li><StatCard label="Gross profit" value={formatINR(metrics.gross_profit_paise)} icon={<TrendingUp className="h-5 w-5" />} hint={metrics.expenses_paise !== undefined ? `Expenses ${formatINR(metrics.expenses_paise)}` : 'This month'} /></li>
                ) : null}
                {metrics.orders_placed !== undefined ? (
                  <li><StatCard label="Orders placed" value={String(metrics.orders_placed)} icon={<ClipboardList className="h-5 w-5" />} href="/owner/orders" hint="All statuses" /></li>
                ) : null}
                {metrics.paid_orders !== undefined ? (
                  <li><StatCard label="Paid orders" value={String(metrics.paid_orders)} icon={<PackageCheck className="h-5 w-5" />} href="/owner/orders?status=PAID" hint="Payment received" /></li>
                ) : null}
                {metrics.pending_cash_count !== undefined && metrics.pending_cash_paise !== undefined ? (
                  <li>
                    <StatCard
                      label="Cash awaiting confirmation"
                      value={formatINR(metrics.pending_cash_paise)}
                      icon={<Banknote className="h-5 w-5" />}
                      hint={`${metrics.pending_cash_count} cash awaiting confirmation`}
                      tone={pendingCash > 0 ? 'attention' : 'neutral'}
                      href="/owner/cash"
                    />
                  </li>
                ) : null}
                {metrics.low_stock_count !== undefined ? (
                  <li>
                    <StatCard
                      label="Low-stock items"
                      value={String(lowStock)}
                      icon={<Boxes className="h-5 w-5" />}
                      hint={lowStock > 0 ? 'Reorder or restock' : 'No low-stock items'}
                      tone={lowStock > 0 ? 'attention' : 'neutral'}
                      href="/owner/inventory"
                    />
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            {trend.length > 0 ? (
              <section aria-labelledby="trend-heading" className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="trend-heading" className="font-display text-xl text-burgundy">Daily paid sales</h2>
                  <p className="text-xs text-ink-muted">Paid order value per day, Indian time</p>
                </div>
                <DailyBars days={trend} />
              </section>
            ) : null}

            {quick.length > 0 ? (
              <section aria-labelledby="quick-heading" className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
                <h2 id="quick-heading" className="font-display text-xl text-burgundy">Quick actions</h2>
                <ul className="grid grid-cols-2 gap-2">
                  {quick.map((action) => (
                    <li key={action.href}>
                      <Link
                        href={action.href}
                        className="flex h-full items-center justify-between gap-2 rounded-control border border-line bg-cream/60 px-3 py-3 text-sm font-medium text-ink transition hover:border-burgundy hover:text-burgundy focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                      >
                        <span className="flex items-center gap-2">
                          <action.icon className="h-4 w-4 shrink-0 text-burgundy" aria-hidden />
                          {action.label}
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {recent.length > 0 ? (
            <section aria-labelledby="recent-heading" className="grid gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="recent-heading" className="font-display text-xl text-burgundy">Recent orders</h2>
                <Link href="/owner/orders" className="text-sm font-semibold text-burgundy hover:underline">View all orders</Link>
              </div>
              <div className="overflow-x-auto rounded-card border border-line bg-card shadow-rest">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-line bg-cream/60 text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {recent.map((order) => (
                      <tr key={order.id} className="hover:bg-cream/40">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-burgundy">{order.order_number}</span>
                          <p className="text-xs text-ink-muted">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: IST }).format(new Date(order.created_at))}</p>
                        </td>
                        <td className="px-4 py-3 text-ink">{order.customer_name}</td>
                        <td className="px-4 py-3">
                          <PaymentPill status={order.payment_status} />
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{order.order_status.replace(/_/g, ' ').toLowerCase()}</td>
                        <td className="px-4 py-3 text-right font-semibold text-ink">{formatINR(order.total_paise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function PaymentPill({ status }: { status: string }) {
  const tone =
    status === 'PAID'
      ? 'border-success/40 bg-success/10 text-success'
      : status === 'CASH_PENDING' || status === 'PENDING'
        ? 'border-warning/60 bg-warning/10 text-warning'
        : 'border-line bg-cream text-ink-muted';
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

/** Dependency-free bar chart. Bar heights are relative to the busiest day; each bar has a text label. */
function DailyBars({ days }: { days: { day: string; paise: number; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.paise));
  return (
    <div className="grid gap-2">
      <div className="flex h-44 items-end gap-1 sm:gap-1.5" role="list" aria-label="Paid sales by day">
        {days.map((d) => {
          const pct = Math.round((d.paise / max) * 100);
          const label = `${d.day}: ${formatINR(d.paise)} from ${d.count} paid order${d.count === 1 ? '' : 's'}`;
          return (
            <div key={d.day} role="listitem" className="flex h-full min-w-0 flex-1 flex-col justify-end" title={label}>
              <span className="sr-only">{label}</span>
              <div
                className={`w-full rounded-t-sm ${d.paise > 0 ? 'bg-burgundy' : 'bg-line'}`}
                style={{ height: d.paise > 0 ? `${Math.max(pct, 4)}%` : '3px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-ink-muted" aria-hidden="true">
        <span>{days[0]?.day.slice(8)}</span>
        <span>{days[days.length - 1]?.day.slice(8)}</span>
      </div>
    </div>
  );
}
