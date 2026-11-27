import { recordAdminAudit } from '@/lib/services/audit';
import { createOwnerAccount } from '@/lib/services/owner-accounts';
import { setMediaImage } from '@/lib/services/media';
import { activationIssues, subscriptionCovers, type ActivationState } from '@/lib/onboarding/rules';
import type { GstRegistrationValue as GstRegistration } from '@/lib/onboarding/legal-rules';
import { targetUrl } from '@/lib/qr';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

/**
 * Store onboarding for the Admin wizard. Each save writes a draft to store_onboardings first, so progress
 * survives a refresh or a failed step. The store and the owner link are created once; a retried save reuses
 * them. Activation runs only when every requirement passes.
 *
 * Assumes one administrator edits a given onboarding at a time. Concurrent edits are detected where the
 * database enforces a single link, and the losing request is reported rather than applied.
 */

export interface OnboardingDraft {
  id: string;
  storeId: string | null;
  ownerProfileId: string | null;
  currentStep: number;
  stepData: Record<string, unknown>;
  status: 'in_progress' | 'completed';
}

export type OnboardingResult = { ok: true; message: string } | { ok: false; message: string };

const fail = (message: string): OnboardingResult => ({ ok: false, message });
const done = (message: string): OnboardingResult => ({ ok: true, message });

/** Today's date in the platform time zone, as YYYY-MM-DD. */
function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function toDraft(row: Record<string, unknown>): OnboardingDraft {
  return {
    id: row.id as string,
    storeId: (row.store_id as string | null) ?? null,
    ownerProfileId: (row.owner_profile_id as string | null) ?? null,
    currentStep: Number(row.current_step),
    stepData: (row.step_data as Record<string, unknown>) ?? {},
    status: row.status as OnboardingDraft['status'],
  };
}

export async function startOnboarding(adminId: string): Promise<string> {
  const { data, error } = await (await createSupabaseServerClient())
    .from('store_onboardings')
    .insert({ created_by: adminId })
    .select('id')
    .single();
  if (error || !data) throw new Error('Could not start onboarding');
  return data.id as string;
}

export async function loadOnboarding(id: string): Promise<OnboardingDraft | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await (await createSupabaseServerClient()).from('store_onboardings').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('Could not load onboarding');
  return data ? toDraft(data as Record<string, unknown>) : null;
}

export async function listOnboardings(): Promise<
  { id: string; storeName: string | null; currentStep: number; status: string; updatedAt: string }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('store_onboardings')
    .select('id, store_id, current_step, status, updated_at, step_data')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Could not load onboardings');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const info = (row.step_data as { info?: { name?: string } } | null)?.info;
    return {
      id: row.id as string,
      storeName: info?.name ?? null,
      currentStep: Number(row.current_step),
      status: row.status as string,
      updatedAt: row.updated_at as string,
    };
  });
}

async function saveDraft(onb: OnboardingDraft, patch: { stepData?: Record<string, unknown>; currentStep?: number; storeId?: string }) {
  const { error } = await (await createSupabaseServerClient())
    .from('store_onboardings')
    .update({
      ...(patch.stepData ? { step_data: patch.stepData } : {}),
      ...(patch.currentStep ? { current_step: patch.currentStep } : {}),
    })
    .eq('id', onb.id);
  return !error;
}

function advance(current: number, to: number): number {
  return Math.max(current, to);
}

