import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TicketUpdateForm } from '@/components/admin/ticket-update-form';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatIST } from '@/lib/format-ist';
import { Mail, Phone } from 'lucide-react';

export const dynamic = 'force-dynamic';

function extractField(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`(?:•|-)\\s*${escaped}:\\s*(.+)`, 'i'));
  return match?.[1]?.trim() || null;
}

export default async function SupportPage() {
  const supabase = await createSupabaseServerClient();
  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('id, subject, category, priority, status, created_at, stores(name), support_messages(id, body, created_at)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        eyebrow="Support & Demo Enquiries"
        title="Support tickets"
        description="Demo requests from the public website and support tickets raised by store owners. Click any entry to view full submitted details."
      />
      {!tickets || tickets.length === 0 ? (
        <EmptyState title="No tickets" body="Demo requests and owner support tickets will appear here." />
      ) : (
        <ul className="grid min-w-0 gap-3">
          {tickets.map((t) => {
            const store = Array.isArray(t.stores) ? t.stores[0] : t.stores;
            const messages = Array.isArray(t.support_messages) ? t.support_messages : [];
            const firstBody = (messages[0] as { body?: string } | undefined)?.body ?? '';
            const mobile = firstBody ? extractField(firstBody, 'Mobile Number') : null;
            const email = firstBody ? extractField(firstBody, 'Email Address') : null;
            const selectedPlan = firstBody ? extractField(firstBody, 'Selected Plan') : null;

            return (
              <li key={t.id as string} className="grid min-w-0 gap-3 rounded-card border border-line bg-card p-4 shadow-xs">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="grid min-w-0 gap-1">
                    <p className="font-semibold text-ink [overflow-wrap:anywhere]">{t.subject as string}</p>
                    <p className="text-xs text-ink-muted">
                      {(store as { name?: string } | null)?.name ?? 'Public Demo Request'} · {t.category as string} ·{' '}
                      {formatIST(t.created_at as string)}
                      {selectedPlan && selectedPlan !== 'Not specified' ? ` · Plan: ${selectedPlan}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {mobile ? (
                      <a
                        href={`tel:${mobile.replace(/[^+\d]/g, '')}`}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-control border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-burgundy hover:border-burgundy"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <span>Call</span>
                      </a>
                    ) : null}
                    {email ? (
                      <a
                        href={`mailto:${email}`}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-control border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-burgundy hover:border-burgundy"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>Email</span>
                      </a>
                    ) : null}
                    <TicketUpdateForm
                      ticketId={t.id as string}
                      initialStatus={t.status as string}
                      initialPriority={t.priority as string}
                    />
                  </div>
                </div>

                {messages.length > 0 ? (
                  <details className="rounded-control border border-line bg-cream/50 px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-semibold text-burgundy">
                      View submitted request details ({messages.length})
                    </summary>
                    <div className="mt-3 grid gap-3">
                      {messages.map((m) => (
                        <pre
                          key={(m as { id: string }).id}
                          className="whitespace-pre-wrap break-words rounded-control border border-line bg-white p-3 font-sans text-xs leading-relaxed text-ink"
                        >
                          {(m as { body: string }).body}
                        </pre>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="text-xs text-ink-muted">No additional message details were recorded for this ticket.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
