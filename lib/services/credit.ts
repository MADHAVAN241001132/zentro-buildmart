/**
 * Credit-ledger arithmetic. Payments and negative adjustments settle the oldest open sales first.
 * Positive adjustments are treated as additional amounts owed with no due date.
 * Amounts are integer paise. The database enforces the same rules; this module is for display.
 */

export type LedgerEntryType = 'sale' | 'payment' | 'adjustment';

export interface LedgerRow {
  id: string;
  entryType: LedgerEntryType;
  amountPaise: number; // signed: + owed, - settled
  dueOn: string | null; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
  note: string | null;
}

export interface OpenItem {
  id: string;
  remainingPaise: number;
  dueOn: string | null;
  createdAt: string;
  note: string | null;
}

export interface CreditSummary {
  balancePaise: number;
  overduePaise: number;
  nextDueOn: string | null;
  openItems: OpenItem[];
}

/** Open items after applying every settlement to the oldest items first. */
export function openItems(rows: LedgerRow[]): OpenItem[] {
  const chronological = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const items: OpenItem[] = [];

  for (const row of chronological) {
    if (row.amountPaise > 0) {
      items.push({ id: row.id, remainingPaise: row.amountPaise, dueOn: row.dueOn, createdAt: row.createdAt, note: row.note });
    } else if (row.amountPaise < 0) {
      let toApply = -row.amountPaise;
      for (const item of items) {
        if (toApply === 0) break;
        const take = Math.min(item.remainingPaise, toApply);
        item.remainingPaise -= take;
        toApply -= take;
      }
    }
  }
  return items.filter((i) => i.remainingPaise > 0);
}

export function summarise(rows: LedgerRow[], today: string): CreditSummary {
  const balancePaise = rows.reduce((n, r) => n + r.amountPaise, 0);
  const open = openItems(rows);
  const overduePaise = open.filter((i) => i.dueOn !== null && i.dueOn < today).reduce((n, i) => n + i.remainingPaise, 0);
  const nextDueOn = open
    .filter((i) => i.dueOn !== null && i.dueOn >= today)
    .map((i) => i.dueOn as string)
    .sort()[0] ?? null;
  return { balancePaise, overduePaise, nextDueOn, openItems: open };
}

/** Running balance for a statement, in chronological order. */
export function withRunningBalance(rows: LedgerRow[]): (LedgerRow & { runningPaise: number })[] {
  const chronological = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  let running = 0;
  return chronological.map((r) => {
    running += r.amountPaise;
    return { ...r, runningPaise: running };
  });
}
