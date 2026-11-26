import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/validation/admin';
import { updateTicketAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const supabase = await createSupabaseServerClient();
  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('id, subject, category, priority, status, created_at, stores(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Support" title="Support tickets" description="Requests raised by store owners. Update status and priority; each change is audited." />
      {!tickets || tickets.length === 0 ? (
        <EmptyState title="No tickets" body="Owners raise tickets from the owner portal. None have been created yet." />
      ) : (
        <ul className="grid gap-3">
          {tickets.map((t) => {
            const store = Array.isArray(t.stores) ? t.stores[0] : t.stores;
            return (
              <li key={t.id as string} className="grid gap-3 rounded-card border border-line bg-card p-4 md:grid-cols-[1fr_auto]">
                <div className="grid gap-1">
                  <p className="font-medium text-ink">{t.subject as string}</p>
                  <p className="text-xs text-ink-muted">{(store as { name?: string } | null)?.name ?? 'No store'} · {t.category as string} · opened {new Date(t.created_at as string).toLocaleDateString('en-IN')}</p>
                </div>
                <form action={updateTicketAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="ticketId" value={t.id as string} />
                  <label className="sr-only" htmlFor={`s-${t.id as string}`}>Status</label>
                  <select id={`s-${t.id as string}`} name="status" defaultValue={t.status as string} className="rounded-control border border-line bg-white px-2 py-1.5 text-sm">
                    {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`p-${t.id as string}`}>Priority</label>
                  <select id={`p-${t.id as string}`} name="priority" defaultValue={t.priority as string} className="rounded-control border border-line bg-white px-2 py-1.5 text-sm">
                    {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button type="submit" className="rounded-control border border-line px-3 py-1.5 text-sm hover:bg-cream">Save</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