/** Step 1. Creates the store once as a draft, then updates it on later saves. */
export async function saveStoreInfo(
  onb: OnboardingDraft,
  input: {
    name: string;
    slug: string;
    category: string;
    phone: string | null;
    email: string | null;
    addressLine: string | null;
    city: string | null;
    district?: string | null;
    state: string | null;
    pincode: string | null;
    operatingHours?: string | null;
    description: string | null;
    brandColour: string;
  },
): Promise<OnboardingResult> {
  if (onb.status === 'completed') return fail('This store is already activated.');
  const supabase = await createSupabaseServerClient();
  const storeFields = {
    name: input.name,
    slug: input.slug,
    address_line: input.addressLine,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    phone: input.phone,
    email: input.email,
    brand_colour: input.brandColour,
    business_category: input.category,
    business_description: input.description,
  };
  const stepData = { ...onb.stepData, info: input };

  if (!onb.storeId) {
    // One database transaction creates the store and links it to this onboarding. On any failure nothing is left behind.
    const { error } = await supabase.rpc('onboarding_create_store', {
      p_onboarding: onb.id,
      p_fields: {
        slug: input.slug,
        name: input.name,
        category: input.category,
        description: input.description,
        addressLine: input.addressLine,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        phone: input.phone,
        email: input.email,
        brandColour: input.brandColour,
      },
      p_step_data: stepData,
      p_step: advance(onb.currentStep, 2),
    });
    if (error) {
      if (error.code === '23505') return fail('That slug is already in use');
      if (error.code === 'P0001') return fail('This onboarding was updated elsewhere or is closed. Reload the page and try again.');
      if (error.code === '42501') return fail('Only platform administrators can create stores.');
      return fail('Could not create the store');
    }
    return done('Store information saved as a draft.');
  }

  const { error: storeError } = await supabase.from('stores').update({ ...storeFields, updated_at: new Date().toISOString() }).eq('id', onb.storeId);
  if (storeError) return fail(storeError.code === '23505' ? 'That slug is already in use' : 'Could not save the store');
  if (!(await saveDraft(onb, { stepData, currentStep: advance(onb.currentStep, 2) }))) return fail('Could not save the draft');
  return done('Store information saved.');
}

/** Step 2. Creates the owner account once. A retry reuses the linked account and never creates a second one. */
export async function saveOwner(
  onb: OnboardingDraft,
  adminId: string,
  input: { fullName: string; email: string; phone: string | null; role: 'owner' | 'manager' | 'staff'; password: string },
): Promise<OnboardingResult> {
  if (onb.status === 'completed') return fail('This store is already activated.');
  if (!onb.storeId) return fail('Save store information (step 1) first.');
  if (onb.ownerProfileId) return done('The owner account is already linked. It was not created again.');

  const { password, ...details } = input;
  // The provisioning workflow links the owner to this onboarding record in the database (zb_prov_link_onboarding).
  const created = await createOwnerAccount({
    actorId: adminId,
    actorType: 'super_admin',
    storeId: onb.storeId,
    password,
    onboardingId: onb.id,
    requestKey: `onboarding:${onb.id}:owner`,
    ...details,
  });
  if (!created.ok) {
    if (created.emailTaken) {
      const adminSb = createSupabaseAdminClient();
      const { data: userList } = await adminSb.auth.admin.listUsers();
      const existingUser = userList?.users.find((u) => u.email?.toLowerCase() === input.email.trim().toLowerCase());

      if (existingUser) {
        // Link this existing profile to the store as owner
        await adminSb.from('store_owners').upsert(
          {
            store_id: onb.storeId,
            profile_id: existingUser.id,
            role: input.role,
            is_active: true,
          },
          { onConflict: 'store_id,profile_id' },
        );

        // Link onboarding to this profile
        await adminSb
          .from('store_onboardings')
          .update({
            owner_profile_id: existingUser.id,
            step_data: { ...onb.stepData, owner: details },
            current_step: advance(onb.currentStep, 3),
          })
          .eq('id', onb.id);

        return done('Existing owner account linked to this store.');
      }
    }
    return fail(created.message);
  }

  const { error } = await (await createSupabaseServerClient())
    .from('store_onboardings')
    .update({ step_data: { ...onb.stepData, owner: details }, current_step: advance(onb.currentStep, 3) })
    .eq('id', onb.id);
  if (error) return done('Owner account created. The onboarding draft could not be updated; reload before continuing.');
  return done(created.auditFailed ? 'Owner account created. The audit entry could not be written.' : 'Owner account created.');
}

/** Step 3. Writes the legal and tax profile to the store record and to the draft. */
export async function saveTax(
  onb: OnboardingDraft,
  input: {
    legalName: string;
    gstin: string | null;
    businessState: string;
    billingAddress: string;
    gstRegistration: GstRegistration;
    pricesIncludeGst: boolean;
  },
): Promise<OnboardingResult> {
  if (onb.status === 'completed') return fail('This store is already activated.');
  if (!onb.storeId) return fail('Save store information (step 1) first.');
  const { error } = await (await createSupabaseServerClient())
    .from('stores')
    .update({
      legal_name: input.legalName,
      gstin: input.gstin,
      state: input.businessState,
      billing_address: input.billingAddress,
      gst_registration: input.gstRegistration,
      prices_include_gst: input.pricesIncludeGst,
      updated_at: new Date().toISOString(),
    })
    .eq('id', onb.storeId);
  if (error) return fail('Could not save tax details');
  if (!(await saveDraft(onb, { stepData: { ...onb.stepData, tax: input }, currentStep: advance(onb.currentStep, 4) }))) {
    return fail('Could not save the draft');
  }
  return done('Business and tax information saved.');
}

