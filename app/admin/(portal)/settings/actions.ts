'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PlatformSettingState {
  ok: boolean;
  message?: string;
}

const schema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_.]{2,60}$/, 'Use lowercase letters, digits, dots and underscores'),
  value: z.string().trim().max(4000),
});

/** Saves one platform setting. The value must be a JSON object, so every key has a consistent shape. */
export async function savePlatformSettingAction(_prev: PlatformSettingState, fd: FormData): Promise<PlatformSettingState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({ key: fd.get('key'), value: fd.get('value') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the setting' };

  let json: unknown;
  try {
    json = JSON.parse(parsed.data.value || '{}');
  } catch {
    return { ok: false, message: 'The value must be valid JSON, for example {"enabled": true}' };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, message: 'The value must be a JSON object' };

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from('platform_settings').select('value').eq('key', parsed.data.key).maybeSingle();
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key: parsed.data.key, value: json as Record<string, unknown>, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { ok: false, message: 'Could not save the setting' };

  await recordAdminAudit({ actorId: admin.userId, action: 'platform_setting.saved', entityType: 'platform_setting', before: before ? { value: before.value } : null, after: { key: parsed.data.key, value: json } });
  revalidatePath('/admin/settings');
  return { ok: true, message: 'Setting saved' };
}
