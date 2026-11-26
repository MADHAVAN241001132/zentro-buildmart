import type { ReactNode } from 'react';
import Link from 'next/link';
import { barPercent } from '@/lib/admin-dashboard/derive';
import { formatINR } from '@/lib/money';

export function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id={id} className="font-display text-2xl text-burgundy">{title}</h2>
        {note && <p className="max-w-prose text-xs text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums text-burgundy [overflow-wrap:anywhere]">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </>
  );
  const cls = 'rounded-card border border-line border-t-2 border-t-gold/70 bg-card p-5 shadow-rest';
  return href ? (
    <Link href={href} className={`${cls} hover:shadow-hover`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Shortcut strip for the most common platform tasks. Each link goes to an existing admin page. */
export function QuickActions({ actions }: { actions: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Quick management actions" className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="rounded-control border border-line bg-card px-3.5 py-2 text-sm font-semibold text-burgundy shadow-rest transition hover:border-burgundy hover:shadow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          {a.label}
        </Link>
      ))}
    </nav>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** Bars scaled to the largest value. A bar of zero is shown as an empty track, so no day is hidden. */
export function BarTrend({ rows, label, value, format }: { rows: { key: string; title: string }[]; label: string; value: (key: string) => number; format: (n: number) => string }) {
  const max = Math.max(0, ...rows.map((r) => value(r.key)));
  return (
    <div className="rounded-card border border-line bg-card p-5">
      <p className="mb-3 text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="flex h-40 items-end gap-1" role="list" aria-label={label}>
        {rows.map((r) => {
          const v = value(r.key);
          return (
            <div key={r.key} role="listitem" title={`${r.title}: ${format(v)}`} className="flex h-full flex-1 flex-col justify-end">
              <div className="rounded-t bg-gold" style={{ height: `${barPercent(v, max)}%`, minHeight: v > 0 ? '2px' : '0' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Table({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="px-4 py-6 text-sm text-ink-muted">{empty}</p>}
    </div>
  );
}

export function Td({ children, align }: { children: ReactNode; align?: 'right' }) {
  return <td className={`border-t border-line px-4 py-3 ${align === 'right' ? 'text-right tabular-nums' : ''}`}>{children}</td>;
}

export function money(paise: number): string {
  return formatINR(paise);
}

export function Notice({ tone, children }: { tone: 'warn' | 'error'; children: ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className="rounded-card border border-line bg-cream px-4 py-3 text-sm text-burgundy">
      {children}
    </p>
  );
}
