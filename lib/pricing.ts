/**
 * Cart and order pricing. Pure functions, integer paise, BigInt arithmetic.
 *
 * Invariants relied on by the database (orders_total_check):
 *   total = subtotal - discount + tax + delivery
 *   discount <= subtotal
 * GST is computed per line on the discounted taxable value, so the sum of line tax
 * equals the order tax exactly.
 */
import { gstOn } from './money';
import { lineAmounts } from './gst/policy';

export interface PricingLineInput {
  /** Stable identifier, e.g. the variant id. */
  key: string;
  unitPricePaise: number;
  quantity: number;
  /** GST rate in basis points, 1800 = 18%. */
  gstRateBps: number;
}

export interface PricedLine {
  key: string;
  quantity: number;
  unitPricePaise: number;
  lineSubtotalPaise: number;
  lineDiscountPaise: number;
  lineTaxablePaise: number;
  gstRateBps: number;
  lineTaxPaise: number;
  lineTotalPaise: number;
}

export interface OrderTotals {
  lines: PricedLine[];
  /** Tax-exclusive ledger figures (see the policy in migration 0060). */
  subtotalPaise: number;
  discountPaise: number;
  /** Customer-paid gross figures; the coupon is calculated on these. */
  grossSubtotalPaise: number;
  grossDiscountPaise: number;
  taxPaise: number;
  deliveryPaise: number;
  totalPaise: number;
}

export interface PricingOptions {
  /** Order-level discount in paise, already validated against the coupon rules. */
  discountPaise?: number;
  /**
   * Per-line share of the order discount, in the same order as the lines. Guest carts pass the share computed by
   * the database (guest_cart_coupon_quote), which uses the same rule as POS bills. Must add up to discountPaise.
   * When omitted, the discount is split proportionally here.
   */
  lineDiscountsPaise?: number[];
  deliveryPaise?: number;
  /**
   * False for stores that may not collect GST (composition or unregistered, see lib/gst/policy.ts): every line tax
   * is zero. Defaults to true.
   */
  taxCollected?: boolean;
  /**
   * True when the configured prices include GST (prices_include_gst). Applies only where tax is collected.
   * Discounts are taken from the gross price first; GST is then extracted from what remains (lib/gst/policy.ts).
   */
  inclusive?: boolean;
}

export class PricingError extends Error {}

/**
 * Splits `amount` across `weights` so the parts sum exactly to `amount`.
 * Uses the largest-remainder method; ties go to the earlier index.
 */
export function allocateProportionally(amount: bigint, weights: bigint[]): bigint[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0n);
  if (totalWeight === 0n) return weights.map(() => 0n);
  const floors = weights.map((w) => (amount * w) / totalWeight);
  let remainder = amount - floors.reduce((sum, v) => sum + v, 0n);
  const order = weights
    .map((w, index) => ({ index, rem: (amount * w) % totalWeight }))
    .sort((a, b) => (a.rem === b.rem ? a.index - b.index : a.rem > b.rem ? -1 : 1));
  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0n) break;
    result[index] = (result[index] ?? 0n) + 1n;
    remainder -= 1n;
  }
  return result;
}

export function priceCart(lines: PricingLineInput[], options: PricingOptions = {}): OrderTotals {
  if (lines.length === 0) throw new PricingError('Cart is empty');
  const discount = BigInt(options.discountPaise ?? 0);
  const delivery = BigInt(options.deliveryPaise ?? 0);
  if (discount < 0n || delivery < 0n) throw new PricingError('Negative amounts are not allowed');

  const subtotals = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new PricingError(`Invalid quantity for ${line.key}`);
    }
    if (!Number.isInteger(line.unitPricePaise) || line.unitPricePaise < 0) {
      throw new PricingError(`Invalid price for ${line.key}`);
    }
    return BigInt(line.unitPricePaise) * BigInt(line.quantity);
  });
  const subtotal = subtotals.reduce((sum, v) => sum + v, 0n);
  if (discount > subtotal) throw new PricingError('Discount exceeds subtotal');

  let discounts: bigint[];
  if (options.lineDiscountsPaise) {
    if (options.lineDiscountsPaise.length !== lines.length) {
      throw new PricingError('Line discounts do not match the lines');
    }
    discounts = options.lineDiscountsPaise.map((value) => {
      if (!Number.isInteger(value) || value < 0) throw new PricingError('Invalid line discount');
      return BigInt(value);
    });
    const sumOfLines = discounts.reduce((sum, v) => sum + v, 0n);
    if (sumOfLines !== discount) throw new PricingError('Line discounts do not add up to the order discount');
    discounts.forEach((value, index) => {
      if (value > (subtotals[index] ?? 0n)) throw new PricingError('Line discount is larger than the line amount');
    });
  } else {
    discounts = allocateProportionally(discount, subtotals);
  }

  const collect = options.taxCollected ?? true;
  const inclusive = (options.inclusive ?? false) && collect;
  let ledgerSubtotal = 0n;
  let ledgerDiscount = 0n;
  let tax = 0n;
  let payable = 0n;
  const priced: PricedLine[] = lines.map((line, index) => {
    const grossBefore = subtotals[index] ?? 0n;
    const grossDiscount = discounts[index] ?? 0n;
    // Tax-exclusive ledger basis: the taxable value before discount, and the discount on that same basis.
    const taxableBefore = lineAmounts(grossBefore, line.gstRateBps, { inclusive, collect }).taxablePaise;
    // The amounts the customer pays for this line: discount first, then the tax treatment of what remains.
    const after = lineAmounts(grossBefore - grossDiscount, line.gstRateBps, { inclusive, collect });
    const ledgerLineDiscount = taxableBefore - after.taxablePaise;
    ledgerSubtotal += taxableBefore;
    ledgerDiscount += ledgerLineDiscount;
    tax += after.taxPaise;
    payable += after.totalPaise;
    return {
      key: line.key,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      lineSubtotalPaise: Number(taxableBefore),
      lineDiscountPaise: Number(ledgerLineDiscount),
      lineTaxablePaise: Number(after.taxablePaise),
      gstRateBps: line.gstRateBps,
      lineTaxPaise: Number(after.taxPaise),
      lineTotalPaise: Number(after.totalPaise),
    };
  });

  const total = payable + delivery;
  return {
    lines: priced,
    subtotalPaise: Number(ledgerSubtotal),
    discountPaise: Number(ledgerDiscount),
    grossSubtotalPaise: Number(subtotal),
    grossDiscountPaise: Number(discount),
    taxPaise: Number(tax),
    deliveryPaise: Number(delivery),
    totalPaise: Number(total),
  };
}
