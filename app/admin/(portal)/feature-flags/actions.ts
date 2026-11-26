'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { flagSchema } from '@/lib/validation/admin';

export async function setFeatureFlagAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = flagSchema.safeParse({
    storeId: String(formData.get('storeId') ?? ''),
    featureKey: String(formData.get('featureKey') ?? ''),
    enabled: formData.get('enabled') === 'true',
  });
  if (!parsed.success) return;
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('feature_flags').select('enabled').eq('store_id', d.storeId).eq('feature_key', d.featureKey).maybeSingle();
  const { error } = await supabase
    .from('feature_flags')
    .upsert({ store_id: d.storeId, feature_key: d.featureKey, enabled: d.enabled, updated_at: new Date().toISOString() }, { onConflict: 'store_id,feature_key' });
  if (error) return;

  await recordAdminAudit({ actorId: admin.userId, storeId: d.storeId, action: 'feature.toggled', entityType: 'feature_flag', after: { feature_key: d.featureKey, enabled: d.enabled }, before: { enabled: before?.enabled ?? false } });
  revalidatePath('/admin/feature-flags');
}
