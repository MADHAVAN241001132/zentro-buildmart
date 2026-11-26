import { z } from 'zod';
import { parseRupeesToPaise } from '@/lib/money';

export const STORE_STATUSES = ['draft', 'active', 'suspended', 'archived'] as const;
export const OWNER_ROLES = ['owner', 'manager', 'staff'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'grace', 'expired', 'cancelled'] as const;

/** Feature keys the backend and storefront check. Keep in step with the feature_flags usage. */
export const FEATURE_KEYS = [
  'online_payments',
  'pos_billing',
  'quotations',
  'credit_ledger',
  'delivery',
  'coupons',
  'tile_batches',
  'purchase_orders',
  'room_visualiser',
  'qr_scan_analytics',
  'house_project_planner',
  'bulk_imports',
  'reports',
] as const;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD');
const uuid = z.string().uuid('Invalid identifier');

export const adminStoreSchema = z.object({
  name: z.string().trim().min(1, 'Enter the store name').max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens').min(3).max(60),
  status: z.enum(STORE_STATUSES),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, 'GSTIN must be 15 characters').or(z.literal('')).transform((v) => v || null),
  addressLine: z.string().trim().max(200).transform((v) => v || null),
  city: z.string().trim().max(80).transform((v) => v || null),
  state: z.string().trim().max(80).transform((v) => v || null),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits').or(z.literal('')).transform((v) => v || null),
  phone: z.string().trim().regex(/^[0-9+ ]{10,15}$/, 'Enter a valid phone number').or(z.literal('')).transform((v) => v || null),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).transform((v) => v || null),
  brandColour: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour such as #6A0D2A'),
});

export const ownerAccountSchema = z.object({
  storeId: uuid,
  fullName: z.string().trim().min(1, 'Enter the owner name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().regex(/^[0-9+ ]{10,15}$/, 'Enter a valid phone number').or(z.literal('')).transform((v) => v || null),
  password: z.string().min(10, 'Use at least 10 characters').max(72, 'Use at most 72 characters'),
  role: z.enum(OWNER_ROLES),
});

// A limit is a positive number, or blank. Blank is valid only together with the matching
// unlimited flag, so an unlimited plan is always an explicit choice.
const limitField = z.union([z.literal(''), z.coerce.number().int().positive()]).transform((v) => (v === '' ? null : v));

const planBase = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,40}$/, 'Use 3 to 40 lowercase letters, digits or underscores'),
  name: z.string().trim().min(1, 'Enter a plan name').max(80),
  description: z.string().trim().max(500, 'Keep the description under 500 characters').transform((v) => (v === '' ? null : v)),
  billingInterval: z.enum(['monthly', 'annual']),
  maxProducts: limitField,
  productsUnlimited: z.boolean(),
  maxUsers: limitField,
  usersUnlimited: z.boolean(),
  isActive: z.boolean(),
});

type PlanInput = z.infer<typeof planBase>;

function planLimitRules(plan: PlanInput, ctx: z.RefinementCtx) {
  if (plan.productsUnlimited && plan.maxProducts !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxProducts'], message: 'Leave blank when products are unlimited' });
  }
  if (!plan.productsUnlimited && plan.maxProducts === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxProducts'], message: 'Enter a product limit or choose unlimited' });
  }
  if (plan.usersUnlimited && plan.maxUsers !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxUsers'], message: 'Leave blank when users are unlimited' });
  }
  if (!plan.usersUnlimited && plan.maxUsers === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxUsers'], message: 'Enter a user limit or choose unlimited' });
  }
}

export const planSchema = planBase.superRefine(planLimitRules);

export const subscriptionSchema = z
  .object({
    storeId: uuid,
    planId: uuid,
    status: z.enum(['trialing', 'active', 'grace']),
    periodStart: dateString,
    periodEnd: dateString,
  })
  .refine((v) => v.periodEnd > v.periodStart, { message: 'End date must be after the start date', path: ['periodEnd'] });

export const flagSchema = z.object({
  storeId: uuid,
  featureKey: z.enum(FEATURE_KEYS),
  enabled: z.boolean(),
});

export const ticketSchema = z.object({
  ticketId: uuid,
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES),
});

export function rupeesField(input: string): number | null {
  return parseRupeesToPaise(input);
}
