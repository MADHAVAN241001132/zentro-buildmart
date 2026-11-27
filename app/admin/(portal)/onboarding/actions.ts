'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/services/admin';
import {
  activateStore,
  generateStoreQr,
  loadOnboarding,
  saveBranding,
  saveFeatures,
  saveOwner,
  saveStoreInfo,
  saveSubscription,
  saveTax,
  startOnboarding,
  type OnboardingResult,
} from '@/lib/services/onboarding';
import { FEATURE_KEYS } from '@/lib/validation/admin';
import { issuesToFields } from '@/lib/validation/owner';
import { infoSchema, ownerDetailsSchema, ownerPasswordSchema, subscriptionStepSchema, taxSchema } from '@/lib/onboarding/schemas';

export interface OnboardingState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const UUID = /^[0-9a-f-]{36}$/i;

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

function file(fd: FormData, key: string): File | null {
  const value = fd.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

function toState(result: OnboardingResult): OnboardingState {
  return { ok: result.ok, message: result.message };
}

export async function startOnboardingAction(): Promise<void> {
  const admin = await requireAdmin();
  const id = await startOnboarding(admin.userId);
  revalidatePath('/admin/onboarding');
  redirect(`/admin/onboarding/${id}?step=1`);
}

/**
 * Saves one wizard step. Every save writes a draft first. The owner password is read here only, passed to
 * account creation and discarded; it is never written to the draft.
 */
export async function saveOnboardingStepAction(onboardingId: string, step: number, _prev: OnboardingState, fd: FormData): Promise<OnboardingState> {
  const admin = await requireAdmin();
  if (!UUID.test(onboardingId) || !Number.isInteger(step) || step < 1 || step > 8) return { ok: false, message: 'Invalid step' };
  const onb = await loadOnboarding(onboardingId);
  if (!onb) return { ok: false, message: 'Onboarding not found' };
  if (step > onb.currentStep) return { ok: false, message: 'Complete the earlier steps first.' };

  let result: OnboardingResult;
  switch (step) {
    case 1: {
      const parsed = infoSchema.safeParse({
        name: text(fd, 'name'),
        slug: text(fd, 'slug'),
        category: text(fd, 'category'),
        phone: text(fd, 'phone'),
        email: text(fd, 'email'),
        addressLine: text(fd, 'addressLine'),
        city: text(fd, 'city'),
        district: text(fd, 'district'),
        state: text(fd, 'state'),
        pincode: text(fd, 'pincode'),
        operatingHours: text(fd, 'operatingHours'),
        description: text(fd, 'description'),
        brandColour: text(fd, 'brandColour') || '#6A0D2A',
      });
      if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
      result = await saveStoreInfo(onb, parsed.data);
      break;
    }
    case 2: {
      // An already-linked owner is not re-validated or re-created. Disabled fields are not submitted, so they are not read.
      if (onb.ownerProfileId) return { ok: true, message: 'The owner account is already linked. It was not created again.' };
      const details = ownerDetailsSchema.safeParse({
        fullName: text(fd, 'fullName'),
        email: text(fd, 'email'),
        phone: text(fd, 'phone'),
        role: text(fd, 'role') || 'owner',
      });
      const password = ownerPasswordSchema.safeParse(text(fd, 'password'));
      const fieldErrors: Record<string, string> = {};
      if (!details.success) Object.assign(fieldErrors, issuesToFields(details.error));
      if (!password.success) fieldErrors.password = password.error.issues[0]?.message ?? 'Check the password';
      if (Object.keys(fieldErrors).length > 0) return { ok: false, message: 'Check the highlighted fields', fieldErrors };
      if (!details.success) return { ok: false, message: 'Check the highlighted fields' };
      result = await saveOwner(onb, admin.userId, { ...details.data, password: text(fd, 'password') });
      break;
    }
    case 3: {
      const parsed = taxSchema.safeParse({
        legalName: text(fd, 'legalName'),
        gstin: text(fd, 'gstin'),
        businessState: text(fd, 'businessState'),
        billingAddress: text(fd, 'billingAddress'),
        gstRegistration: text(fd, 'gstRegistration') || 'unregistered',
        pricesIncludeGst: text(fd, 'pricesIncludeGst') === 'on',
      });
      if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
      result = await saveTax(onb, parsed.data);
      break;
    }
    case 4:
      result = await saveBranding(onb, admin.userId, { logo: file(fd, 'logo'), banner: file(fd, 'banner') });
      break;
    case 5: {
      const parsed = subscriptionStepSchema.safeParse({
        planId: text(fd, 'planId'),
        periodStart: text(fd, 'periodStart'),
        periodEnd: text(fd, 'periodEnd'),
      });
      if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
      result = await saveSubscription(onb, parsed.data);
      break;
    }
    case 6: {
      const features = Object.fromEntries(FEATURE_KEYS.map((key) => [key, text(fd, key) === 'on']));
      result = await saveFeatures(onb, features);
      break;
    }
    case 7:
      result = await generateStoreQr(onb);
      break;
    default:
      return { ok: false, message: 'Activation is a separate step' };
  }

  revalidatePath(`/admin/onboarding/${onboardingId}`);
  revalidatePath('/admin/onboarding');
  return toState(result);
}

/** Activates the store only when every requirement passes. Repeating it changes nothing. */
export async function activateOnboardingAction(onboardingId: string, _prev: OnboardingState, _fd: FormData): Promise<OnboardingState> {
  const admin = await requireAdmin();
  if (!UUID.test(onboardingId)) return { ok: false, message: 'Invalid onboarding' };
  const onb = await loadOnboarding(onboardingId);
  if (!onb) return { ok: false, message: 'Onboarding not found' };
  const result = await activateStore(onb, admin.userId);
  revalidatePath(`/admin/onboarding/${onboardingId}`);
  revalidatePath('/admin/onboarding');
  revalidatePath('/admin/stores');
  return toState(result);
}
