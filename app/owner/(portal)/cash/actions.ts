'use server';

import { revalidatePath } from 'next/cache';
import { cashConfirmSchema, firstIssue } from '@/lib/validation';
import { parseRupeesToPaise } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface CashActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Confirms cash received at the counter. The signed-in owner is the actor: the database function
 * takes it from the JWT (auth.uid()), checks store membership, checks the amount against the
 * amount due, and deducts stock exactly once. The cash confirmation permission is required here and by the database.
 */
export async function confirmCashAction(_prev: CashActionState, formData: FormData): Promise<CashActionState> {
  const owner = await requireOwnerPermission('cash_confirmation');

  const parsed = cashConfirmSchema.safeParse({
    orderId: formData.get('orderId'),
    amountReceived: formData.get('amountReceived'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { ok: false, message: 'Check the amount and try again', fieldErrors: firstIssue(parsed.error) };
  const amountPaise = parseRupeesToPaise(parsed.data.amountReceived);
  if (amountPaise === null || amountPaise <= 0) {
    return { ok: false, message: 'Enter the amount in rupees, for example 1250.50', fieldErrors: { amountReceived: 'Enter a valid amount' } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('confirm_cash_payment', {
    p_order: parsed.data.orderId,
    p_amount_received_paise: amountPaise,
    p_note: parsed.data.note,
    p_actor: undefined,
  });
  if (error) {
    const message = error.message.includes('does not match')
      ? 'The amount received does not match the amount due'
      : error.message.includes('no pending cash')
        ? 'This order is no longer waiting for cash'
        : 'Could not confirm this payment. Refresh and try again.';
    return { ok: false, message };
  }
  revalidatePath('/owner/cash');
  revalidatePath('/owner');
  revalidatePath('/owner/orders');
  return { ok: true, message: 'Cash confirmed. Stock has been deducted for this order.' };
}
