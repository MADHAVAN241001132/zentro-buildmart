/**
 * Parses the cart lines the visualizer posts. The input comes from the browser, so every field is checked here
 * before any cart call. Quantities for the same variant are combined, capped at the cart limit.
 */
export const VISUALIZER_MAX_LINES = 12;
export const VISUALIZER_MAX_QTY = 999;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VisualizerLine {
  variantId: string;
  quantity: number;
}

export function parseVisualizerLines(raw: string): VisualizerLine[] | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > VISUALIZER_MAX_LINES) return null;
  const totals = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const { variantId, quantity } = item as { variantId?: unknown; quantity?: unknown };
    if (typeof variantId !== 'string' || !UUID.test(variantId)) return null;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > VISUALIZER_MAX_QTY) return null;
    const key = variantId.toLowerCase();
    totals.set(key, Math.min(VISUALIZER_MAX_QTY, (totals.get(key) ?? 0) + quantity));
  }
  return [...totals.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}
