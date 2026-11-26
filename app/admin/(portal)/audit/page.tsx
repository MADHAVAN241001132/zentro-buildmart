import { PageHeader } from '@/components/owner/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const sp = await searchParams;
  const action = (sp.action ?? '').replace(/[^a-z0-9._-]/gi, '').slice(0, 60);
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('audit_logs')
    .select('id, action, entity_type, actor_type, before_state, after_state, created_at, stores(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (action) q = q.ilike('action', `%${action}%`);
  const { data: rows, error } = await q;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Security" title="Audit logs" description="Who changed what, and when. The 200 most recent entries are shown; filter by action text." />
      <form className="flex flex-wrap items-end gap-2" action="/admin/audit">
        <label className="grid gap-1 text-sm">
          <span className="text-ink">Action contains</span>
          <input name="action" defaultValue={action} className="rounded-control border border-line bg-white px-3 py-2" />
        </label>
        <button type="submit" className="rounded-control border border-line px-4 py-2 text-sm hover:bg-cream">Filter</button>
      </form>
      {error ? <p className="text-danger">Could not load audit logs.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="min-w-full text-xs">
            <thead className="bg-cream text-left uppercase tracking-wide text-ink-muted">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Store</th><th className="px-3 py-2">Change</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;
                return (
                  <tr key={r.id as string} className="align-top">
                    <td className="px-3 py-2 text-ink-muted">{new Date(r.created_at as string).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 font-medium text-ink">{r.action as string}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.entity_type as string}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.actor_type as string}</td>
                    <td className="px-3 py-2 text-ink-muted">{(store as { name?: string } | null)?.name ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">{JSON.stringify({ before: r.before_state, after: r.after_state })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-ink-muted">No audit entries match.</p>}
    </div>
  );
}
