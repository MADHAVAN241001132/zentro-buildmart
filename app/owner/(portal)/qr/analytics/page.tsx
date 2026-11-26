import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CountTrendChart } from '@/components/qr/count-trend-chart';
import { PeriodLinks } from '@/app/owner/(portal)/reports/period-links';
import { Card, rs } from '@/app/owner/(portal)/reports/report-views';
import { conversionText, netPaidPaise, type QrDayRow } from '@/lib/qr/analytics';
import { buildRange, istDateOf, DATE_PRESETS, type DatePreset } from '@/lib/reports/report-math';
import { requireOwnerPermission } from '@/lib/services/owner';
import { loadAttributionSettings, loadStoreQrAnalytics, QrAnalyticsError } from '@/lib/services/qr-analytics';

export const dynamic = 'force-dynamic';

export default async function OwnerQrAnalyticsPage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  const owner = await requireOwnerPermission('qr_analytics');
  const sp = await searchParams;
  const preset = (DATE_PRESETS.includes(sp.preset as DatePreset) ? sp.preset : '30d') as DatePreset;
  const built = buildRange(preset, istDateOf(new Date()), { from: sp.from ?? '', to: sp.to ?? '' });
  if (!built.ok) {
    return <EmptyState title="The dates are not valid" body={built.error} />;
  }
  const range = built.range;

  let summary;
  let daily: QrDayRow[];
  let settings;
  try {
    [{ summary, daily }, settings] = await Promise.all([loadStoreQrAnalytics(owner.storeId, range.fromDate, range.toDate), loadAttributionSettings()]);
  } catch (error) {
    const message = error instanceof QrAnalyticsError ? error.message : 'The QR figures could not be loaded. Please try again.';
    return <EmptyState title="QR analytics is unavailable" body={message} />;
  }

  const exportQuery = `preset=${preset}&from=${range.fromDate}&to=${range.toDate}`;
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="QR"
        title="QR analytics"
        description="Recorded QR link openings for this showroom, with orders attributed to them. These are tracked link openings, not verified physical scans."
      />
      <PeriodLinks base="/owner/qr/analytics" active={preset} from={range.fromDate} to={range.toDate} />
      <p className="text-sm text-ink-muted">Period: {range.fromDate} to {range.toDate}</p>

      <section className="grid gap-4 md:grid-cols-4" aria-label="Summary">
        <Card label="Recorded entries" value={String(summary.entries)} note="Tracked link openings after the refresh window" />
        <Card label="Unique guest sessions" value={String(summary.unique_sessions)} note="Estimate of visitors" />
        <Card label="Repeat entries" value={String(summary.repeat_entries)} note="Entries beyond the first per session" />
        <Card label="Conversion estimate" value={conversionText(summary.conversion_bps)} note="Sessions with a paid attributed order" />
        <Card label="Entries today" value={String(summary.entries_today)} />
        <Card label="Entries, last 7 days" value={String(summary.entries_last_7_days)} />
        <Card label="Entries, month to date" value={String(summary.entries_month_to_date)} />
        <Card label="Attributed orders" value={String(summary.attributed_orders)} note="Excludes cancelled orders" />
        <Card label="Paid attributed orders" value={String(summary.paid_orders)} />
        <Card label="Paid attributed value" value={rs(summary.paid_value_paise)} />
        <Card label="Net after refunds" value={rs(netPaidPaise(summary.paid_value_paise, summary.refunded_paise))} note={`Refunds recorded: ${rs(summary.refunded_paise)}`} />
      </section>

      <CountTrendChart label="Recorded entries per day" points={daily.map((d) => ({ label: d.day, value: d.entries }))} />

      <section className="grid gap-2 rounded-card border border-line bg-card p-5 text-sm">
        <h2 className="font-display text-lg text-burgundy">How these figures are counted</h2>
        <p className="text-ink-muted">
          Each tracked link opening is recorded once per guest session and QR code within {settings.dedupeMinutes} minutes, so refreshes are not counted twice.
          An order is attributed to the most recent tracked entry from the same guest session in the {settings.attributionHours} hours before the order. Each order is attributed once.
          Cancelled orders are excluded. Paid means payment recorded as paid, partly refunded or refunded. Visitors who scan without a tracked link, and any storefront visit, are not counted.
        </p>
        <p className="text-ink-muted">Guest-session identifiers are never shown or exported. Figures are aggregates only.</p>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-burgundy">Daily figures</h2>
          <div className="flex gap-3 text-sm">
            <a className="underline" href={`/owner/qr/analytics/export?format=csv&${exportQuery}`}>Download CSV</a>
            <a className="underline" href={`/owner/qr/analytics/export?format=xlsx&${exportQuery}`}>Download Excel</a>
          </div>
        </div>
        {daily.length === 0 ? (
          <EmptyState title="No days in this period" body="Choose a different period." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Entries</th><th className="px-4 py-3 text-right">Sessions (estimate)</th>
                  <th className="px-4 py-3 text-right">Attributed orders</th><th className="px-4 py-3 text-right">Paid orders</th><th className="px-4 py-3 text-right">Paid value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {daily.map((d) => (
                  <tr key={d.day}>
                    <td className="px-4 py-2">{d.day}</td>
                    <td className="px-4 py-2 text-right">{d.entries}</td>
                    <td className="px-4 py-2 text-right">{d.unique_sessions}</td>
                    <td className="px-4 py-2 text-right">{d.attributed_orders}</td>
                    <td className="px-4 py-2 text-right">{d.paid_orders}</td>
                    <td className="px-4 py-2 text-right">{rs(d.paid_value_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-muted">Back to <Link href="/owner/qr" className="underline">QR codes</Link>.</p>
      </section>
    </div>
  );
}
