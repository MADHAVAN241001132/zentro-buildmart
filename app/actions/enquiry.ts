'use server';

import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const enquirySchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  businessName: z.string().trim().min(2, 'Showroom or business name is required').max(120),
  businessType: z.string().trim().min(2, 'Please select your business type'),
  mobile: z.string().trim().regex(/^[0-9+() -]{8,18}$/, 'Please enter a valid mobile number'),
  email: z.string().trim().email('Please enter a valid email address'),
  city: z.string().trim().min(2, 'City or location is required').max(100),
  storeCount: z.string().trim().min(1, 'Please select number of stores'),
  selectedPlanId: z.string().uuid().optional().or(z.literal('')),
  interestedFeatures: z.array(z.string()).default([]),
  requirements: z.string().trim().max(2000).optional().default(''),
  consent: z.boolean().refine((val) => val === true, {
    message: 'You must consent to be contacted regarding your enquiry',
  }),
});

export type EnquiryFormInput = z.infer<typeof enquirySchema>;

export type EnquiryFormState = {
  ok: boolean;
  message?: string;
  ticketId?: string;
  errors?: Partial<Record<keyof EnquiryFormInput, string[]>>;
};

export async function submitBusinessEnquiryAction(
  _prevState: EnquiryFormState,
  formData: FormData
): Promise<EnquiryFormState> {
  const rawFeatures = formData.getAll('interestedFeatures') as string[];
  const rawConsent = formData.get('consent');

  const rawData = {
    fullName: formData.get('fullName') as string,
    businessName: formData.get('businessName') as string,
    businessType: formData.get('businessType') as string,
    mobile: formData.get('mobile') as string,
    email: formData.get('email') as string,
    city: formData.get('city') as string,
    storeCount: formData.get('storeCount') as string,
    selectedPlanId: ((formData.get('selectedPlanId') as string) || '').trim(),
    interestedFeatures: rawFeatures,
    requirements: (formData.get('requirements') as string) || '',
    consent: rawConsent === 'on' || rawConsent === 'true',
  };

  const parsed = enquirySchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Please review and correct the errors below.',
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;
  const admin = createSupabaseAdminClient();

  let selectedPlanLabel = 'Not specified';
  if (data.selectedPlanId) {
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('id, name, code, is_active')
      .eq('id', data.selectedPlanId)
      .maybeSingle();
    if (!plan || !plan.is_active) {
      return {
        ok: false,
        message: 'The selected subscription plan is no longer active. Please choose an active plan.',
      };
    }
    selectedPlanLabel = `${plan.name as string} (${plan.code as string})`;
  }

  try {
    // 1. Create a high-priority sales onboarding ticket
    const subject = `Demo Request: ${data.businessName} (${data.city}) — ${data.fullName}`;
    const { data: ticket, error: ticketError } = await admin
      .from('support_tickets')
      .insert({
        subject,
        category: 'onboarding',
        priority: 'high',
        status: 'open',
      })
      .select('id')
      .single();

    if (ticketError || !ticket) {
      console.error('Failed to create enquiry ticket:', ticketError);
      return {
        ok: false,
        message: 'Unable to submit enquiry at this time. Please try again shortly.',
      };
    }

    // 2. Attach enquiry details as a structured message
    const messageBody = [
      `=== ZENTRO BUILDMART BUSINESS DEMO ENQUIRY ===`,
      `Submitted at: ${new Date().toISOString()}`,
      ``,
      `CONTACT INFORMATION:`,
      `• Contact Name: ${data.fullName}`,
      `• Business / Showroom: ${data.businessName}`,
      `• Business Type: ${data.businessType}`,
      `• Mobile Number: ${data.mobile}`,
      `• Email Address: ${data.email}`,
      `• Location / City: ${data.city}`,
      `• Number of Stores: ${data.storeCount}`,
      `• Selected Plan: ${selectedPlanLabel}`,
      ``,
      `INTERESTED CAPABILITIES:`,
      data.interestedFeatures.length > 0
        ? data.interestedFeatures.map((f) => `• ${f}`).join('\n')
        : '• General Demo Request',
      ``,
      `BUSINESS REQUIREMENTS & NOTES:`,
      data.requirements || 'None provided.',
    ].join('\n');

    const { error: msgError } = await admin.from('support_messages').insert({
      ticket_id: ticket.id,
      body: messageBody,
    });

    if (msgError) {
      console.error('Failed to attach enquiry message:', msgError);
    }

    return {
      ok: true,
      ticketId: ticket.id,
      message: 'Thank you! Your business demo enquiry has been successfully received. The ZENTRO Networks team will contact you shortly.',
    };
  } catch (err) {
    console.error('Enquiry submission exception:', err);
    return {
      ok: false,
      message: 'An unexpected error occurred. Please try again.',
    };
  }
}
