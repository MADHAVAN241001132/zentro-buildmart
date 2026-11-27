import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { BarTrend, Notice, QuickActions, Section, Stat, StatGrid, Table, Td, money } from '@/components/admin/dashboard-ui';
import { DATE_PRESETS, buildRange, istDateOf, type DatePreset } from '@/lib/reports/report-math';
import { inclusiveDays, MAX_DASHBOARD_DAYS, percentOf } from '@/lib/admin-dashboard/derive';
import { conversionText } from '@/lib/qr/analytics';
import { requireAdmin } from '@/lib/services/admin';
import { DashboardError, dashboardStoreOptions, loadAdminDashboard, type AdminDashboard } from '@/lib/services/admin-dashboard';
import { loadPlatformQrAnalytics } from '@/lib/services/qr-analytics';

export const dynamic = 'force-dynamic';

type SearchParams = { preset?: string; from?: string; to?: string; store?: string };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const PRESET_LABEL: Record<DatePreset, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', mtd: 'Month to date', ytd: 'Year to date', custom: 'Custom range' };

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = istDateOf(new Date());
  const preset = (DATE_PRESETS.includes(sp.preset as DatePreset) ? sp.preset : '30d') as DatePreset;
  const custom = sp.from && sp.to && DATE_ONLY.test(sp.from) && DATE_ONLY.test(sp.to) ? { from: sp.from, to: sp.to } : undefined;
  const built = buildRange(preset, today, custom);
  const storeId = sp.store && UUID.test(sp.store) ? sp.store : null;
  const stores = await dashboardStoreOptions();

  const filters = (
    <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Dashboard filters">
      <label className="grid min-w-0 flex-1 basis-36 gap-1 text-xs text-ink-muted sm:flex-none">
        Period
        <select name="preset" defaultValue={preset} className="w-full min-w-0 rounded-control border border-line bg-cream px-3 py-2 text-sm text-ink">
          {DATE_PRESETS.map((p) => (
            <option key={p} value={p}>{PRESET_LABEL[p]}</option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 flex-1 basis-36 gap-1 text-xs text-ink-muted sm:flex-none">
        From
        <input type="date" name="from" defaultValue={custom?.from} className="w-full min-w-0 rounded-control border border-line bg-cream px-3 py-2 text-sm text-ink" />
      </label>
      <label className="grid min-w-0 flex-1 basis-36 gap-1 text-xs text-ink-muted sm:flex-none">
        To
        <input type="date" name="to" defaultValue={custom?.to} className="w-full min-w-0 rounded-control border border-line bg-cream px-3 py-2 text-sm text-ink" />
      </label>
      <label className="grid min-w-0 flex-1 basis-44 gap-1 text-xs text-ink-muted sm:flex-none">
        Store
        <select name="store" defaultValue={storeId ?? ''} className="w-full min-w-0 rounded-control border border-line bg-cream px-3 py-2 text-sm text-ink">
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="min-h-[40px] rounded-control bg-burgundy px-4 py-2 text-sm text-cream">Apply</button>
    </form>
  );

  const header = (
    <PageHeader
      eyebrow="Platform"
      title="Dashboard"
      description="Figures come from the database on each load. Merchant sales, collected payments and ZENTRO subscription receipts are shown separately."
    />
  );

  if (!built.ok) {
    return (
      <div className="grid gap-6">
        {header}
        {filters}
        <Notice tone="error">{built.error}</Notice>
      </div>
    );
  }
  const { fromDate, toDate } = built.range;
  if (inclusiveDays(fromDate, toDate) > MAX_DASHBOARD_DAYS) {
    return (
      <div className="grid gap-6">
        {header}
        {filters}
        <Notice tone="error">Choose a period of up to {MAX_DASHBOARD_DAYS} days.</Notice>
      </div>
    );
  }

  let data: AdminDashboard;
  try {
    data = await loadAdminDashboard(fromDate, toDate, storeId);
  } catch (error) {
    const message = error instanceof DashboardError ? error.message : 'The dashboard could not be loaded. Please try again.';
    return (
      <div className="grid gap-6">
        {header}
        {filters}
        <Notice tone="error">{message}</Notice>
      </div>
    );
  }

  // Section D reuses the QR analytics loader. A failure here shows in that section only.
  let qr: Awaited<ReturnType<typeof loadPlatformQrAnalytics>> | null = null;
  let qrError = false;
  try {
    qr = await loadPlatformQrAnalytics(storeId, fromDate, toDate);
  } catch {
    qrError = true;
  }

  const m = data.merchant;
  const days = m.trend.map((t) => ({ key: t.day, title: t.day }));
  const trendOf = (key: string) => m.trend.find((t) => t.day === key)?.collected_paise ?? 0;
  const ordersOf = (key: string) => m.trend.find((t) => t.day === key)?.orders ?? 0;
  const subs = data.subscriptions;
  const planMax = Math.max(0, ...subs.plan_distribution.map((p) => p.count));

  return (
    <div className="grid min-w-0 gap-10">
      {header}
      {filters}
      <div className="grid gap-3">
        <p className="text-sm text-ink-muted">
          Showing {PRESET_LABEL[preset]}: {fromDate} to {toDate} IST{storeId ? `, ${stores.find((s) => s.id === storeId)?.name ?? 'selected store'}` : ', all stores'}.
        </p>
        <QuickActions
          actions={[
            { href: '/admin/onboarding', label: 'Onboard a store' },
            { href: '/admin/stores', label: 'Manage stores' },
            { href: '/admin/subscriptions', label: 'Subscriptions' },
            { href: '/admin/payments', label: 'Payments' },
            { href: '/admin/support', label: 'Support cases' },
            { href: '/admin/analytics', label: 'Platform analytics' },
            { href: '/admin/audit', label: 'Audit logs' },
          ]}
        />
      </div>

      <Section id="stores" title="Store overview" note="Platform-wide. The store filter does not change these counts.">
        <StatGrid>
          <Stat label="Total stores" value={data.stores.total} href="/admin/stores" />
          <Stat label="Active stores" value={data.stores.active} href="/admin/stores?status=active" />
          <Stat label="Inactive stores" value={data.stores.inactive} hint="Suspended or archived" href="/admin/stores" />
          <Stat label="Draft stores" value={data.stores.draft} href="/admin/stores" />
          <Stat label="Incomplete onboarding" value={data.stores.onboarding.incomplete} href="/admin/onboarding" />
          <Stat label="Completed onboarding" value={data.stores.onboarding.completed} href="/admin/onboarding" />
          <Stat label="Store owner accounts" value={data.owners.owner_accounts} hint={`${data.owners.active_owner_accounts} active`} href="/admin/owners" />
          <Stat label="Active store memberships" value={data.owners.active_memberships} hint="Owners, managers and staff" href="/admin/owners" />
        </StatGrid>
        {data.stores.recent.length === 0 ? (
          <EmptyState title="No stores yet" body="Stores appear here once they are created." />
        ) : (
          <Table headers={['Recently registered', 'Status', 'Registered']}>
            {data.stores.recent.map((s) => (
              <tr key={s.id}>
                <Td>{s.name}</Td>
                <Td>{s.status}</Td>
                <Td>{new Date(s.created_at).toLocaleDateString('en-IN')}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section id="subscriptions" title="Subscriptions" note="Expected plan value is the list price of current subscriptions. It is not money received. Recorded payments are subscription receipts logged in the database.">
        <StatGrid>
          <Stat label="Active subscriptions" value={subs.active} href="/admin/subscriptions" />
          <Stat label="Expired subscriptions" value={subs.expired} href="/admin/subscriptions" />
          <Stat label="Expiring within 14 days" value={subs.expiring_within_14_days} href="/admin/subscriptions" />
          <Stat label="Active migration allowances" value={subs.migration_allowances_active} href="/admin/subscriptions" />
          <Stat label="Expected plan value" value={money(subs.expected_plan_value_paise)} hint="Not collected revenue" />
          <Stat label="Recorded subscription payments" value={money(subs.recorded_payments_paise)} hint="In the selected period" />
        </StatGrid>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-card border border-line bg-card p-5">
            <p className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Plan distribution</p>
            {subs.plan_distribution.length === 0 ? (
              <p className="text-sm text-ink-muted">No current subscriptions.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {subs.plan_distribution.map((p) => (
                  <li key={p.plan} className="grid gap-1">
                    <span className="flex justify-between"><span>{p.plan}</span><span className="tabular-nums">{p.count}</span></span>
                    <span className="h-2 rounded bg-cream"><span className="block h-2 rounded bg-gold" style={{ width: `${percentOf(p.count, planMax) ?? 0}%` }} /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            {subs.near_limit.length === 0 ? (
              <EmptyState title="No store is close to a plan limit" body="Stores at 80% or more of a product or user limit appear here." />
            ) : (
              <Table headers={['Store', 'Plan', 'Products', 'Users']}>
                {subs.near_limit.map((s) => (
                  <tr key={s.store_id}>
                    <Td>{s.store_name}</Td>
                    <Td>{s.plan_name}</Td>
                    <Td align="right">{s.products_used}{s.max_products !== null ? ` / ${s.max_products}` : ''}</Td>
                    <Td align="right">{s.users_used}{s.max_users !== null ? ` / ${s.max_users}` : ''}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
        {subs.renewals.length === 0 ? (
          <p className="text-sm text-ink-muted">No subscription payments recorded in this period.</p>
        ) : (
          <Table headers={['Recent renewal', 'Store', 'Paid on', 'Amount']}>
            {subs.renewals.map((r, i) => (
              <tr key={i}>
                <Td>Recorded payment</Td>
                <Td>{r.store}</Td>
                <Td>{r.paid_on}</Td>
                <Td align="right">{money(r.amount_paise)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section id="merchant" title="Merchant performance" note="Gross order value is sales booked, not cash. Collected is payments recorded as paid in the period. Refunds are those processed in the period. Refund-adjusted revenue = collected minus refunds. Store credit and cash still pending are not counted as collected.">
        <StatGrid>
          <Stat label="Total orders" value={m.total} href="/admin/analytics" />
          <Stat label="Paid orders" value={m.paid} />
          <Stat label="Pending orders" value={m.pending} />
          <Stat label="Cancelled orders" value={m.cancelled} />
          <Stat label="Refunded orders" value={m.refunded} hint={`${m.partially_refunded} partially refunded`} />
          <Stat label="Gross order value" value={money(m.gross_order_value_paise)} hint="Sales value, excludes cancelled" />
          <Stat label="Collected payments" value={money(m.collected_paise)} hint={`${m.payments} payments`} />
          <Stat label="Refund-adjusted revenue" value={money(m.refund_adjusted_revenue_paise)} hint={`${m.refunds} refunds, ${money(m.refunds_paise)}`} />
        </StatGrid>
        {days.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <BarTrend rows={days} label="Collected per day" value={trendOf} format={money} />
            <BarTrend rows={days} label="Orders per day" value={ordersOf} format={(n) => `${n}`} />
          </div>
        )}
        {m.by_store.length === 0 ? (
          <EmptyState title="No merchant activity in this period" body="Orders, payments and refunds for the selected stores appear here." />
        ) : (
          <Table headers={['Store', 'Orders', 'Paid', 'Gross', 'Collected', 'Refunds', 'Net']}>
            {m.by_store.map((s) => (
              <tr key={s.store_id}>
                <Td>{s.store_name}</Td>
                <Td align="right">{s.orders}</Td>
                <Td align="right">{s.paid_orders}</Td>
                <Td align="right">{money(s.gross_paise)}</Td>
                <Td align="right">{money(s.collected_paise)}</Td>
                <Td align="right">{money(s.refunds_paise)}</Td>
                <Td align="right">{money(s.net_paise)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section id="qr" title="QR analytics" note="Tracked entries count recorded QR link openings. They are not verified physical scans. Guest sessions are estimates.">
        {qrError || !qr ? (
          <Notice tone="error">QR figures could not be loaded for this period. The other sections are unaffected.</Notice>
        ) : (
          <>
            <StatGrid>
              <Stat label="Recorded QR entries" value={qr.summary.entries} hint={`${qr.summary.entries_today} today`} href="/admin/qr" />
              <Stat label="Estimated unique guest sessions" value={qr.summary.unique_sessions} />
              <Stat label="QR-attributed orders" value={qr.summary.attributed_orders} />
              <Stat label="Paid attributed orders" value={qr.summary.paid_orders} hint={money(qr.summary.paid_value_paise)} />
              <Stat label="Conversion estimate" value={conversionText(qr.summary.conversion_bps)} hint="Converted sessions over unique sessions" />
            </StatGrid>
            <BarTrend
              rows={qr.daily.map((d) => ({ key: d.day, title: d.day }))}
              label="QR entries per day"
              value={(k) => qr!.daily.find((d) => d.day === k)?.entries ?? 0}
              format={(n) => `${n}`}
            />
            {qr.stores.length === 0 ? (
              <EmptyState title="No QR entries in this period" body="Entries appear once customers open a store QR link." />
            ) : (
              <Table headers={['Store', 'Entries', 'Estimated sessions', 'Attributed orders', 'Paid orders']}>
                {qr.stores.map((s) => (
                  <tr key={s.store_id}>
                    <Td>{s.store_name}</Td>
                    <Td align="right">{s.entries}</Td>
                    <Td align="right">{s.unique_sessions}</Td>
                    <Td align="right">{s.attributed_orders}</Td>
                    <Td align="right">{s.paid_orders}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </Section>

      <Section id="activity" title="Administrative activity" note="Each item links to the page where it is managed.">
        <StatGrid>
          <Stat label="Administrative actions" value={data.activity.actions_in_range} href="/admin/audit" />
          <Stat label="Permission and membership changes" value={data.activity.permission_changes_in_range} href="/admin/audit" />
          <Stat label="Onboarding updates" value={data.activity.onboarding.updated_in_range} href="/admin/onboarding" />
          <Stat label="Unresolved provisioning requests" value={data.activity.provisioning.unresolved} hint={`${data.activity.provisioning.reconciliation_required} need review, ${data.activity.provisioning.failed} failed`} href="/admin/provisioning?status=RECONCILIATION_REQUIRED" />
          <Stat label="Pending support cases" value={data.activity.support.pending} href="/admin/support" />
          <Stat label="Support requests in period" value={data.activity.support.in_range} href="/admin/support" />
        </StatGrid>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-display text-xl text-burgundy">Recent administrative actions</h3>
            {data.activity.recent.length === 0 ? (
              <p className="text-sm text-ink-muted">No administrative actions yet.</p>
            ) : (
              <Table headers={['Action', 'Entity', 'Actor', 'When']}>
                {data.activity.recent.map((a, i) => (
                  <tr key={i}>
                    <Td>{a.action}</Td>
                    <Td>{a.entity_type}</Td>
                    <Td>{a.actor_type}</Td>
                    <Td>{new Date(a.created_at).toLocaleString('en-IN')}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
          <div>
            <h3 className="mb-2 font-display text-xl text-burgundy">Pending support cases</h3>
            {data.activity.support.recent_pending.length === 0 ? (
              <p className="text-sm text-ink-muted">No pending support cases. <Link href="/admin/support" className="text-burgundy underline">Open support</Link></p>
            ) : (
              <Table headers={['Subject', 'Status', 'Priority', 'Opened']}>
                {data.activity.support.recent_pending.map((t, i) => (
                  <tr key={i}>
                    <Td>{t.subject}</Td>
                    <Td>{t.status}</Td>
                    <Td>{t.priority}</Td>
                    <Td>{new Date(t.created_at).toLocaleDateString('en-IN')}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
