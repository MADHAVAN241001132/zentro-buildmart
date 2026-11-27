'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkFeature } from '@/lib/services/entitlements';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseRupeesToPaise } from '@/lib/money';
import { friendly } from '@/lib/errors';
import { issuesToFields } from '@/lib/validation/owner';

export interface CustomerState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const customerSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the customer name').max(120),
  mobile: z.string().trim().regex(/^([0-9]{10})?$/, 'Mobile must be 10 digits').transform((v) => v || null),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).transform((v) => v || null),
  gstin: z.string().trim().toUpperCase().refine((v) => v === '' || /^[0-9A-Z]{15}$/.test(v), 'GSTIN must be 15 characters').transform((v) => v || null),
});

function readCustomer(fd: FormData) {
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  return { parsed: customerSchema.safeParse({ fullName: get('fullName'), mobile: get('mobile'), email: get('email'), gstin: get('gstin') }), limitText: get('creditLimitRupees') || '0', approved: fd.get('isCreditApproved') === 'on' };
}

export async function createCustomerAction(_prev: CustomerState, fd: FormData): Promise<CustomerState> {
  const owner = await requireOwnerPermission('customer_management');
  const { parsed, limitText, approved } = readCustomer(fd);
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const limit = parseRupeesToPaise(limitText);
  if (limit === null) return { ok: false, message: 'Enter the credit limit in rupees', fieldErrors: { creditLimitRupees: 'Enter a valid amount' } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('customers').insert({
    store_id: owner.storeId,
    full_name: parsed.data.fullName,
    mobile: parsed.data.mobile,
    email: parsed.data.email,
    gstin: parsed.data.gstin,
    is_credit_approved: approved,
    credit_limit_paise: limit,
  });
  if (error) return { ok: false, message: error.code === '23514' ? 'Check the mobile number format' : 'Could not create the customer' };
  revalidatePath('/owner/customers');
  return { ok: true, message: 'Customer created' };
}

export async function updateCustomerAction(id: string, _prev: CustomerState, fd: FormData): Promise<CustomerState> {
  const owner = await requireOwnerPermission('customer_management');
  const { parsed, limitText, approved } = readCustomer(fd);
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const limit = parseRupeesToPaise(limitText);
  if (limit === null) return { ok: false, message: 'Enter the credit limit in rupees', fieldErrors: { creditLimitRupees: 'Enter a valid amount' } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('customers')
    .update({
      full_name: parsed.data.fullName,
      mobile: parsed.data.mobile,
      email: parsed.data.email,
      gstin: parsed.data.gstin,
      is_credit_approved: approved,
      credit_limit_paise: limit,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('store_id', owner.storeId);
  if (error) return { ok: false, message: 'Could not save the customer' };
  revalidatePath(`/owner/customers/${id}`);
  return { ok: true, message: 'Customer saved' };
}

/**
 * Records a credit sale, a payment, or an adjustment. The database checks approval, the credit limit,
 * and that a payment does not exceed the outstanding balance. Adjustments may be negative (a credit note).
 */
export async function recordCreditEntryAction(_prev: CustomerState, fd: FormData): Promise<CustomerState> {
  const owner = await requireOwnerPermission('credit_management');
  const blocked = await checkFeature(owner.storeId, 'credit_ledger');
  if (blocked) return { ok: false, message: blocked };
  const customerId = String(fd.get('customerId') ?? '');
  const type = String(fd.get('entryType') ?? '');
  const amountText = String(fd.get('amountRupees') ?? '').trim();
  const dueOn = String(fd.get('dueOn') ?? '');
  const note = String(fd.get('note') ?? '').trim().slice(0, 200) || null;
  if (!['sale', 'payment', 'adjustment'].includes(type)) return { ok: false, message: 'Choose an entry type' };

  const negative = amountText.startsWith('-');
  if (negative && type !== 'adjustment') return { ok: false, message: 'Only adjustments can be negative', fieldErrors: { amountRupees: 'Enter a positive amount' } };
  const magnitude = parseRupeesToPaise(negative ? amountText.slice(1) : amountText);
  if (magnitude === null || magnitude <= 0) return { ok: false, message: 'Enter the amount in rupees', fieldErrors: { amountRupees: 'Enter a positive amount' } };
  if (type === 'sale' && dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { ok: false, message: 'Enter a valid due date', fieldErrors: { dueOn: 'Use a valid date' } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('record_credit_entry', {
    p_customer: customerId,
    p_entry_type: type,
    p_amount_paise: negative ? -magnitude : magnitude,
    p_due_on: type === 'sale' && dueOn ? dueOn : null,
    p_note: note,
  });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath(`/owner/customers/${customerId}`);
  revalidatePath('/owner/customers');
  return { ok: true, message: 'Credit entry recorded' };
}
