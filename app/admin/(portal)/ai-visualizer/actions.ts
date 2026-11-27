'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const settingsSchema = z.object({
  storeId: z.string().uuid(),
  monthlyLimit: z.coerce.number().int().min(0).max(50_000),
  dailyLimit: z.coerce.number().int().min(0).max(5_000),
  guestSessionDailyLimit: z.coerce.number().int().min(1).max(500),
  defaultModel: z.string().trim().min(2).max(80),
  previewModel: z.string().trim().min(2).max(80),
  imageQuality: z.enum(['low', 'medium', 'high', 'auto']),
});

export async function saveStoreAiSettingsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    storeId: formData.get('storeId'),
    monthlyLimit: formData.get('monthlyLimit'),
    dailyLimit: formData.get('dailyLimit'),
    guestSessionDailyLimit: formData.get('guestSessionDailyLimit'),
    defaultModel: formData.get('defaultModel'),
    previewModel: formData.get('previewModel'),
    imageQuality: formData.get('imageQuality'),
  });
  if (!parsed.success) return;

  const d = parsed.data;
  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient
    .from('ai_visualizer_store_settings')
    .upsert({
      store_id: d.storeId,
      monthly_limit: d.monthlyLimit,
      daily_limit: d.dailyLimit,
      guest_session_daily_limit: d.guestSessionDailyLimit,
      default_model: d.defaultModel,
      preview_model: d.previewModel,
      image_quality: d.imageQuality,
      updated_at: new Date().toISOString(),
    });

  if (error) return;

  await recordAdminAudit({
    actorId: admin.userId,
    storeId: d.storeId,
    action: 'ai_visualizer.settings_updated',
    entityType: 'ai_visualizer_store_settings',
    entityId: d.storeId,
    after: d,
  });

  revalidatePath('/admin/ai-visualizer');
}
