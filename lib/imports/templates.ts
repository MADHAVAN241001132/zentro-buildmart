/**
 * Import templates. The same headers, sample rows and instructions produce both the CSV and the Excel file,
 * so the two formats cannot drift apart.
 */
import type { Cell } from '@/lib/exports/xlsx';
import { CATALOGUE_COLUMNS, PRICE_COLUMNS } from './catalogue-rules';

export const CATALOGUE_INSTRUCTIONS: string[] = [
  'ZENTRO BuildMart catalogue import',
  '',
  'The three sample rows show the format. Replace them with your own products before importing, because their category and brand names will not exist in a new store.',
  'One row is one variant (one size, finish or colour). Rows that share a Product SKU are one product.',
  'Product SKU: your product code. Variant SKU: unique across the whole store. Both are case-sensitive.',
  'Product name, Category, Measurement unit, GST rate and Product status are required on the first row of each product.',
  'On later rows of the same product, leave the product cells blank, or repeat them exactly.',
  'Category and Brand must match a name already in your store. Create them first on the Categories and Brands pages.',
  'Measurement unit: piece, box, sqft, sqm, set, kg or metre.',
  'GST rate: 0, 5, 12, 18 or 28 (percent).',
  'Prices are in rupees, for example 640 or 640.50. Do not add negative values.',
  'Cost price and MRP are optional. MRP cannot be lower than the selling price.',
  'Opening stock applies only to new variants. Reorder level is optional and must be zero or more.',
  'Product status: active or archived. Leave blank for active.',
  'Do not start any cell with =, +, @ or a tab. Remove the character if your data has one.',
  'Upload a .xlsx or .csv file of up to 2 MB and 1,000 rows. Preview the import before you confirm it.',
  'Rows with errors are listed with their reasons and are not imported. Fix them and upload again if needed.',
];

export const PRICE_INSTRUCTIONS: string[] = [
  'ZENTRO BuildMart price update',
  '',
  'The sample rows show the format. Replace them with variant SKUs from your store before uploading.',
  'Variant SKU must match an existing variant in your store exactly.',
  'Selling price is required, in rupees (for example 640 or 640.50).',
  'Cost price and MRP are optional. A blank cell keeps the current value.',
  'MRP cannot be lower than the selling price. An MRP cannot be removed by this import.',
  'Upload a .xlsx or .csv file of up to 2 MB and 1,000 rows. Preview the update before you confirm it.',
];

const CATALOGUE_SAMPLES: Cell[][] = [
  ['TILE-MAT-600', 'Matt Vitrified Floor Tile', '600 x 600 mm matt finish floor tile', 'Floor tiles', 'Sample Brand', 'TILE-MAT-600-WHT', 'White', '600 x 600 mm', 'Vitrified', 'box', 520, 640, 720, 18, 50, 10, 'active'],
  ['TILE-MAT-600', '', '', '', '', 'TILE-MAT-600-GRY', 'Grey', '600 x 600 mm', '', '', 520, 640, 720, '', 30, 10, ''],
  ['SAN-CP-01', 'Chrome Basin Mixer', 'Single lever basin mixer with aerator', 'Sanitaryware', '', 'SAN-CP-01-STD', 'Standard', '', 'Brass', 'piece', 1450, 2100, '', 18, 12, 4, 'active'],
];

const PRICE_SAMPLES: Cell[][] = [
  ['TILE-MAT-600-WHT', 655, 520, 720],
  ['SAN-CP-01-STD', 2150, '', ''],
];

function headersOf(columns: readonly { header: string }[]): Cell[] {
  return columns.map((c) => c.header);
}

export function catalogueTemplateRows(): Cell[][] {
  return [headersOf(CATALOGUE_COLUMNS), ...CATALOGUE_SAMPLES];
}

export function priceTemplateRows(): Cell[][] {
  return [headersOf(PRICE_COLUMNS), ...PRICE_SAMPLES];
}

export function instructionRows(lines: string[]): Cell[][] {
  return lines.map((line) => [line]);
}
