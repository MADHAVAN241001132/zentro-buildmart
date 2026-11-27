'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseRupeesToPaise } from '@/lib/money';
import { planSchema, subscriptionSchema } from '@/lib/validation/admin';
import { PREMIUM_FEATURE_KEYS } from '@/lib/entitlements/rules';
import { issuesToFields } from '@/lib/validation/owner';

export interface SubscriptionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

/** Premium feature switches on the plan form. Unchecked means the plan explicitly disables the feature. */
const PLAN_FEATURE_FIELDS = PREMIUM_FEATURE_KEYS;

function planFeaturesFrom(fd: FormData, base: Record<string, unknown> = {}): Record<string, unknown> {
  const features: Record<string, unknown> = { ...base };
  for (const key of PLAN_FEATURE_FIELDS) features[key] = fd.get(`feature_${key}`) === 'on';
  return features;
}

function planFieldsFrom(fd: FormData, code: string) {
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  return {
    code,
    name: get('name'),
    description: get('description'),
    billingInterval: get('billingInterval') || 'monthly',
    maxProducts: get('maxProducts'),
    productsUnlimited: fd.get('productsUnlimited') === 'on',
    maxUsers: get('maxUsers'),
    usersUnlimited: fd.get('usersUnlimited') === 'on',
    isActive: fd.get('isActive') === 'on',
  };
}

export async function createPlanAction(_prev: SubscriptionState, fd: FormData): Promise<SubscriptionState> {
  const admin = await requireAdmin();
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  const price = parseRupeesToPaise(get('priceRupees'));
  if (price === null) return { ok: false, message: 'Enter the price in rupees', fieldErrors: { priceRupees: 'Enter a valid amount such as 2999.00' } };
  const parsed = planSchema.safeParse(planFieldsFrom(fd, get('code')));
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const features = planFeaturesFrom(fd);
  const { data, error } = await supabase
    .from('subscription_plans')
    .insert({
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description,
      billing_interval: parsed.data.billingInterval,
      price_paise: price,
      max_products: parsed.data.maxProducts,
      products_unlimited: parsed.data.productsUnlimited,
      max_users: parsed.data.maxUsers,
      users_unlimited: parsed.data.usersUnlimited,
      is_active: parsed.data.isActive,
      features,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, message: error?.code === '23505' ? 'A plan with that code already exists' : 'Could not create the plan' };

  await recordAdminAudit({ actorId: admin.userId, action: 'plan.created', entityType: 'subscription_plan', entityId: data.id as string, after: { code: parsed.data.code, price_paise: price, max_products: parsed.data.maxProducts, products_unlimited: parsed.data.productsUnlimited, max_users: parsed.data.maxUsers, users_unlimited: parsed.data.usersUnlimited, features } });
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
  return { ok: true, message: 'Plan created' };
}

/**
 * Edits an existing plan. The code is fixed. Limits and feature switches take effect immediately for
 * every store on the plan, because entitlement checks read the plan at the time of each operation.
 * The price applies to new assignments and renewals; recorded payments are not changed.
 * Lowering a limit never removes existing products or users; it only refuses new ones.
 */
export async function updatePlanAction(planId: string, _prev: SubscriptionState, fd: FormData): Promise<SubscriptionState> {
  const admin = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { ok: false, message: 'Invalid plan' };
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from('subscription_plans')
    .select('id, code, name, description, price_paise, max_products, products_unlimited, max_users, users_unlimited, features, is_active')
    .eq('id', planId)
    .maybeSingle();
  if (!before) return { ok: false, message: 'Plan not found' };

  const price = parseRupeesToPaise(String(fd.get('priceRupees') ?? ''));
  if (price === null) return { ok: false, message: 'Enter the price in rupees', fieldErrors: { priceRupees: 'Enter a valid amount such as 2999.00' } };
  const parsed = planSchema.safeParse(planFieldsFrom(fd, before.code as string));
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };

  const existingFeatures = (before.features as Record<string, unknown> | null) ?? {};
  const features = planFeaturesFrom(fd, existingFeatures);
  const after = {
    name: parsed.data.name,
    description: parsed.data.description,
    price_paise: price,
    max_products: parsed.data.maxProducts,
    products_unlimited: parsed.data.productsUnlimited,
    max_users: parsed.data.maxUsers,
    users_unlimited: parsed.data.usersUnlimited,
    features,
    is_active: parsed.data.isActive,
  };
  const { error } = await supabase.from('subscription_plans').update(after).eq('id', planId);
  if (error) return { ok: false, message: error.message.includes('limit') ? 'The limit must be a positive number or unlimited' : 'Could not save the plan' };

  await recordAdminAudit({
    actorId: admin.userId,
    action: 'plan.updated',
    entityType: 'subscription_plan',
    entityId: planId,
    before: { name: before.name, description: before.description, price_paise: before.price_paise, max_products: before.max_products, products_unlimited: before.products_unlimited, max_users: before.max_users, users_unlimited: before.users_unlimited, features: existingFeatures, is_active: before.is_active },
    after,
  });
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
  return { ok: true, message: 'Plan saved' };
}

