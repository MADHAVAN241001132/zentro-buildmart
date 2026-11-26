'use server';

import { revalidatePath } from 'next/cache';
import { parseRupeesToPaise } from '@/lib/money';
import { friendly } from '@/lib/errors';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface CashCloseState {
  ok: boolean;
  message?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

/** Closes one business day. The database computes the expected cash; this only passes the counted amounts. */
export async function closeCashDayAction(_prev: CashCloseState, fd: FormData): Promise<CashCloseState> {
  const owner = await requireOwnerPermission('cash_confirmation');

  const date = text(fd, 'date');
  if (!DATE.test(date)) return { ok: false, message: 'Choose a valid business date' };

  const actual = parseRupeesToPaise(text(fd, 'countedRupees'));
  if (actual === null || actual < 0) return { ok: false, message: 'Enter the counted cash in rupees' };
  const openingText = text(fd, 'openingRupees').trim();
  let opening: number | null = null;
  if (openingText !== '') {
    opening = parseRupeesToPaise(openingText);
    if (opening === null || opening < 0) return { ok: false, message: 'Enter the opening cash in rupees' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('close_cash_day', {
    p_store: owner.storeId,
    p_date: date,
    p_opening_paise: opening,
    p_actual_paise: actual,
    p_actor: null,
  });
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath('/owner/cash/day');
  const result = data as { expected_paise: number; difference_paise: number };
  const difference = Number(result.difference_paise);
  const verdict = difference === 0 ? 'The count matches the expected cash.' : difference > 0 ? 'The count is over expected.' : 'The count is short of expected.';
  return { ok: true, message: `Day closed. Expected cash was ${result.expected_paise} paise. ${verdict}` };
}

// Not exported: a 'use server' module may export only async functions and types.
const CASH_MOVEMENT_TYPES = ['deposit', 'withdrawal', 'manual_in', 'manual_out'] as const;

/**
 * Records cash that leaves or enters the drawer outside sales and refunds today.
 * The database refuses a closed day, and caps outflows at the expected cash when the opening is known.
 */
export async function recordCashMovementAction(_prev: CashCloseState, fd: FormData): Promise<CashCloseState> {
  const owner = await requireOwnerPermission('cash_confirmation');

  const type = text(fd, 'type');
  if (!(CASH_MOVEMENT_TYPES as readonly string[]).includes(type)) return { ok: false, message: 'Choose a movement type' };

  const amount = parseRupeesToPaise(text(fd, 'amountRupees'));
  if (amount === null || amount <= 0) return { ok: false, message: 'Enter an amount greater than zero' };

  const reason = text(fd, 'reason').trim();
  if (reason.length < 3 || reason.length > 200) return { ok: false, message: 'Describe the movement in 3 to 200 characters' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('record_cash_movement', {
    p_store: owner.storeId,
    p_type: type,
    p_amount_paise: amount,
    p_reason: reason,
    p_actor: null,
  });
  if (error) return { ok: false, message: friendly(error.message) };

  revalidatePath('/owner/cash/day');
  return { ok: true, message: 'Movement recorded for today.' };
}
