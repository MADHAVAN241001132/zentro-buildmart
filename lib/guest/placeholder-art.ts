/**
 * Chooses a local demonstration illustration for a product category when the product has no
 * uploaded photograph. Files live in public/placeholders and are labelled as placeholders inside
 * the artwork itself. Uploaded product photographs always take precedence over this fallback.
 */
const RULES: Array<{ file: string; keywords: string[] }> = [
  { file: 'bathroom-tiles', keywords: ['bathroom tile', 'bath tile', 'mosaic'] },
  { file: 'wall-tiles', keywords: ['wall tile', 'wall'] },
  { file: 'floor-tiles', keywords: ['floor tile', 'floor', 'vitrified', 'tile'] },
  { file: 'steel-doors', keywords: ['door', 'steel door', 'frame'] },
  { file: 'taps', keywords: ['tap', 'faucet', 'mixer', 'shower'] },
  { file: 'wash-basins', keywords: ['basin', 'wash basin', 'washbasin', 'sink'] },
  { file: 'sanitaryware', keywords: ['toilet', 'sanitary', 'commode', 'wc', 'urinal', 'cistern'] },
  { file: 'kitchen-fittings', keywords: ['kitchen', 'chimney', 'hob', 'cabinet'] },
  { file: 'bathroom-accessories', keywords: ['accessor', 'towel', 'soap', 'rail', 'bathroom'] },
  { file: 'construction-accessories', keywords: ['construction', 'cement', 'adhesive', 'grout', 'paint', 'hardware', 'fixing'] },
];

const DEFAULT_FILE = 'product-placeholder';

/** Returns the public path of the demonstration illustration for a category name. */
export function placeholderArtPath(categoryName: string | null | undefined): string {
  const name = (categoryName ?? '').toLowerCase();
  if (name) {
    for (const rule of RULES) {
      if (rule.keywords.some((keyword) => name.includes(keyword))) {
        return `/placeholders/${rule.file}.svg`;
      }
    }
  }
  return `/placeholders/${DEFAULT_FILE}.svg`;
}