export async function setPlanActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === 'true';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('subscription_plans').update({ is_active: active }).eq('id', id);
  if (error) return;
  await recordAdminAudit({ actorId: admin.userId, action: active ? 'plan.activated' : 'plan.deactivated', entityType: 'subscription_plan', entityId: id, after: { is_active: active } });
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
}

/** Assigns a plan to a store. A new assignment for a store closes nothing automatically; set the old one to cancelled first. */
export async function assignSubscriptionAction(_prev: SubscriptionState, fd: FormData): Promise<SubscriptionState> {
  const admin = await requireAdmin();
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  const parsed = subscriptionSchema.safeParse({
    storeId: get('storeId'),
    planId: get('planId'),
    status: get('status') || 'active',
    periodStart: get('periodStart'),
    periodEnd: get('periodEnd'),
  });
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({ store_id: d.storeId, plan_id: d.planId, status: d.status, period_start: d.periodStart, period_end: d.periodEnd })
    .select('id')
    .single();
  if (error || !data) return { ok: false, message: 'Could not assign the subscription' };

  await recordAdminAudit({ actorId: admin.userId, storeId: d.storeId, action: 'subscription.assigned', entityType: 'subscription', entityId: data.id as string, after: { plan_id: d.planId, status: d.status, period_end: d.periodEnd } });
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
  return { ok: true, message: 'Subscription assigned' };
}

/** Renews a subscription by moving its end date and setting it to active. */
export async function renewSubscriptionAction(_prev: SubscriptionState, fd: FormData): Promise<SubscriptionState> {
  const admin = await requireAdmin();
  const id = String(fd.get('id') ?? '');
  const periodEnd = String(fd.get('periodEnd') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: 'Invalid subscription' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return { ok: false, message: 'Enter the new end date', fieldErrors: { periodEnd: 'Use YYYY-MM-DD' } };

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('subscriptions').select('store_id, plan_id, period_end, status, period_start').eq('id', id).maybeSingle();
  if (!before) return { ok: false, message: 'Subscription not found' };

  // Renewal creates a new period and keeps the previous row as history (see migration 0030).
  const { data: newId, error } = await supabase.rpc('renew_subscription', {
    p_store: before.store_id as string,
    p_plan: before.plan_id as string,
    p_period_end: periodEnd,
  });
  if (error) {
    if (error.code === '22023') return { ok: false, message: 'The renewal end date must be after the current period', fieldErrors: { periodEnd: 'Choose a later end date' } };
    if (error.code === '42501') return { ok: false, message: 'Only platform administrators can renew subscriptions' };
    return { ok: false, message: 'Could not renew the subscription' };
  }
  await recordAdminAudit({ actorId: admin.userId, storeId: before.store_id as string, action: 'subscription.renewed', entityType: 'subscription', entityId: (newId as string) ?? id, before: { period_end: before.period_end, status: before.status }, after: { period_end: periodEnd, status: 'active', previous_subscription_id: id } });
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
  return { ok: true, message: 'Subscription renewed' };
}

export async function setSubscriptionStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['active', 'grace', 'expired', 'cancelled'].includes(status)) return;
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('subscriptions').select('store_id, status').eq('id', id).maybeSingle();
  if (!before) return;
  const { error } = await supabase.from('subscriptions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return;
  await recordAdminAudit({ actorId: admin.userId, storeId: before.store_id as string, action: 'subscription.status_changed', entityType: 'subscription', entityId: id, before: { status: before.status }, after: { status } });
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
}

export async function grantAllowanceAction(_prev: SubscriptionState, fd: FormData): Promise<SubscriptionState> {
  const admin = await requireAdmin();
  const storeId = String(fd.get('storeId') ?? '');
  const expiresOn = String(fd.get('expiresOn') ?? '');
  const reason = String(fd.get('reason') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return { ok: false, message: 'Choose a store', fieldErrors: { storeId: 'Choose a store' } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { ok: false, message: 'Enter the end date', fieldErrors: { expiresOn: 'Use YYYY-MM-DD' } };
  if (reason.length < 5 || reason.length > 300) return { ok: false, message: 'Give a reason', fieldErrors: { reason: 'Use 5 to 300 characters' } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('grant_migration_allowance', { p_store: storeId, p_expires_on: expiresOn, p_reason: reason });
  if (error) {
    if (error.code === '22023') return { ok: false, message: 'An allowance must end between tomorrow and 90 days from today', fieldErrors: { expiresOn: 'Choose an earlier date' } };
    if (error.code === '42501') return { ok: false, message: 'Only platform administrators can grant allowances' };
    if (error.code === 'P0001') return { ok: false, message: 'This store already has subscriptions, so no allowance is needed' };
    return { ok: false, message: 'Could not grant the allowance' };
  }
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
  return { ok: true, message: 'Allowance granted' };
}

export async function revokeAllowanceAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const storeId = String(formData.get('storeId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('revoke_migration_allowance', { p_store: storeId });
  if (error || data !== true) return;
  revalidatePath('/admin/subscriptions');
  revalidatePath('/');
}
