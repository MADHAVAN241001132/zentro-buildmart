import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { setOwnerActiveAction } from './actions';
import { OwnerForm } from './owner-form';

export const dynamic = 'force-dynamic';

export default async function OwnersPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: links }, { data: stores }] = await Promise.all([
    supabase.from('store_owners').select('store_id, profile_id, role, is_active, stores(name), profiles(full_name)').order('created_at', { ascending: false }).limit(300),
    supabase.from('stores').select('id, name').order('name'),
  ]);

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Accounts" title="Owners" description="Owner, manager and staff accounts linked to stores. Accounts are created here; owners sign in at /owner/login." />
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Create an owner account</h2>
        {!stores || stores.length === 0 ? (
          <p className="text-sm text-ink-muted">Create a store first.</p>
        ) : (
          <OwnerForm stores={stores.map((s) => ({ id: s.id as string, name: s.name as string }))} />
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Linked accounts</h2>
        {!links || links.length === 0 ? (
          <EmptyState title="No owner accounts yet" body="Create an owner account above to link a person to a store." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {links.map((l) => {
                  const store = Array.isArray(l.stores) ? l.stores[0] : l.stores;
                  const profile = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
                  return (
                    <tr key={`${l.store_id}-${l.profile_id}`}>
                      <td className="px-4 py-3 font-medium text-ink">{(profile as { full_name?: string } | null)?.full_name ?? 'Unnamed'}</td>
                      <td className="px-4 py-3 text-ink-muted">{(store as { name?: string } | null)?.name ?? '—'}</td>
                      <td className="px-4 py-3 capitalize text-ink-muted">{l.role as string}</td>
                      <td className="px-4 py-3">{l.is_active ? 'Active' : 'Inactive'}</td>
                      <td className="px-4 py-3 text-right">
                        <form action={setOwnerActiveAction} className="inline">
                          <input type="hidden" name="storeId" value={l.store_id as string} />
                          <input type="hidden" name="profileId" value={l.profile_id as string} />
                          <input type="hidden" name="active" value={l.is_active ? 'false' : 'true'} />
                          {l.is_active ? (
                            <ConfirmSubmit message="Deactivate this account? The person will lose access to this store.">Deactivate</ConfirmSubmit>
                          ) : (
                            <ConfirmSubmit message="Reactivate this account?">Reactivate</ConfirmSubmit>
                          )}
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
