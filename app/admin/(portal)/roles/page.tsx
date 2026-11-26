import { PageHeader } from '@/components/owner/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: roles }, { data: permissions }, { data: grants }] = await Promise.all([
    supabase.from('roles').select('code, description').order('code'),
    supabase.from('permissions').select('code, description').order('code'),
    supabase.from('role_permissions').select('role_code, permission_code'),
  ]);
  const granted = new Set((grants ?? []).map((g) => `${g.role_code as string}:${g.permission_code as string}`));

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Security" title="Roles and permissions" description="The role and permission catalogue as stored in the database. This view is read-only. Access is enforced by row-level security and server checks, not by these labels alone." />
      {!roles || roles.length === 0 ? <p className="text-sm text-ink-muted">No roles are defined.</p> : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="min-w-full text-xs">
            <thead className="bg-cream text-left uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Permission</th>
                {roles.map((r) => <th key={r.code as string} className="px-3 py-2 text-center">{r.code as string}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(permissions ?? []).map((p) => (
                <tr key={p.code as string}>
                  <td className="px-3 py-2 text-ink">{p.code as string}<div className="text-ink-muted">{p.description as string}</div></td>
                  {roles.map((r) => (
                    <td key={r.code as string} className="px-3 py-2 text-center">{granted.has(`${r.code as string}:${p.code as string}`) ? '✓' : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
