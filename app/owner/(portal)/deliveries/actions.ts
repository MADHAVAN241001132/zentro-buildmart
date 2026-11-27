'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { parseRupeesToPaise } from '@/lib/money';
import { friendly } from '@/lib/errors';
import { checkFeature } from '@/lib/services/entitlements';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/pos';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TARGETS = ['assigned', 'out_for_delivery', 'delivered', 'failed'] as const;

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

function back(error?: string): never {
  redirect(error ? `/owner/deliveries?error=${encodeURIComponent(error)}` : '/owner/deliveries');
}

/** Schedules a delivery. The charge is whole rupees; the database refuses it once a payment has started. */
export async function scheduleDeliveryAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('order_management');
  const blocked = await checkFeature(owner.storeId, 'delivery');
  if (blocked) back(blocked);
  const order = uuidSchema.safeParse(text(fd, 'orderId'));
  if (!order.success) back('This order could not be found');
  const date = text(fd, 'scheduledOn');
  if (!DATE.test(date)) back('Choose a delivery date');
  const charge = parseRupeesToPaise(text(fd, 'chargeRupees') || '0');
  if (charge === null || charge < 0) back('Enter the delivery charge in rupees');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('delivery_schedule', {
    p_order: order.data,
    p_scheduled_on: date,
    p_assigned_to: text(fd, 'assignedTo').trim().slice(0, 80) || null,
    p_vehicle: text(fd, 'vehicle').trim().slice(0, 30) || null,
    p_charge_paise: charge,
  });
  if (error) back(friendly(error.message));
  revalidatePath('/owner/deliveries');
  back();
}

/** Moves a delivery to the next stage. The database checks the allowed transitions and the payment rule. */
export async function setDeliveryStatusAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('order_management');
  const blocked = await checkFeature(owner.storeId, 'delivery');
  if (blocked) back(blocked);
  const order = uuidSchema.safeParse(text(fd, 'orderId'));
  const to = text(fd, 'to');
  if (!order.success || !(TARGETS as readonly string[]).includes(to)) back('Choose a valid delivery step');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('delivery_set_status', {
    p_order: order.success ? order.data : '',
    p_to: to,
    p_note: null,
  });
  if (error) back(friendly(error.message));
  revalidatePath('/owner/deliveries');
  back();
}
