/**
 * Money helpers. All stored amounts are integer paise (1 rupee = 100 paise).
 * Arithmetic is integer-only (BigInt). Floating point is used only for display formatting.
 */

const ONE_RUPEE = 100n;

/** Formats paise as Indian rupees with lakh grouping, e.g. 1234567 -> "₹12,345.67". */
export function formatINR(paise: number | bigint): string {
  const value = BigInt(paise);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const rupees = absolute / ONE_RUPEE;
  const remainder = absolute % ONE_RUPEE;
  const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(rupees));
  return `${sign}₹${grouped}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * Parses a rupee string typed by a user ("1234", "1,234.5", "1234.50") into paise.
 * Returns null when the input is not a valid non-negative amount with at most two decimals.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/,/g, '').trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = BigInt(match[1] ?? '0');
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  const paise = whole * ONE_RUPEE + fraction;
  return Number(paise);
}

/** Integer division that rounds half up, for non-negative BigInt values. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  return (numerator + denominator / 2n) / denominator;
}

/** GST amount for a taxable value given a rate in basis points (1800 = 18%). */
export function gstOn(taxablePaise: bigint, rateBps: number): bigint {
  return roundDiv(taxablePaise * BigInt(rateBps), 10000n);
}
