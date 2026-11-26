/**
 * Pure invoice arithmetic. No I/O, so it can be unit tested without a database or PDF library.
 * Every value is integer paise. Rounding is exact: the rate split below is computed from integers and
 * the sums are checked against the stored order totals before any invoice is printed.
 */

export interface InvoiceLineFigures {
  quantity: number;
  unitPricePaise: number;
  discountPaise: number;
  gstRateBps: number;
  taxablePaise: number;
  taxPaise: number;
  lineTotalPaise: number;
}

export interface InvoiceTotalFigures {
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  deliveryPaise: number;
  totalPaise: number;
}

export interface GstRateRow {
  rateBps: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
}

/**
 * Returns a list of problems. An empty list means the stored figures agree with each other.
 * The rules follow the database invariants (orders_total_check) and lib/pricing.ts.
 */
export function reconcileInvoiceFigures(lines: InvoiceLineFigures[], totals: InvoiceTotalFigures): string[] {
  const problems: string[] = [];
  const sum = (pick: (line: InvoiceLineFigures) => number) => lines.reduce((acc, line) => acc + pick(line), 0);

  if (lines.length === 0) problems.push('The invoice has no lines.');

  const lineSubtotal = sum((line) => Math.round(line.quantity * line.unitPricePaise));
  if (lineSubtotal !== totals.subtotalPaise) {
    problems.push('Line amounts do not add up to the subtotal.');
  }
  if (sum((line) => line.discountPaise) !== totals.discountPaise) {
    problems.push('Line discounts do not add up to the order discount.');
  }
  if (sum((line) => line.taxablePaise) !== totals.taxablePaise) {
    problems.push('Line taxable values do not add up to the taxable amount.');
  }
  if (sum((line) => line.taxPaise) !== totals.taxPaise) {
    problems.push('Line GST does not add up to the GST total.');
  }
  if (sum((line) => line.lineTotalPaise) !== totals.taxablePaise + totals.taxPaise) {
    problems.push('Line totals do not equal taxable value plus GST.');
  }
  if (totals.taxablePaise !== totals.subtotalPaise - totals.discountPaise) {
    problems.push('Taxable amount is not the subtotal less the discount.');
  }
  if (totals.totalPaise !== totals.subtotalPaise - totals.discountPaise + totals.taxPaise + totals.deliveryPaise) {
    problems.push('Payable total does not equal subtotal less discount, plus GST and delivery.');
  }
  return problems;
}

/**
 * GST grouped by rate. Within a state (intra-state supply) GST is shown as CGST and SGST, each half of the rate.
 * CGST is rounded down and SGST takes the remaining paisa, so the two always add up to the row's tax.
 */
export function gstBreakdownByRate(lines: InvoiceLineFigures[]): GstRateRow[] {
  const rows = new Map<number, { taxablePaise: number; taxPaise: number }>();
  for (const line of lines) {
    const row = rows.get(line.gstRateBps) ?? { taxablePaise: 0, taxPaise: 0 };
    row.taxablePaise += line.taxablePaise;
    row.taxPaise += line.taxPaise;
    rows.set(line.gstRateBps, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBps, row]) => {
      const cgstPaise = Math.floor(row.taxPaise / 2);
      return {
        rateBps,
        taxablePaise: row.taxablePaise,
        taxPaise: row.taxPaise,
        cgstPaise,
        sgstPaise: row.taxPaise - cgstPaise,
      };
    });
}

/** Indian digit grouping for paise, with no currency symbol: 1234567 -> "12,345.67". Safe for WinAnsi PDF text. */
export function formatPlainInr(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError('Amount must be a safe integer of paise');
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${sign}${grouped}.${String(remainder).padStart(2, '0')}`;
}

/** Quantity with up to three decimals and no trailing zeros, e.g. 12.5 -> "12.5", 3 -> "3". */
export function formatQuantity(quantity: number): string {
  return String(Number(quantity.toFixed(3)));
}

/** GST rate in basis points as a percentage label: 1800 -> "18%", 1250 -> "12.5%". */
export function formatGstRate(rateBps: number): string {
  return `${Number((rateBps / 100).toFixed(2))}%`;
}
