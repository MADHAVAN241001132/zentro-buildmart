import { GST_STATE_CODES } from '@/lib/gst/policy';
import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const addToCartSchema = z.object({
  variantId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(999),
});

export const cartLineSchema = z.object({
  itemId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(999),
});

export const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, 'Enter your full name')
    .max(120, 'Name is too long'),
  customerMobile: z
    .string()
    .trim()
    .regex(/^[6-9][0-9]{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  customerEmail: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address'),
  method: z.enum(['online', 'cash'], { errorMap: () => ({ message: 'Choose a payment method' }) }),
  supplyStateCode: z
    .string()
    .refine((code) => GST_STATE_CODES.some((s) => s.code === code), 'Choose the state where the order will be delivered'),
});

export const ownerLoginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const cashConfirmSchema = z.object({
  orderId: uuidSchema,
  amountReceived: z.string().trim().min(1, 'Enter the amount received'),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
});

/** A coupon code as typed by the guest or owner. A blank value removes the coupon. */
export const couponCodeSchema = z
  .string()
  .trim()
  .max(40, 'Coupon codes are at most 40 characters')
  .regex(/^[A-Za-z0-9_-]*$/, 'Coupon codes use letters, numbers, dashes and underscores only');

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;

/** Returns the first error message for a field, or null. Used to build form error state. */
export function firstIssue(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
