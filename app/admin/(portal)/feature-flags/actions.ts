'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { flagSchema } from '@/lib/validation/admin';

export async function setFeatureFlagAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = flagSchema.safeParse({
    storeId: String(formData.get('storeId') ?? ''),
    featureKey: String(formData.get('featureKey') ?? ''),
    enabled: formData.get('enabled') === 'true',
  });
  if (!parsed.success) {
    console.error('Feature flag validation failed:', parsed.error);
    return;
  }
  const d = parsed.data;

  // Use service role admin client to bypass RLS and guarantee atomic update
  const adminClient = createSupabaseAdminClient();
  const { data: before } = await adminClient
    .from('feature_flags')
    .select('enabled')
    .eq('store_id', d.storeId)
    .eq('feature_key', d.featureKey)
    .maybeSingle();

  const { error } = await adminClient
    .from('feature_flags')
    .upsert(
      { store_id: d.storeId, feature_key: d.featureKey, enabled: d.enabled, updated_at: new Date().toISOString() },
      { onConflict: 'store_id,feature_key' }
    );

  if (error) {
    console.error('Failed to upsert feature flag in DB:', error);
    return;
  }

  try {
    await recordAdminAudit({
      actorId: admin.userId,
      storeId: d.storeId,
      action: 'feature.toggled',
      entityType: 'feature_flag',
      after: { feature_key: d.featureKey, enabled: d.enabled },
      before: { enabled: before?.enabled ?? false },
    });
  } catch (auditErr) {
    console.error('Audit log failed (non-fatal):', auditErr);
  }

  // Purge cache everywhere so disabled features immediately disappear and stay disappeared
  revalidatePath('/admin/feature-flags');
  revalidatePath('/owner', 'layout');
  revalidatePath('/store', 'layout');
  revalidatePath('/', 'layout');
}
