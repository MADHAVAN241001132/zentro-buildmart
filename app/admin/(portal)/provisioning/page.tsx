import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ProvisioningForm } from '@/components/admin/provisioning-form';
import { requireAdmin } from '@/lib/services/admin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { cancelRequestAction, linkExistingAction, resetUncertainAction, resumeRequestAction } from './actions';

export const dynamic = 'force-dynamic';

const STATES = ['REQUESTED', 'AUTH_PENDING', 'AUTH_CREATED', 'MEMBERSHIP_PENDING', 'MEMBERSHIP_LINKED', 'ONBOARDING_LINKED', 'COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED'] as const;

/** Lists provisioning requests for review. Credentials are never selected: the table holds none. */
export default async function ProvisioningPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const status = STATES.find((s) => s === params.status);
  const query = (params.q ?? '').trim().slice(0, 120);
  const admin = createSupabaseAdminClient();

  let request = admin
    .from('account_provisioning_requests')
    .select('id, status, email, full_name, role, store_id, profile_id, attempts:attempt_count, reconciliation_reason, failure_code, failure_message, updated_at, stores(name)')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (status) request = request.eq('status', status);
  if (query) request = request.ilike('email', `%${query.replace(/[%_]/g, '')}%`);
  const { data: rows, error } = await request;

  const selected = params.id ? rows?.find((r) => r.id === params.id) ?? null : null;
  const { data: events } = selected
    ? await admin.from('account_provisioning_events').select('from_status, to_status, attempt, code, created_at').eq('request_id', selected.id).order('created_at', { ascending: false }).limit(50)
    : { data: null };

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Accounts"
        title="Account provisioning"
        description="Requests for owner, manager and staff accounts. Reviewing a request never deletes an Auth account and never shows a password."
      />
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-xs text-ink-muted">
          Search by email
          <input name="q" defaultValue={query} className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink" />
        </label>
        <label className="grid gap-1 text-xs text-ink-muted">
          Status
          <select name="status" defaultValue={status ?? ''} className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
            <option value="">All</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-input bg-burgundy px-4 py-2 text-sm text-cream">Filter</button>
      </form>

      {error ? (
        <p className="text-sm text-danger">The requests could not be loaded.</p>
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="No requests" body="Requests appear here when an account is created or needs review." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3">{r.email}</td>
                  <td className="px-4 py-3">{r.role}</td>
                  <td className="px-4 py-3">{(r.stores as unknown as { name: string } | null)?.name ?? '—'}</td>
                  <td className="px-4 py-3">{r.status}{r.reconciliation_reason ? ` (${r.reconciliation_reason})` : ''}</td>
                  <td className="px-4 py-3">{r.attempts}</td>
                  <td className="px-4 py-3">{new Date(r.updated_at as string).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3"><a className="text-burgundy underline" href={`?id=${r.id}`}>Details</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <section className="grid gap-4 rounded-card border border-line bg-card p-5">
          <h2 className="font-display text-2xl text-burgundy">{selected.email}</h2>
          <dl className="grid gap-1 text-sm">
            <div>Status: {selected.status}</div>
            <div>Account id: {selected.profile_id ?? 'not created yet'}</div>
            <div>Failure: {selected.failure_code ?? 'none'} {selected.failure_message ? `— ${selected.failure_message}` : ''}</div>
          </dl>

          <div className="grid gap-3 md:grid-cols-2">
            {selected.status !== 'COMPLETED' && selected.status !== 'RECONCILIATION_REQUIRED' && (
              <ProvisioningForm
                action={resumeRequestAction}
                requestId={selected.id}
                label="Resume"
                variant="primary"
                fields={selected.profile_id ? [] : [{ name: 'password', label: 'Password (needed to create the account; not stored)', type: 'password', minLength: 8 }]}
              />
            )}
            {selected.status === 'RECONCILIATION_REQUIRED' && selected.reconciliation_reason === 'auth_outcome_uncertain' && (
              <ProvisioningForm
                action={resetUncertainAction}
                requestId={selected.id}
                label="Confirm no account was created"
                fields={[{ name: 'note', label: 'Note (at least 10 characters)', minLength: 10 }]}
              />
            )}
            {selected.status === 'RECONCILIATION_REQUIRED' && selected.reconciliation_reason === 'existing_account' && (
              <ProvisioningForm
                action={linkExistingAction}
                requestId={selected.id}
                label="Link existing account"
                fields={[
                  { name: 'profile_id', label: 'Existing account id (verified email must match the request)' },
                  { name: 'confirm_email', label: 'Retype the request email to confirm' },
                  { name: 'note', label: 'Note: how the account holder was verified (at least 10 characters)', minLength: 10 },
                ]}
              />
            )}
            {selected.status !== 'COMPLETED' && (
              <ProvisioningForm
                action={cancelRequestAction}
                requestId={selected.id}
                label="Cancel request"
                fields={[{ name: 'note', label: 'Note (at least 10 characters)', minLength: 10 }]}
              />
            )}
          </div>

          <h3 className="font-display text-xl text-burgundy">History</h3>
          {!events || events.length === 0 ? (
            <p className="text-sm text-ink-muted">No events recorded.</p>
          ) : (
            <ol className="grid gap-1 text-sm">
              {events.map((e, i) => (
                <li key={i}>
                  {new Date(e.created_at as string).toLocaleString('en-IN')} · {e.from_status ?? '—'} → {e.to_status} · attempt {e.attempt}{e.code ? ` · ${e.code}` : ''}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
