import { z } from 'zod';
import { GST_REGISTRATION_VALUES, gstRequirementMessage, gstinFormatMessage, normaliseGstin } from '@/lib/onboarding/legal-rules';

/** Legal and tax profile of a store. Used by onboarding step 3 and by the Admin store screen. */
export const legalProfileSchema = z
  .object({
    legalName: z.string().trim().min(1, 'Enter the registered business name').max(160),
    gstin: z
      .string()
      .transform((v) => normaliseGstin(v ?? ''))
      .superRefine((v, ctx) => {
        const message = v === null ? null : gstinFormatMessage(v);
        if (message) ctx.addIssue({ code: 'custom', message });
      }),
    businessState: z.string().trim().min(1, 'Enter the business state').max(80),
    billingAddress: z.string().trim().min(1, 'Enter the billing address').max(300),
    gstRegistration: z.enum(GST_REGISTRATION_VALUES, { message: 'Choose the GST registration type' }),
    pricesIncludeGst: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const message = gstRequirementMessage(value.gstRegistration, value.gstin);
    if (message) ctx.addIssue({ code: 'custom', path: ['gstin'], message });
  });

export type LegalProfile = z.infer<typeof legalProfileSchema>;
