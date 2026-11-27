'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { parseRupeesToPaise } from '@/lib/money';
import { clearMediaImage, setMediaImage } from '@/lib/services/media';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { issuesToFields } from '@/lib/validation/owner';
import type { BrandingFormState } from '@/components/admin/store-branding-manager';

export interface SettingsState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const check = (v: FormDataEntryValue | null) => v === 'on';
const txt = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string).trim() : '');

const settingsSchema = z.object({
  orderPrefix: z.string().regex(/^[A-Z]{1,6}$/, 'Use 1 to 6 capital letters'),
  invoicePrefix: z.string().regex(/^[A-Z]{1,6}$/, 'Use 1 to 6 capital letters'),
  reservationMinutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(1440, 'At most 1440 minutes'),
  paymentExpiryMinutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(120, 'At most 120 minutes'),
  defaultLanguage: z.enum(['en', 'ta']),
  notificationEmail: z.string().trim().max(160).optional().transform((v) => v || null).refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email'),
});

/**
 * Saves store settings through the owner's session. RLS (store_settings_owner_update) limits the write
 * to members with the store settings permission. The check runs here and before any write.
 */
export async function saveSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const owner = await requireOwnerPermission('store_settings');
  if (owner.role !== 'owner' && owner.role !== 'manager') return { ok: false, message: 'Only owners and managers can change settings' };

  const parsed = settingsSchema.safeParse({
    orderPrefix: txt(fd, 'orderPrefix').toUpperCase(),
    invoicePrefix: txt(fd, 'invoicePrefix').toUpperCase(),
    reservationMinutes: txt(fd, 'reservationMinutes'),
    paymentExpiryMinutes: txt(fd, 'paymentExpiryMinutes'),
    defaultLanguage: txt(fd, 'defaultLanguage') || 'en',
    notificationEmail: txt(fd, 'notificationEmail'),
  });
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };

  const deliveryPaise = parseRupeesToPaise(txt(fd, 'deliveryChargeRupees') || '0');
  if (deliveryPaise === null) return { ok: false, message: 'Delivery charge must be an amount such as 150.00', fieldErrors: { deliveryChargeRupees: 'Enter a valid amount' } };
  const freeAbove = txt(fd, 'freeDeliveryAboveRupees');
  const freeAbovePaise = freeAbove ? parseRupeesToPaise(freeAbove) : null;
  if (freeAbove && freeAbovePaise === null) return { ok: false, message: 'Free-delivery threshold must be an amount', fieldErrors: { freeDeliveryAboveRupees: 'Enter a valid amount' } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('store_settings')
    .update({
      order_prefix: parsed.data.orderPrefix,
      invoice_prefix: parsed.data.invoicePrefix,
      reservation_minutes: parsed.data.reservationMinutes,
      payment_expiry_minutes: parsed.data.paymentExpiryMinutes,
      default_language: parsed.data.defaultLanguage,
      notification_email: parsed.data.notificationEmail,
      online_payment_enabled: check(fd.get('onlineEnabled')),
      cash_payment_enabled: check(fd.get('cashEnabled')),
      catalogue_visible: check(fd.get('catalogueVisible')),
      delivery_charge_paise: deliveryPaise,
      free_delivery_above_paise: freeAbovePaise,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', owner.storeId);
  if (error) return { ok: false, message: 'Could not save settings. Check the values and try again.' };

  revalidatePath('/owner/settings');
  revalidatePath(`/store/${owner.storeSlug}`);
  return { ok: true, message: 'Settings saved' };
}

const ownerBrandingSchema = z.object({
  name: z.string().trim().min(2, 'Store name must be at least 2 characters').max(120, 'Store name is too long'),
  tagline: z.string().trim().max(160, 'Tagline must be 160 characters or fewer'),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or fewer'),
});

/** Allows authorized store owners/managers to update their store name, tagline, description, logo and banner. */
export async function updateOwnerBrandingAction(
  _prev: BrandingFormState,
  fd: FormData,
): Promise<BrandingFormState> {
  const owner = await requireOwnerPermission('store_settings');
  if (owner.role !== 'owner' && owner.role !== 'manager') {
    return { ok: false, message: 'Only owners and managers can change store branding' };
  }

  const parsed = ownerBrandingSchema.safeParse({
    name: txt(fd, 'name'),
    tagline: txt(fd, 'tagline'),
    description: txt(fd, 'description'),
  });
  if (!parsed.success) {
    return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  }

  const logoEntry = fd.get('logoFile');
  const removeLogo = txt(fd, 'removeLogo') === 'true';
  if (logoEntry instanceof File && logoEntry.size > 0) {
    const res = await setMediaImage(owner.storeId, 'logo', owner.storeId, logoEntry, owner.userId);
    if (!res.ok) return { ok: false, message: res.error };
  } else if (removeLogo) {
    const res = await clearMediaImage(owner.storeId, 'logo', owner.storeId);
    if (!res.ok) return { ok: false, message: res.error };
  }

  const bannerEntry = fd.get('bannerFile');
  const removeBanner = txt(fd, 'removeBanner') === 'true';
  if (bannerEntry instanceof File && bannerEntry.size > 0) {
    const res = await setMediaImage(owner.storeId, 'banner', owner.storeId, bannerEntry, owner.userId);
    if (!res.ok) return { ok: false, message: res.error };
  } else if (removeBanner) {
    const res = await clearMediaImage(owner.storeId, 'banner', owner.storeId);
    if (!res.ok) return { ok: false, message: res.error };
  }

  const adminClient = createSupabaseAdminClient();
  const { data: settings } = await adminClient
    .from('store_settings')
    .select('opening_hours')
    .eq('store_id', owner.storeId)
    .maybeSingle();

  const { error: storeErr } = await adminClient
    .from('stores')
    .update({
      name: parsed.data.name,
      business_description: parsed.data.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', owner.storeId);
  if (storeErr) return { ok: false, message: 'Could not save store branding details' };

  const existingHours = (settings?.opening_hours as Record<string, unknown> | null) ?? {};
  const nextHours = {
    ...existingHours,
    tagline: parsed.data.tagline || null,
  };
  const { error: settingsErr } = await adminClient
    .from('store_settings')
    .update({ opening_hours: nextHours, updated_at: new Date().toISOString() })
    .eq('store_id', owner.storeId);
  if (settingsErr) return { ok: false, message: 'Could not save store tagline' };

  revalidatePath('/owner/settings');
  revalidatePath('/owner', 'layout');
  revalidatePath(`/admin/stores/${owner.storeId}`);
  revalidatePath(`/store/${owner.storeSlug}`, 'layout');
  revalidatePath(`/store/${owner.storeSlug}`, 'page');
  revalidatePath('/', 'layout');

  return { ok: true, message: 'Store branding saved and synced to storefront.' };
}
