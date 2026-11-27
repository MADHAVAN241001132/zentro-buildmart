'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { clearMediaImage, setMediaImage } from '@/lib/services/media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { adminStoreSchema, STORE_STATUSES } from '@/lib/validation/admin';
import { legalProfileSchema } from '@/lib/validation/legal';
import { issuesToFields } from '@/lib/validation/owner';
import { targetUrl } from '@/lib/qr';
import type { BrandingFormState } from '@/components/admin/store-branding-manager';

export interface StoreFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

function readStoreForm(fd: FormData) {
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  return adminStoreSchema.safeParse({
    name: get('name'),
    slug: get('slug'),
    status: get('status') || 'draft',
    gstin: get('gstin'),
    addressLine: get('addressLine'),
    city: get('city'),
    state: get('state'),
    pincode: get('pincode'),
    phone: get('phone'),
    email: get('email'),
    brandColour: get('brandColour') || '#6A0D2A',
  });
}

/** Creates a store. The stores_bootstrap trigger creates its settings row; this also creates the showroom QR. */
export async function createStoreAction(_prev: StoreFormState, fd: FormData): Promise<StoreFormState> {
  const admin = await requireAdmin();
  const parsed = readStoreForm(fd);
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: store, error } = await supabase
    .from('stores')
    .insert({
      name: d.name,
      slug: d.slug,
      status: d.status,
      gstin: d.gstin,
      address_line: d.addressLine,
      city: d.city,
      state: d.state,
      pincode: d.pincode,
      phone: d.phone,
      email: d.email,
      brand_colour: d.brandColour,
    })
    .select('id, slug')
    .single();
  if (error || !store) {
    const duplicate = error?.code === '23505';
    return { ok: false, message: duplicate ? 'That slug is already in use' : 'Could not create the store' };
  }

  const { error: qrError } = await supabase.from('qr_codes').insert({
    store_id: store.id,
    target_type: 'showroom',
    target_id: null,
    public_url: targetUrl(store.slug as string, { type: 'showroom' }),
    is_active: true,
  });

  await recordAdminAudit({ actorId: admin.userId, storeId: store.id as string, action: 'store.created', entityType: 'store', entityId: store.id as string, after: { slug: d.slug, status: d.status } });
  revalidatePath('/admin/stores');
  if (qrError) redirect(`/admin/stores/${store.id as string}?notice=qr-missing`);
  redirect(`/admin/stores/${store.id as string}`);
}

