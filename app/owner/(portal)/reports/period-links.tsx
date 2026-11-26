import Link from 'next/link';
import type { DatePreset } from '@/lib/reports/report-math';

const LABELS: Record<Exclude<DatePreset, 'custom'>, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  mtd: 'Month to date',
  ytd: 'Year to date',
};

/** Preset period links. Each keeps the section path; the period lives in the URL so exports match the page. */
export function PeriodLinks({ base, active, from, to }: { base: string; active: DatePreset; from?: string; to?: string }) {
  return (
    <nav className="flex flex-wrap gap-2 text-sm print:hidden">
      {(Object.keys(LABELS) as Exclude<DatePreset, 'custom'>[]).map((p) => (
        <Link
          key={p}
          href={`${base}?preset=${p}`}
          className={`rounded-control px-3 py-1 ${active === p ? 'bg-burgundy text-cream' : 'border border-line text-ink'}`}
        >
          {LABELS[p]}
        </Link>
      ))}
      <form method="get" action={base} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="preset" value="custom" />
        <label className="grid gap-1 text-xs">From
          <input type="date" name="from" defaultValue={from} required className="rounded-control border border-line px-2 py-1 text-sm" />
        </label>
        <label className="grid gap-1 text-xs">To
          <input type="date" name="to" defaultValue={to} required className="rounded-control border border-line px-2 py-1 text-sm" />
        </label>
        <button type="submit" className="rounded-control border border-line px-3 py-1">Apply dates</button>
      </form>
    </nav>
  );
}
