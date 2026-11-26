import { z } from 'zod';
import { parseRupeesToPaise } from '@/lib/money';
import { UNITS, GST_RATES_BPS, slugify } from '@/lib/validation/catalogue-constants';

export { UNITS, GST_RATES_BPS, slugify };

export const APPLICATIONS = ['floor', 'wall', 'bathroom', 'kitchen', 'outdoor', 'general'] as const;

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const checkbox = z
  .union([z.literal('on'), z.literal(''), z.null()])
  .optional()
  .transform((v) => v === 'on');

const rupees = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') {
        if (required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
        return null;
      }
      const paise = parseRupeesToPaise(v);
      if (paise === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be an amount such as 1250.50` });
        return null;
      }
      return paise;
    });

export const productSchema = z.object({
  sku: z.string().trim().min(2, 'SKU must be at least 2 characters').max(64),
  name: z.string().trim().min(2, 'Enter the product name').max(200),
  slug: z.string().trim().max(60).optional().transform((v) => v ?? ''),
  categoryId: z.string().uuid('Choose a category'),
  subcategoryId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  brandId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  description: optionalText(2000),
  hsnCode: optionalText(16),
  gstRateBps: z.coerce.number().refine((v) => (GST_RATES_BPS as readonly number[]).includes(v), 'Choose a GST rate'),
  unitOfSale: z.enum(UNITS, { errorMap: () => ({ message: 'Choose a unit of sale' }) }),
  finish: optionalText(80),
  colour: optionalText(80),
  application: z
    .union([z.enum(APPLICATIONS), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null)),
  warrantyMonths: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 240) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Warranty must be 0 to 240 months' });
        return null;
      }
      return n;
    }),
  visibility: z.enum(['public', 'hidden']),
  isFeatured: checkbox,
  isNewArrival: checkbox,
  isBestSeller: checkbox,
  isSpecialOffer: checkbox,
});

export const variantSchema = z
  .object({
    variantId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
    sku: z.string().trim().min(2, 'Variant SKU is required').max(80),
    label: z.string().trim().min(1, 'Enter a variant label').max(120),
    sizeLabel: optionalText(60),
    salePrice: rupees('Selling price', true),
    costPrice: rupees('Cost price', false),
    mrp: rupees('MRP', false),
    priceUnit: z.enum(UNITS),
    piecesPerBox: z.coerce.number().int().min(1, 'Pieces per box must be at least 1').max(10000),
    coverageSqft: z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        const n = Number(v);
        if (!(n > 0) || n > 100000) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Coverage must be a positive number of sq ft' });
          return null;
        }
        return n;
      }),
    isDefault: checkbox,
    isActive: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.salePrice === null) return;
    if (v.mrp !== null && v.mrp < v.salePrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mrp'], message: 'MRP cannot be less than the selling price' });
    }
  });

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a category name').max(120),
  slug: z.string().trim().max(60).optional().transform((v) => v ?? ''),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\//.test(v), 'Image must be an https:// URL'),
  isActive: checkbox,
});

export const brandSchema = z.object({
  name: z.string().trim().min(2, 'Enter a brand name').max(120),
  slug: z.string().trim().max(60).optional().transform((v) => v ?? ''),
  isPremium: checkbox,
});

export const subcategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2, 'Enter a subcategory name').max(120),
  slug: z.string().trim().max(60).optional().transform((v) => v ?? ''),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const stockAdjustSchema = z.object({
  variantId: z.string().uuid(),
  delta: z.coerce
    .number()
    .int('Enter a whole number of units')
    .refine((v) => v !== 0, 'Enter a non-zero quantity')
    .refine((v) => Math.abs(v) <= 1_000_000, 'Quantity is too large'),
  reason: z.string().trim().min(3, 'Give a reason for the adjustment').max(200),
});

export const reorderSchema = z.object({
  variantId: z.string().uuid(),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000),
});

export const damageSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1, 'Enter at least 1 unit').max(1_000_000),
  reason: z.string().trim().min(3, 'Give a reason').max(200),
});

export function slugFor(name: string, given: string): string {
  const candidate = given ? given : slugify(name);
  return slugPattern.test(candidate) ? candidate : slugify(name) || 'item';
}

export function issuesToFields(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
