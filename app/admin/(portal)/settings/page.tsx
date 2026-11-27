import { PageHeader } from '@/components/owner/page-header';
import { PlatformSettingsDashboard } from '@/components/admin/platform-settings-dashboard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SettingForm } from './setting-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase.from('platform_settings').select('key, value, updated_at').order('key');

  const initial: Record<string, Record<string, unknown>> = {};
  const rawRows = (rows ?? []).map((r) => {
    const key = r.key as string;
    const val = (r.value as Record<string, unknown> | null) ?? {};
    initial[key] = val;
    return { key, value: val, updated_at: r.updated_at as string };
  });

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        eyebrow="Platform"
        title="Platform Settings"
        description="Configure general identity, landing page details, store defaults, billing policies, notifications, support, and security. All changes are audited."
      />
      <PlatformSettingsDashboard initial={initial} rawRows={rawRows} advancedSlot={<SettingForm />} />
    </div>
  );
}
