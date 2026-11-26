import { gstOn } from '@/lib/money';

/**
 * Pure budget arithmetic for the House Project Planner. Everything is integer paise.
 * These are estimates from the current catalogue prices. They are not confirmed order prices.
 */

export const PLANNER_MAX_QUANTITY = 999; // Matches the cart line limit so every planned line can be bought.
/** Share of the budget at which the planner shows a near-limit warning. */
export const NEAR_BUDGET_PERCENT = 85;

export interface PlannerBudgetLine {
  key: string;
  /** Null when the line belongs to the whole project rather than one room. */
  roomId: string | null;
  unitPricePaise: number;
  quantity: number;
  gstRateBps: number;
}

export interface PlannerLineEstimate {
  key: string;
  roomId: string | null;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
}

export type BudgetStatus = 'no_budget' | 'within' | 'near' | 'exceeded';

export interface PlannerBudgetSummary {
  lines: PlannerLineEstimate[];
  /** Keyed by room id; project-level lines are keyed by the empty string. */
  roomTotalsPaise: Record<string, number>;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
  budgetPaise: number | null;
  /** Budget minus estimate; negative when exceeded. Null when no budget is set. */
  remainingPaise: number | null;
  /** Estimate as a whole percentage of the budget, rounded down. Null when no budget is set. */
  utilisationPercent: number | null;
  status: BudgetStatus;
}

function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Quantity must be a whole number between 1 and the planner maximum. */
export function validPlannerQuantity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  if (value < 1 || value > PLANNER_MAX_QUANTITY) return null;
  return value;
}

/** Estimate one line. GST is added on top of the taxable value, as the cart does. */
export function estimateLine(line: PlannerBudgetLine): PlannerLineEstimate {
  if (!isSafeNonNegativeInteger(line.unitPricePaise)) throw new RangeError('unit price must be whole paise');
  if (validPlannerQuantity(line.quantity) === null) throw new RangeError('quantity must be a whole number');
  if (!Number.isSafeInteger(line.gstRateBps) || line.gstRateBps < 0 || line.gstRateBps > 2800) {
    throw new RangeError('GST rate out of range');
  }
  const taxable = BigInt(line.unitPricePaise) * BigInt(line.quantity);
  const gst = gstOn(taxable, line.gstRateBps);
  const total = taxable + gst;
  return {
    key: line.key,
    roomId: line.roomId,
    taxablePaise: Number(taxable),
    gstPaise: Number(gst),
    totalPaise: Number(total),
  };
}

/** Totals for a project. A budget of null means none has been set. */
export function estimateBudget(lines: PlannerBudgetLine[], budgetPaise: number | null): PlannerBudgetSummary {
  if (budgetPaise !== null && !isSafeNonNegativeInteger(budgetPaise)) throw new RangeError('budget must be whole paise');
  const estimates = lines.map(estimateLine);
  const roomTotals: Record<string, number> = {};
  let taxable = 0;
  let gst = 0;
  let total = 0;
  for (const e of estimates) {
    taxable += e.taxablePaise;
    gst += e.gstPaise;
    total += e.totalPaise;
    const roomKey = e.roomId ?? '';
    roomTotals[roomKey] = (roomTotals[roomKey] ?? 0) + e.totalPaise;
  }

  if (budgetPaise === null) {
    return {
      lines: estimates, roomTotalsPaise: roomTotals, taxablePaise: taxable, gstPaise: gst, totalPaise: total,
      budgetPaise: null, remainingPaise: null, utilisationPercent: null, status: 'no_budget',
    };
  }

  const utilisation = budgetPaise === 0 ? (total === 0 ? 0 : Infinity) : Math.floor((total * 100) / budgetPaise);
  let status: BudgetStatus = 'within';
  if (total > budgetPaise) status = 'exceeded';
  else if (budgetPaise > 0 && total * 100 >= budgetPaise * NEAR_BUDGET_PERCENT) status = 'near';

  return {
    lines: estimates,
    roomTotalsPaise: roomTotals,
    taxablePaise: taxable,
    gstPaise: gst,
    totalPaise: total,
    budgetPaise,
    remainingPaise: budgetPaise - total,
    utilisationPercent: Number.isFinite(utilisation) ? utilisation : null,
    status,
  };
}