export async function updateStoreAction(id: string, _prev: StoreFormState, fd: FormData): Promise<StoreFormState> {
  const admin = await requireAdmin();
  const parsed = readStoreForm(fd);
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from('stores')
    .select('name, slug, status, gstin, city, state, pincode, phone, email, legal_name, business_category, business_description, billing_address, gst_registration, prices_include_gst')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { ok: false, message: 'Store not found' };

  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  const legal = legalProfileSchema.safeParse({
    legalName: get('legalName'),
    gstin: get('gstin'),
    businessState: get('state'),
    billingAddress: get('billingAddress'),
    gstRegistration: get('gstRegistration') || 'unregistered',
    pricesIncludeGst: get('pricesIncludeGst') === 'on',
  });
  if (!legal.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(legal.error) };
  const legalFields = {
    legal_name: legal.data.legalName,
    gstin: legal.data.gstin,
    state: legal.data.businessState,
    billing_address: legal.data.billingAddress,
    gst_registration: legal.data.gstRegistration,
    prices_include_gst: legal.data.pricesIncludeGst,
    business_category: get('businessCategory').trim() || null,
    business_description: get('businessDescription').trim() || null,
  };

  const { error } = await supabase
    .from('stores')
    .update({
      name: d.name,
      slug: d.slug,
      status: d.status,
      address_line: d.addressLine,
      city: d.city,
      pincode: d.pincode,
      phone: d.phone,
      email: d.email,
      brand_colour: d.brandColour,
      ...legalFields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false, message: error.code === '23505' ? 'That slug is already in use' : 'Could not save the store' };

  await recordAdminAudit({ actorId: admin.userId, storeId: id, action: 'store.updated', entityType: 'store', entityId: id, before, after: { slug: d.slug, status: d.status, name: d.name, gst_registration: legalFields.gst_registration } });
  revalidatePath(`/admin/stores/${id}`);
  revalidatePath('/admin/stores');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Store saved' };
}

/** Activates, suspends or archives a store. A store can only go active when its showroom QR exists. */
export async function setStoreStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const next = String(formData.get('status') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(STORE_STATUSES as readonly string[]).includes(next)) return;

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('stores').select('status').eq('id', id).maybeSingle();
  if (!before) return;

  if (next === 'active') {
    const { count } = await supabase.from('qr_codes').select('id', { count: 'exact', head: true }).eq('store_id', id).eq('target_type', 'showroom').eq('is_active', true);
    if (!count) return;
  }

  const { error } = await supabase.from('stores').update({ status: next, archived_at: next === 'archived' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return;
  await recordAdminAudit({ actorId: admin.userId, storeId: id, action: 'store.status_changed', entityType: 'store', entityId: id, before: { status: before.status }, after: { status: next } });
  revalidatePath(`/admin/stores/${id}`);
  revalidatePath('/admin/stores');
}

/** Creates the store's showroom QR when it is missing. Required before a store can be activated. */
export async function ensureShowroomQrAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const supabase = await createSupabaseServerClient();
  const { data: store } = await supabase.from('stores').select('slug').eq('id', id).maybeSingle();
  if (!store) return;
  const { count } = await supabase.from('qr_codes').select('id', { count: 'exact', head: true }).eq('store_id', id).eq('target_type', 'showroom');
  if (count && count > 0) return;

  const { error } = await supabase.from('qr_codes').insert({
    store_id: id,
    target_type: 'showroom',
    target_id: null,
    public_url: targetUrl(store.slug as string, { type: 'showroom' }),
    is_active: true,
  });
  if (error) return;
  await recordAdminAudit({ actorId: admin.userId, storeId: id, action: 'qr.showroom_created', entityType: 'qr_code', after: { target_type: 'showroom' } });
  revalidatePath(`/admin/stores/${id}`);
  revalidatePath('/admin/qr');
}

const brandingSchema = z.object({
  name: z.string().trim().min(2, 'Store name must be at least 2 characters').max(120, 'Store name is too long'),
  tagline: z.string().trim().max(160, 'Tagline must be 160 characters or fewer'),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or fewer'),
});

/** Updates store name, tagline, description, logo and storefront banner from Super Admin Manage Store. */
export async function updateStoreBrandingAction(
  id: string,
  _prev: BrandingFormState,
  fd: FormData,
): Promise<BrandingFormState> {
  const admin = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: 'Invalid store ID' };

  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  const parsed = brandingSchema.safeParse({
    name: get('name'),
    tagline: get('tagline'),
    description: get('description'),
  });
  if (!parsed.success) {
    return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  }

  const adminClient = createSupabaseAdminClient();
  const [{ data: store }, { data: settings }] = await Promise.all([
    adminClient.from('stores').select('id, slug, name, logo_url, banner_url, business_description').eq('id', id).maybeSingle(),
    adminClient.from('store_settings').select('opening_hours').eq('store_id', id).maybeSingle(),
  ]);
  if (!store) return { ok: false, message: 'Store not found' };

  const logoEntry = fd.get('logoFile');
  const removeLogo = get('removeLogo') === 'true';
  if (logoEntry instanceof File && logoEntry.size > 0) {
    const res = await setMediaImage(id, 'logo', id, logoEntry, admin.userId);
    if (!res.ok) return { ok: false, message: res.error };
  } else if (removeLogo) {
    const res = await clearMediaImage(id, 'logo', id);
    if (!res.ok) return { ok: false, message: res.error };
  }

  const bannerEntry = fd.get('bannerFile');
  const removeBanner = get('removeBanner') === 'true';
  if (bannerEntry instanceof File && bannerEntry.size > 0) {
    const res = await setMediaImage(id, 'banner', id, bannerEntry, admin.userId);
    if (!res.ok) return { ok: false, message: res.error };
  } else if (removeBanner) {
    const res = await clearMediaImage(id, 'banner', id);
    if (!res.ok) return { ok: false, message: res.error };
  }

  const { error: storeErr } = await adminClient
    .from('stores')
    .update({
      name: parsed.data.name,
      business_description: parsed.data.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (storeErr) return { ok: false, message: 'Could not save store branding details' };

  const existingHours = (settings?.opening_hours as Record<string, unknown> | null) ?? {};
  const nextHours = {
    ...existingHours,
    tagline: parsed.data.tagline || null,
  };
  const { error: settingsErr } = await adminClient
    .from('store_settings')
    .update({ opening_hours: nextHours, updated_at: new Date().toISOString() })
    .eq('store_id', id);
  if (settingsErr) return { ok: false, message: 'Could not save store tagline' };

  await recordAdminAudit({
    actorId: admin.userId,
    storeId: id,
    action: 'store.branding_updated',
    entityType: 'store',
    entityId: id,
    before: { name: store.name, business_description: store.business_description },
    after: { name: parsed.data.name, tagline: parsed.data.tagline || null, business_description: parsed.data.description || null },
  });

  const slug = store.slug as string;
  revalidatePath(`/admin/stores/${id}`);
  revalidatePath('/admin/stores');
  revalidatePath(`/store/${slug}`, 'layout');
  revalidatePath(`/store/${slug}`, 'page');
  revalidatePath('/', 'layout');

  return { ok: true, message: 'Store branding saved and synced to storefront.' };
}
