import { z } from 'zod';

const optional = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v));

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === '' || /^[0-9A-Z]{15}$/.test(v), 'GSTIN must be 15 characters')
  .transform((v) => (v === '' ? null : v));

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Enter the supplier name').max(160),
  contactPerson: optional(120),
  phone: z.string().trim().regex(/^[0-9+ ]{0,15}$/, 'Enter a valid phone number').transform((v) => v || null),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).transform((v) => v || null),
  gstin,
  address: optional(300),
  paymentTermsDays: z.coerce.number().int().min(0, 'Use 0 to 365 days').max(365, 'Use 0 to 365 days'),
});

export const batchSchema = z.object({
  variantId: z.string().uuid('Choose a product variant'),
  batchNumber: z.string().trim().min(1, 'Enter a batch number').max(60),
  shadeCode: optional(40),
  calibre: optional(40),
  manufacturingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$|^$/, 'Use YYYY-MM-DD').transform((v) => (v === '' ? null : v)),
  supplierId: z.string().uuid().or(z.literal('')).transform((v) => (v === '' ? null : v)),
  openingQuantity: z.coerce.number().int().min(0, 'Opening stock cannot be negative').max(1000000000),
});

export const batchAdjustSchema = z.object({
  batchId: z.string().uuid(),
  delta: z.coerce.number().int().refine((v) => v !== 0, 'Enter a non-zero quantity'),
  reason: z.string().trim().min(3, 'Give a reason of at least 3 characters').max(200),
});

export const poLineSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(1000000000),
  unitCostPaise: z.number().int().min(0),
});

export const receiptLineSchema = z.object({
  poItemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(1000000000),
  damaged: z.coerce.number().int().min(0).max(1000000000),
  batchNumber: z.string().trim().max(60).transform((v) => (v === '' ? null : v)),
});

export const PAYMENT_METHODS = ['cash', 'bank', 'upi', 'cheque'] as const;
