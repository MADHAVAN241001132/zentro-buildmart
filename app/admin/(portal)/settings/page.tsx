import { PageHeader } from '@/components/owner/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SettingForm } from './setting-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase.from('platform_settings').select('key, value, updated_at').order('key');
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Platform" title="Settings" description="Platform-wide values stored as JSON objects. Changes are audited. Secrets such as API keys never belong here; they live in environment variables." />
      <SettingForm />
      {!rows || rows.length === 0 ? <p className="text-sm text-ink-muted">No platform settings saved yet.</p> : (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {rows.map((r) => (
            <li key={r.key as string} className="grid gap-1 px-4 py-3 text-sm">
              <span className="font-mono font-medium text-ink">{r.key as string}</span>
              <pre className="overflow-x-auto text-xs text-ink-muted">{JSON.stringify(r.value, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