/** Step 4. Logo and banner are optional. Each upload uses the existing Storage pipeline. */
export async function saveBranding(
  onb: OnboardingDraft,
  adminId: string,
  files: { logo?: File | null; banner?: File | null },
): Promise<OnboardingResult> {
  if (onb.status === 'completed') return fail('This store is already activated.');
  if (!onb.storeId) return fail('Save store information (step 1) first.');
  const applied: Record<string, boolean> = {};
  for (const target of ['logo', 'banner'] as const) {
    const file = files[target];
    if (!file || file.size === 0) continue;
    const result = await setMediaImage(onb.storeId, target, onb.storeId, file, adminId);
    if (!result.ok) return fail(result.error);
    applied[target] = true;
  }
  const previous = (onb.stepData.branding as Record<string, boolean> | undefined) ?? {};
  const branding = { ...previous, ...applied };
  if (!(await saveDraft(onb, { stepData: { ...onb.stepData, branding }, currentStep: advance(onb.currentStep, 5) }))) {
    return fail('Could not save the draft');
  }
  return done('Branding saved.');
}

/** Step 5. Creates the subscription once. A retry reuses it instead of adding a second one. */
export async function saveSubscription(
  onb: OnboardingDraft,
  input: { planId: string; periodStart: string; periodEnd: string },
): Promise<OnboardingResult> {
  if (onb.status === 'completed') return fail('This store is already activated.');
  if (!onb.storeId) return fail('Save store information (step 1) first.');
  const existing = onb.stepData.subscription as { subscriptionId?: string } | undefined;
  if (existing?.subscriptionId) return done('The subscription is already assigned.');

  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase.from('subscription_plans').select('id').eq('id', input.planId).eq('is_active', true).maybeSingle();
  if (!plan) return fail('That plan is not available');

  const { data: sub, error } = await supabase
    .from('subscriptions')
    .insert({ store_id: onb.storeId, plan_id: input.planId, status: 'active', period_start: input.periodStart, period_end: input.periodEnd })
    .select('id')
    .single();
  if (error || !sub) return fail('Could not assign the subscription');

  const subscription = { ...input, subscriptionId: sub.id as string };
  if (!(await saveDraft(onb, { stepData: { ...onb.stepData, subscription }, currentStep: advance(onb.currentStep, 6) }))) {
    return fail('Subscription assigned, but the draft could not be saved. Save this step again.');
  }
  return done('Subscription assigned.');
}

/** Step 6. Writes one feature flag per key. Re-saving the same values is safe. */
export async function saveFeatures(onb: OnboardingDraft, features: Record<string, boolean>): Promise<OnboardingResult> {
  if (onb.status === 'completed') return fail('This store is already activated.');
  const storeId = onb.storeId;
  if (!storeId) return fail('Save store information (step 1) first.');
  const rows = Object.entries(features).map(([feature_key, enabled]) => ({ store_id: storeId, feature_key, enabled, updated_at: new Date().toISOString() }));
  if (rows.length > 0) {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from('feature_flags').upsert(rows, { onConflict: 'store_id,feature_key' });
    if (error) return fail('Could not save the feature configuration');

    // Also sync store_settings online_payment_enabled if online_payments feature is provided
    if (features.online_payments !== undefined) {
      await admin.from('store_settings').update({
        online_payment_enabled: Boolean(features.online_payments),
        updated_at: new Date().toISOString(),
      }).eq('store_id', storeId);
    }
  }
  if (!(await saveDraft(onb, { stepData: { ...onb.stepData, features }, currentStep: advance(onb.currentStep, 7) }))) {
    return fail('Could not save the draft');
  }
  return done('Feature configuration saved.');
}

