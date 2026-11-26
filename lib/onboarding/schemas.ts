import { z } from 'zod';
import { FEATURE_KEYS } from '@/lib/validation/admin';
import { legalProfileSchema } from '@/lib/validation/legal';

/** Field rules for each onboarding step. Passwords are checked here but are never part of a draft. */

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+ ]{10,15}$/, 'Enter a valid phone number')
  .or(z.literal(''))
  .transform((v) => v || null);
const email = z.string().trim().toLowerCase().email('Enter a valid email').or(z.literal('')).transform((v) => v || null);
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD');

export const infoSchema = z.object({
  name: z.string().trim().min(1, 'Enter the store name').max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use at least 3 characters')
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens'),
  category: z.string().trim().min(1, 'Choose a business category').max(80),
  phone,
  email,
  addressLine: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits').or(z.literal('')).transform((v) => v || null),
  description: optionalText(500),
  brandColour: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour such as #6A0D2A'),
});

export const ownerDetailsSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the owner name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone,
  role: z.enum(['owner', 'manager', 'staff']).default('owner'),
});

export const ownerPasswordSchema = z.string().min(10, 'Use at least 10 characters').max(72, 'Use at most 72 characters');

/** Step 3 uses the shared legal profile, so onboarding and the Admin store screen apply the same rules. */
export const taxSchema = legalProfileSchema;

export const subscriptionStepSchema = z
  .object({
    planId: z.string().uuid('Choose a subscription plan'),
    periodStart: dateString,
    periodEnd: dateString,
  })
  .refine((v) => v.periodEnd > v.periodStart, { message: 'End date must be after the start date', path: ['periodEnd'] });

/** One boolean per feature key. A missing key means the feature is off. */
export const featureStepSchema = z.object(Object.fromEntries(FEATURE_KEYS.map((key) => [key, z.boolean().default(false)])));
