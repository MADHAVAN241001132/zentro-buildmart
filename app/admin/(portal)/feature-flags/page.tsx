import { PageHeader } from '@/components/owner/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FEATURE_KEYS } from '@/lib/validation/admin';
import { setFeatureFlagAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function FeatureFlagsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: stores }, { data: flags }] = await Promise.all([
    supabase.from('stores').select('id, name').order('name'),
    supabase.from('feature_flags').select('store_id, feature_key, enabled'),
  ]);
  const on = new Set((flags ?? []).filter((f) => f.enabled).map((f) => `${f.store_id as string}:${f.feature_key as string}`));

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Platform" title="Feature flags" description="Turn modules on or off per store. Each change is audited. Flags apply only where the owner code checks them." />
      {!stores || stores.length === 0 ? <p className="text-sm text-ink-muted">No stores yet.</p> : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Store</th>
                {FEATURE_KEYS.map((k) => <th key={k} className="px-3 py-3">{k.replace(/_/g, ' ')}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stores.map((s) => (
                <tr key={s.id as string}>
                  <td className="px-4 py-3 font-medium text-ink">{s.name as string}</td>
                  {FEATURE_KEYS.map((k) => {
                    const enabled = on.has(`${s.id as string}:${k}`);
                    return (
                      <td key={k} className="px-3 py-3">
                        <form action={setFeatureFlagAction}>
                          <input type="hidden" name="storeId" value={s.id as string} />
                          <input type="hidden" name="featureKey" value={k} />
                          <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
                          <button type="submit" className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled ? 'bg-success/10 text-success' : 'bg-ink-muted/10 text-ink-muted'}`} aria-label={`${enabled ? 'Disable' : 'Enable'} ${k} for ${s.name as string}`}>
                            {enabled ? 'On' : 'Off'}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
