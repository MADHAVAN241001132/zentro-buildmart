/**
 * Geometry for report charts, rendered as inline SVG by the server. Pure functions, unit tested.
 * Values are paise (or units). Empty or all-zero series produce a flat baseline, never NaN.
 */

export interface Point {
  x: number;
  y: number;
}

export function linePoints(values: number[], width: number, height: number, padding = 8): { points: Point[]; max: number } {
  const max = Math.max(0, ...values);
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: round(padding + index * step),
    y: round(padding + innerH - (max === 0 ? 0 : (value / max) * innerH)),
  }));
  return { points, max };
}

export function linePath(points: Point[]): string {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

export function barHeights(values: number[], height: number): number[] {
  const max = Math.max(0, ...values);
  return values.map((value) => (max === 0 ? 0 : round((value / max) * height)));
}

export interface Slice {
  label: string;
  value: number;
  /** Share of the whole, 0 to 1. */
  share: number;
  path: string;
}

/** Donut segments as SVG paths around (cx, cy). Zero-only inputs return no slices. */
export function donutSlices(parts: { label: string; value: number }[], cx: number, cy: number, outer: number, inner: number): Slice[] {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (total === 0) return [];
  let angle = -Math.PI / 2;
  return parts.map((part) => {
    const value = Math.max(0, part.value);
    const share = value / total;
    const sweep = share * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const large = sweep > Math.PI ? 1 : 0;
    const path = share >= 1
      ? `M${cx} ${cy - outer} A${outer} ${outer} 0 1 1 ${cx - 0.01} ${cy - outer} Z M${cx} ${cy - inner} A${inner} ${inner} 0 1 0 ${cx - 0.01} ${cy - inner} Z`
      : [
          `M${round(cx + outer * Math.cos(start))} ${round(cy + outer * Math.sin(start))}`,
          `A${outer} ${outer} 0 ${large} 1 ${round(cx + outer * Math.cos(end))} ${round(cy + outer * Math.sin(end))}`,
          `L${round(cx + inner * Math.cos(end))} ${round(cy + inner * Math.sin(end))}`,
          `A${inner} ${inner} 0 ${large} 0 ${round(cx + inner * Math.cos(start))} ${round(cy + inner * Math.sin(start))}`,
          'Z',
        ].join(' ');
    return { label: part.label, value, share, path };
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