/** Step 7. Creates the showroom QR once, using the same public URL rule as the storefront. */
export async function generateStoreQr(onb: OnboardingDraft): Promise<OnboardingResult> {
  if (onb.status === 'completed') return fail('This store is already activated.');
  if (!onb.storeId) return fail('Save store information (step 1) first.');
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('qr_codes')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', onb.storeId)
    .eq('target_type', 'showroom');
  if (!count) {
    const { data: store } = await supabase.from('stores').select('slug').eq('id', onb.storeId).maybeSingle();
    if (!store) return fail('The store was not found');
    const { error } = await supabase.from('qr_codes').insert({
      store_id: onb.storeId,
      target_type: 'showroom',
      target_id: null,
      public_url: targetUrl(store.slug as string, { type: 'showroom' }),
      is_active: true,
    });
    if (error) return fail('Could not generate the store QR');
  }
  if (!(await saveDraft(onb, { stepData: { ...onb.stepData, qr: { generated: true } }, currentStep: advance(onb.currentStep, 8) }))) {
    return fail('Could not save the draft');
  }
  return done('Store QR is ready.');
}

/** Works out what is still missing, checking the database for the owner link, subscription and QR. */
export async function activationStateOf(onb: OnboardingDraft): Promise<ActivationState> {
  const supabase = await createSupabaseServerClient();
  const subscription = onb.stepData.subscription as { subscriptionId?: string; periodStart?: string; periodEnd?: string } | undefined;

  let ownerLinked = false;
  let subscriptionCurrent = false;
  let qrReady = false;
  if (onb.storeId) {
    if (onb.ownerProfileId) {
      const { data } = await supabase
        .from('store_owners')
        .select('profile_id')
        .eq('store_id', onb.storeId)
        .eq('profile_id', onb.ownerProfileId)
        .eq('is_active', true)
        .maybeSingle();
      ownerLinked = !!data;
    }
    if (subscription?.subscriptionId && subscription.periodStart && subscription.periodEnd) {
      const { data } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('id', subscription.subscriptionId)
        .eq('store_id', onb.storeId)
        .maybeSingle();
      subscriptionCurrent = data?.status === 'active' && subscriptionCovers(todayIst(), subscription.periodStart, subscription.periodEnd);
    }
    const { count } = await supabase
      .from('qr_codes')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', onb.storeId)
      .eq('target_type', 'showroom')
      .eq('is_active', true);
    qrReady = (count ?? 0) > 0;
  }

  return {
    infoSaved: !!onb.storeId && !!onb.stepData.info,
    ownerLinked,
    taxSaved: !!onb.stepData.tax,
    subscriptionCurrent,
    featuresSaved: !!onb.stepData.features,
    qrReady,
    alreadyCompleted: onb.status === 'completed',
  };
}

/** Step 8. Activates the store only when every requirement passes. Repeating the call changes nothing. */
export async function activateStore(onb: OnboardingDraft, adminId: string): Promise<OnboardingResult> {
  if (onb.status === 'completed') return done('This store is already activated.');
  if (!onb.storeId || !onb.ownerProfileId) return fail('Complete every step before activating.');

  const state = await activationStateOf(onb);
  const issues = activationIssues(state);
  if (issues.length > 0) return fail(issues.join(' '));

  const adminSb = createSupabaseAdminClient();
  const { data: activated, error: storeError } = await adminSb
    .from('stores')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', onb.storeId)
    .eq('status', 'draft')
    .select('id, slug');
  if (storeError) return fail('Could not activate the store');
  if (!activated || activated.length === 0) {
    const { data: current } = await adminSb.from('stores').select('status').eq('id', onb.storeId).maybeSingle();
    if (current?.status !== 'active') return fail('The store is not in draft status, so it was not activated.');
  }

  const { data: completed, error: completeError } = await adminSb
    .from('store_onboardings')
    .update({ status: 'completed', completed_at: new Date().toISOString(), current_step: 8 })
    .eq('id', onb.id)
    .eq('status', 'in_progress')
    .select('id');
  if (completeError) return fail('The store is active, but the onboarding record could not be closed. Reload to finish.');

  if (completed && completed.length > 0) {
    try {
      await recordAdminAudit({ actorId: adminId, storeId: onb.storeId, action: 'store.onboarded', entityType: 'store', entityId: onb.storeId, after: { onboardingId: onb.id } });
    } catch {
      // Audit entry failure does not block activation
    }
  }

  revalidatePath('/', 'layout');
  return done('Store activated.');
}
