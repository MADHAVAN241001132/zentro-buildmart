import { linePath, linePoints } from '@/lib/reports/charts';

/** Line chart of counts for a period. Shows a message instead of a flat line when nothing was recorded. */
export function CountTrendChart({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  if (points.length === 0 || points.every((p) => p.value === 0)) {
    return <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-muted">No recorded QR entries in this period.</p>;
  }
  const W = 640;
  const H = 220;
  const { points: pts, max } = linePoints(points.map((p) => p.value), W, H, 16);
  return (
    <figure className="grid gap-2 rounded-card border border-line bg-white p-4">
      <figcaption className="text-sm font-semibold text-burgundy">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, peak ${max}`} className="h-auto w-full">
        <path d={linePath(pts)} fill="none" stroke="#6A0D2A" strokeWidth={2.5} />
        {pts.map((p, i) => (
          <circle key={points[i]!.label} cx={p.x} cy={p.y} r={3} fill="#C9A45C">
            <title>{`${points[i]!.label}: ${points[i]!.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-ink-muted">
        <span>{points[0]!.label}</span>
        <span>Peak {max}</span>
        <span>{points[points.length - 1]!.label}</span>
      </div>
    </figure>
  );
}
