'use server';

import { revalidatePath } from 'next/cache';
import { checkFeature } from '@/lib/services/entitlements';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseRupeesToPaise } from '@/lib/money';
import { supplierSchema } from '@/lib/validation/purchasing';
import { issuesToFields } from '@/lib/validation/owner';
import { friendly } from '@/lib/errors';

export interface SupplierState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

function readSupplier(fd: FormData) {
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  return supplierSchema.safeParse({
    name: get('name'),
    contactPerson: get('contactPerson'),
    phone: get('phone'),
    email: get('email'),
    gstin: get('gstin'),
    address: get('address'),
    paymentTermsDays: get('paymentTermsDays') || '30',
  });
}

export async function createSupplierAction(_prev: SupplierState, fd: FormData): Promise<SupplierState> {
  const owner = await requireOwnerPermission('supplier_management');
  const supplierBlocked = await checkFeature(owner.storeId, 'purchase_orders');
  if (supplierBlocked) return { ok: false, message: supplierBlocked };
  const parsed = readSupplier(fd);
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('suppliers').insert({
    store_id: owner.storeId,
    name: d.name,
    contact_person: d.contactPerson,
    phone: d.phone,
    email: d.email,
    gstin: d.gstin,
    address: d.address,
    payment_terms_days: d.paymentTermsDays,
    is_active: true,
  });
  if (error) return { ok: false, message: 'Could not create the supplier' };
  revalidatePath('/owner/suppliers');
  return { ok: true, message: 'Supplier created' };
}

export async function updateSupplierAction(id: string, _prev: SupplierState, fd: FormData): Promise<SupplierState> {
  const owner = await requireOwnerPermission('supplier_management');
  const parsed = readSupplier(fd);
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('suppliers')
    .update({
      name: d.name,
      contact_person: d.contactPerson,
      phone: d.phone,
      email: d.email,
      gstin: d.gstin,
      address: d.address,
      payment_terms_days: d.paymentTermsDays,
      is_active: fd.get('isActive') === 'on',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('store_id', owner.storeId);
  if (error) return { ok: false, message: 'Could not save the supplier' };
  revalidatePath(`/owner/suppliers/${id}`);
  revalidatePath('/owner/suppliers');
  return { ok: true, message: 'Supplier saved' };
}

/** Records a supplier invoice through the validated database function. */
export async function recordInvoiceAction(_prev: SupplierState, fd: FormData): Promise<SupplierState> {
  const owner = await requireOwnerPermission('supplier_management');
  const supplierId = String(fd.get('supplierId') ?? '');
  const amount = parseRupeesToPaise(String(fd.get('amountRupees') ?? ''));
  const number = String(fd.get('invoiceNumber') ?? '').trim();
  const date = String(fd.get('invoiceDate') ?? '');
  if (amount === null || amount <= 0) return { ok: false, message: 'Enter the invoice amount in rupees', fieldErrors: { amountRupees: 'Enter a positive amount' } };
  if (number.length < 1) return { ok: false, message: 'Enter the invoice number', fieldErrors: { invoiceNumber: 'Required' } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Enter the invoice date', fieldErrors: { invoiceDate: 'Use a valid date' } };

  const supabase = await createSupabaseServerClient();
  const poId = String(fd.get('purchaseOrderId') ?? '') || null;
  const { error } = await supabase.rpc('record_supplier_invoice', {
    p_supplier: supplierId,
    p_po: poId,
    p_invoice_number: number,
    p_invoice_date: date,
    p_amount: amount,
  });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath(`/owner/suppliers/${supplierId}`);
  return { ok: true, message: 'Invoice recorded' };
}

export async function recordPaymentAction(_prev: SupplierState, fd: FormData): Promise<SupplierState> {
  const owner = await requireOwnerPermission('supplier_management');
  const supplierId = String(fd.get('supplierId') ?? '');
  const amount = parseRupeesToPaise(String(fd.get('amountRupees') ?? ''));
  const method = String(fd.get('method') ?? '');
  const reference = String(fd.get('reference') ?? '').trim().slice(0, 120);
  if (amount === null || amount <= 0) return { ok: false, message: 'Enter the payment amount in rupees', fieldErrors: { amountRupees: 'Enter a positive amount' } };
  if (!['cash', 'bank', 'upi', 'cheque'].includes(method)) return { ok: false, message: 'Choose a payment method' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('record_supplier_payment', {
    p_supplier: supplierId,
    p_invoice: null,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    p_paid_on: new Date().toISOString().slice(0, 10),
  });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath(`/owner/suppliers/${supplierId}`);
  return { ok: true, message: 'Payment recorded' };
}
