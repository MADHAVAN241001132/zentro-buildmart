/** Catalogue constants and the slug helper. No dependencies, so pure modules and tests can import them. */

export const UNITS = ['piece', 'box', 'sqft', 'sqm', 'set', 'kg', 'metre'] as const;
export const GST_RATES_BPS = [0, 500, 1200, 1800, 2800] as const;

/** URL-safe slug from a name. Used when the owner leaves the slug blank. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
