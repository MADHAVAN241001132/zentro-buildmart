/**
 * Tile quantity calculator. Pure, no framework imports.
 * Dimensions are converted to feet, the internal unit, before area is computed.
 */

export type LengthUnit = 'ft' | 'm' | 'cm' | 'mm';

const FEET_PER_UNIT: Record<LengthUnit, number> = {
  ft: 1,
  m: 3.28084,
  cm: 0.0328084,
  mm: 0.00328084,
};

export interface TileCalculatorInput {
  length: number;
  width: number;
  unit: LengthUnit;
  /** Coverage of one box in square feet, from the product variant. */
  coverageSqftPerBox: number;
  /** Wastage allowance in percent, e.g. 10 for 10%. */
  wastagePercent?: number;
  /** Price per box in paise, optional for cost estimates. */
  pricePerBoxPaise?: number;
}

export interface TileCalculatorResult {
  areaSqft: number;
  areaWithWastageSqft: number;
  boxes: number;
  purchasedSqft: number;
  leftoverSqft: number;
  estimatedCostPaise: number | null;
}

export class TileInputError extends Error {}

export function toFeet(value: number, unit: LengthUnit): number {
  const factor = FEET_PER_UNIT[unit];
  if (factor === undefined) throw new TileInputError(`Unsupported unit: ${unit}`);
  return value * factor;
}

/** Rounds to 4 decimal places to remove floating point noise before ceiling. */
function clean(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function calculateTiles(input: TileCalculatorInput): TileCalculatorResult {
  const { length, width, unit, coverageSqftPerBox } = input;
  const wastage = input.wastagePercent ?? 0;
  if (!(length > 0) || !(width > 0)) throw new TileInputError('Length and width must be positive');
  if (!(coverageSqftPerBox > 0)) throw new TileInputError('Box coverage must be positive');
  if (!(wastage >= 0 && wastage <= 100)) throw new TileInputError('Wastage must be between 0 and 100');

  const lengthFt = toFeet(length, unit);
  const widthFt = toFeet(width, unit);
  const areaSqft = clean(lengthFt * widthFt);
  const areaWithWastageSqft = clean(areaSqft * (1 + wastage / 100));
  const boxes = Math.ceil(clean(areaWithWastageSqft / coverageSqftPerBox));
  const purchasedSqft = clean(boxes * coverageSqftPerBox);
  const leftoverSqft = clean(purchasedSqft - areaSqft);
  const estimatedCostPaise =
    input.pricePerBoxPaise === undefined ? null : boxes * input.pricePerBoxPaise;

  return {
    areaSqft,
    areaWithWastageSqft,
    boxes,
    purchasedSqft,
    leftoverSqft,
    estimatedCostPaise,
  };
}
