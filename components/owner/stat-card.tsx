import type { ReactNode } from 'react';

/**
 * Shared KPI tile for owner and admin dashboards. The value always comes from a server-side
 * query; this component only presents it. `tone` changes the emphasis, never the number.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'attention' | 'positive';
  href?: string;
}) {
  const accent =
    tone === 'attention' ? 'border-warning/60 bg-warning/5' : tone === 'positive' ? 'border-success/40 bg-success/5' : 'border-line bg-card';
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        {icon ? <span aria-hidden="true" className="text-burgundy/70">{icon}</span> : null}
      </div>
      <p className="mt-3 font-display text-2xl text-ink [overflow-wrap:anywhere] sm:text-3xl">{value}</p>
      {hint ? <p className="mt-2 text-xs text-ink-muted">{hint}</p> : null}
    </>
  );
  const className = `flex h-full flex-col rounded-card border p-5 shadow-rest ${accent}`;
  return href ? (
    <a href={href} className={`${className} transition hover:shadow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold`}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
