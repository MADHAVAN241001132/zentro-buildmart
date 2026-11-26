import Link from 'next/link';
import type { ReactNode } from 'react';
import { barHeights, donutSlices, linePath, linePoints } from '@/lib/reports/charts';
import { paiseToRupeeText, percentText } from '@/lib/reports/report-math';
import type { TrendPoint } from '@/lib/services/reports';

export const rs = (paise: number) => `Rs. ${paiseToRupeeText(paise)}`;

export function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid gap-1 rounded-card border border-line bg-white p-4">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="font-display text-2xl text-burgundy">{value}</span>
      {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
    </div>
  );
}

export function TrendChart({ points, label }: { points: TrendPoint[]; label: string }) {
  if (points.length === 0) {
    return <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-muted">No sales in this period, so there is no trend to chart.</p>;
  }
  const values = points.map((p) => p.taxablePaise);
  const W = 640;
  const H = 220;
  const { points: pts, max } = linePoints(values, W, H, 16);
  return (
    <figure className="grid gap-2 rounded-card border border-line bg-white p-4">
      <figcaption className="text-sm font-semibold text-burgundy">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, peak ${rs(max)}`} className="h-auto w-full">
        <path d={linePath(pts)} fill="none" stroke="#6A0D2A" strokeWidth={2.5} />
        {pts.map((p, i) => (
          <circle key={points[i]!.bucketStart} cx={p.x} cy={p.y} r={3} fill="#C9A45C">
            <title>{`${points[i]!.bucketStart}: ${rs(values[i]!)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-ink-muted">
        <span>{points[0]!.bucketStart}</span>
        <span>Peak {rs(max)}</span>
        <span>{points[points.length - 1]!.bucketStart}</span>
      </div>
    </figure>
  );
}

export function ChannelBars({ online, pos }: { online: number; pos: number }) {
  const [a, b] = barHeights([online, pos], 120);
  return (
    <figure className="grid gap-2 rounded-card border border-line bg-white p-4">
      <figcaption className="text-sm font-semibold text-burgundy">Guest online and point of sale</figcaption>
      <svg viewBox="0 0 300 150" role="img" aria-label="Sales by channel" className="h-auto w-full max-w-md">
        <rect x={60} y={130 - (a ?? 0)} width={70} height={a ?? 0} fill="#6A0D2A" />
        <rect x={180} y={130 - (b ?? 0)} width={70} height={b ?? 0} fill="#C9A45C" />
        <text x={95} y={146} fontSize={11} textAnchor="middle" fill="#2A2222">Online</text>
        <text x={215} y={146} fontSize={11} textAnchor="middle" fill="#2A2222">POS</text>
      </svg>
    </figure>
  );
}

const DONUT_COLOURS = ['#6A0D2A', '#C9A45C', '#8C5A6A'];

export function PaymentDonut({ parts }: { parts: { label: string; value: number }[] }) {
  const slices = donutSlices(parts, 90, 90, 80, 45);
  return (
    <figure className="grid gap-2 rounded-card border border-line bg-white p-4">
      <figcaption className="text-sm font-semibold text-burgundy">Payment method (value)</figcaption>
      {slices.length === 0 ? (
        <p className="text-sm text-ink-muted">No payments in this period.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 180 180" role="img" aria-label="Payment method share" className="h-44 w-44">
            {slices.map((s, i) => <path key={s.label} d={s.path} fill={DONUT_COLOURS[i % DONUT_COLOURS.length]} />)}
          </svg>
          <ul className="grid gap-1 text-sm">
            {slices.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3" style={{ background: DONUT_COLOURS[i % DONUT_COLOURS.length] }} />
                {s.label}: {percentText(s.share)} ({rs(s.value)})
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

export function SortHeader({ base, label, sortKey, current, dir, align }: { base: string; label: string; sortKey: string; current: string; dir: string; align?: 'right' }) {
  const nextDir = current === sortKey && dir === 'desc' ? 'asc' : 'desc';
  const arrow = current === sortKey ? (dir === 'desc' ? ' ▼' : ' ▲') : '';
  return (
    <th className={`px-4 py-2 ${align === 'right' ? 'text-right' : ''}`}>
      <Link href={`${base}&sort=${sortKey}&dir=${nextDir}`} className="hover:text-burgundy">{label}{arrow}</Link>
    </th>
  );
}

export function Pager({ base, page, pages }: { base: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center gap-3 text-sm">
      {page > 1 ? <Link className="text-burgundy underline" href={`${base}&page=${page - 1}`}>Previous</Link> : <span className="text-ink-muted">Previous</span>}
      <span>Page {page} of {pages}</span>
      {page < pages ? <Link className="text-burgundy underline" href={`${base}&page=${page + 1}`}>Next</Link> : <span className="text-ink-muted">Next</span>}
    </nav>
  );
}

export interface TableColumn { label: string; right?: boolean }

/** Plain report table used by the section pages. Cells are preformatted by the caller. */
export function SimpleTable({ columns, rows, empty }: { columns: TableColumn[]; rows: (string | number | null | ReactNode)[][]; empty?: string }) {
  if (rows.length === 0) return <p className="rounded-card border border-line bg-white p-4 text-sm text-ink-muted">{empty ?? 'No records for this period.'}</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-cream text-xs uppercase tracking-wide text-ink-muted">
          <tr>{columns.map((c) => <th key={c.label} className={`px-4 py-2 ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-line">
              {row.map((cell, j) => <td key={j} className={`px-4 py-2 ${columns[j]?.right ? 'text-right' : ''}`}>{cell ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SectionNav({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-2 text-sm print:hidden">
      {[
        { href: '/owner/reports', label: 'Overview' },
        { href: '/owner/reports/annual', label: 'Annual' },
        { href: '/owner/reports/purchasing', label: 'Purchasing and suppliers' },
        { href: '/owner/reports/customers', label: 'Customers and credit' },
        { href: '/owner/reports/cash', label: 'Cash' },
        { href: '/owner/reports/inventory', label: 'Inventory' },
        { href: '/owner/reports/gst', label: 'GST' },
      ].map((s) => (
        <Link key={s.href} href={s.href} className={`rounded-control px-3 py-1.5 ${current === s.href ? 'bg-burgundy text-cream' : 'border border-line text-ink'}`}>{s.label}</Link>
      ))}
    </nav>
  );
}

/** Export buttons for one section. Each link keeps the period and filters, and picks the format. */
export function ExportBar({ items, query }: { items: { type: string; label: string }[]; query: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs print:hidden">
      {items.map((item) => (
        <span key={item.type} className="flex items-center gap-1 rounded-control border border-line bg-white px-2 py-1">
          <span className="mr-1 font-semibold text-burgundy">{item.label}</span>
          <a className="underline" href={`/owner/reports/export?type=${item.type}&format=csv&${query}`}>CSV</a>
          <a className="underline" href={`/owner/reports/export?type=${item.type}&format=xlsx&${query}`}>Excel</a>
          <a className="underline" href={`/owner/reports/export?type=${item.type}&format=pdf&${query}`}>PDF</a>
        </span>
      ))}
    </div>
  );
}
