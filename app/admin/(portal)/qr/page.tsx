import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClass } from '@/components/ui/button';
import { CountTrendChart } from '@/components/qr/count-trend-chart';
import { Card, rs } from '@/app/owner/(portal)/reports/report-views';
import { conversionText, netPaidPaise, type QrStoreRow } from '@/lib/qr/analytics';
import { buildRange, istDateOf, DATE_PRESETS, type DatePreset } from '@/lib/reports/report-math';
import { requireAdmin } from '@/lib/services/admin';
import { loadPlatformQrAnalytics, QrAnalyticsError } from '@/lib/services/qr-analytics';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureShowroomQrAction } from '../stores/actions';
import { setShowroomQrActiveAction } from './actions';

export const dynamic = 'force-dynamic';

const PRESET_LABELS: Record<DatePreset, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', mtd: 'Month to date', ytd: 'Year to date', custom: 'Custom' };

export default async function PlatformQrPage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string; store?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const preset = (DATE_PRESETS.includes(sp.preset as DatePreset) ? sp.preset : '30d') as DatePreset;
  const built = buildRange(preset, istDateOf(new Date()), { from: sp.from ?? '', to: sp.to ?? '' });
  const storeFilter = sp.store && /^[0-9a-f-]{36}$/i.test(sp.store) ? sp.store : '';

  const supabase = await createSupabaseServerClient();
  const [{ data: stores }, { data: qrs }] = await Promise.all([
    supabase.from('stores').select('id, name, slug, status').order('name'),
    supabase.from('qr_codes').select('id, store_id, public_url, is_active').eq('target_type', 'showroom'),
  ]);
  const qrByStore = new Map((qrs ?? []).map((q) => [q.store_id as string, q]));

  if (!built.ok) return <EmptyState title="The dates are not valid" body={built.error} />;
  const range = built.range;

  let summary;
  let daily;
  let comparison: QrStoreRow[];
  try {
    const result = await loadPlatformQrAnalytics(storeFilter || null, range.fromDate, range.toDate);
    summary = result.summary;
    daily = result.daily;
    comparison = result.stores;
  } catch (error) {
    const message = error instanceof QrAnalyticsError ? error.message : 'The QR figures could not be loaded. Please try again.';
    return <EmptyState title="Platform QR analytics is unavailable" body={message} />;
  }
  const byStore = new Map(comparison.map((r) => [r.store_id, r]));
  const exportQuery = `preset=${preset}&from=${range.fromDate}&to=${range.toDate}${storeFilter ? `&store=${storeFilter}` : ''}`;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Platform" title="Platform QR" description="Tracked QR link openings and attributed orders for every store. These are tracked link openings, not verified physical scans." />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-card p-4 text-sm" aria-label="Period and store">
        <label className="grid gap-1">Period
          <select name="preset" defaultValue={preset} className="rounded-control border border-line px-2 py-1.5">
            {DATE_PRESETS.map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="grid gap-1">From<input type="date" name="from" defaultValue={range.fromDate} className="rounded-control border border-line px-2 py-1.5" /></label>
        <label className="grid gap-1">To<input type="date" name="to" defaultValue={range.toDate} className="rounded-control border border-line px-2 py-1.5" /></label>
        <label className="grid gap-1">Store
          <select name="store" defaultValue={storeFilter} className="rounded-control border border-line px-2 py-1.5">
            <option value="">All stores</option>
            {(stores ?? []).map((s) => <option key={s.id as string} value={s.id as string}>{s.name as string}</option>)}
          </select>
        </label>
        <button type="submit" className={buttonClass('secondary')}>Apply</button>
        <div className="flex gap-3">
          <a className="underline" href={`/admin/qr/export?format=csv&${exportQuery}`}>Download CSV</a>
          <a className="underline" href={`/admin/qr/export?format=xlsx&${exportQuery}`}>Download Excel</a>
        </div>
      </form>
      <p className="text-sm text-ink-muted">Period: {range.fromDate} to {range.toDate}. {storeFilter ? 'Scope: one store.' : 'Scope: all stores.'}</p>

      <section className="grid gap-4 md:grid-cols-4" aria-label="Summary">
        <Card label="Recorded entries" value={String(summary.entries)} />
        <Card label="Unique guest sessions" value={String(summary.unique_sessions)} note="Estimate" />
        <Card label="Attributed orders" value={String(summary.attributed_orders)} note="Excludes cancelled" />
        <Card label="Conversion estimate" value={conversionText(summary.conversion_bps)} />
        <Card label="Paid attributed orders" value={String(summary.paid_orders)} />
        <Card label="Paid attributed value" value={rs(summary.paid_value_paise)} />
        <Card label="Net after refunds" value={rs(netPaidPaise(summary.paid_value_paise, summary.refunded_paise))} />
        <Card label="Entries today" value={String(summary.entries_today)} note={`Last 7 days ${summary.entries_last_7_days}`} />
      </section>

      <CountTrendChart label="Recorded entries per day, all stores in scope" points={daily.map((d) => ({ label: d.day, value: d.entries }))} />

      <section className="grid gap-3">
        <h2 className="font-display text-xl text-burgundy">Store comparison and QR codes</h2>
        {!stores || stores.length === 0 ? (
          <p className="text-sm text-ink-muted">No stores yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Store</th><th className="px-4 py-3 text-right">Entries</th><th className="px-4 py-3 text-right">Sessions (est.)</th>
                  <th className="px-4 py-3 text-right">Attributed orders</th><th className="px-4 py-3 text-right">Paid orders</th><th className="px-4 py-3 text-right">Paid value</th>
                  <th className="px-4 py-3 text-right">Conversion est.</th><th className="px-4 py-3">Showroom QR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stores.map((s) => {
                  const row = byStore.get(s.id as string);
                  const qr = qrByStore.get(s.id as string);
                  return (
                    <tr key={s.id as string} className="align-top">
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link href={`/admin/stores/${s.id as string}`} className="underline">{s.name as string}</Link>
                        <div className="text-xs capitalize text-ink-muted">{s.status as string}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{row?.entries ?? 0}</td>
                      <td className="px-4 py-3 text-right">{row?.unique_sessions ?? 0}</td>
                      <td className="px-4 py-3 text-right">{row?.attributed_orders ?? 0}</td>
                      <td className="px-4 py-3 text-right">{row?.paid_orders ?? 0}</td>
                      <td className="px-4 py-3 text-right">{rs(row?.paid_value_paise ?? 0)}</td>
                      <td className="px-4 py-3 text-right">{conversionText(row?.conversion_bps ?? null)}</td>
                      <td className="px-4 py-3">
                        {!qr ? (
                          <form action={ensureShowroomQrAction}>
                            <input type="hidden" name="id" value={s.id as string} />
                            <button type="submit" className={buttonClass('secondary')}>Generate</button>
                          </form>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={qr.is_active ? 'text-success' : 'text-ink-muted'}>{qr.is_active ? 'Active' : 'Inactive'}</span>
                            <form action={setShowroomQrActiveAction}>
                              <input type="hidden" name="id" value={qr.id as string} />
                              <input type="hidden" name="active" value={qr.is_active ? 'false' : 'true'} />
                              <ConfirmSubmit message={qr.is_active ? 'Deactivate this QR code? Scans will stop working.' : 'Activate this QR code?'}>{qr.is_active ? 'Deactivate' : 'Activate'}</ConfirmSubmit>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
