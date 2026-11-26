import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClass } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { STORE_STATUSES } from '@/lib/validation/admin';

export const dynamic = 'force-dynamic';

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && (STORE_STATUSES as readonly string[]).includes(sp.status) ? sp.status : '';
  const supabase = await createSupabaseServerClient();
  let q = supabase.from('stores').select('id, name, slug, status, city, state, created_at').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const { data: stores, error } = await q;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Stores"
        title="Stores"
        description="Every showroom on the platform. Create stores, edit their details, and activate or suspend them."
        actions={<Link href="/admin/stores/new" className={buttonClass('primary')}>New store</Link>}
      />
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filter by status">
        <Link href="/admin/stores" className={`rounded-full px-3 py-1 ${!status ? 'bg-burgundy text-cream' : 'bg-card text-ink'}`}>All</Link>
        {STORE_STATUSES.map((s) => (
          <Link key={s} href={`/admin/stores?status=${s}`} className={`rounded-full px-3 py-1 capitalize ${status === s ? 'bg-burgundy text-cream' : 'bg-card text-ink'}`}>{s}</Link>
        ))}
      </nav>
      {error ? <p className="text-danger">Could not load stores.</p> : null}
      {!error && (!stores || stores.length === 0) ? (
        <EmptyState title="No stores yet" body="Create the first showroom to start onboarding." action={<Link href="/admin/stores/new" className={buttonClass('primary')}>Create a store</Link>} />
      ) : null}
      {stores && stores.length > 0 ? (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stores.map((s) => (
                <tr key={s.id as string}>
                  <td className="px-4 py-3 font-medium text-ink">{s.name as string}<div className="text-xs text-ink-muted">/store/{s.slug as string}</div></td>
                  <td className="px-4 py-3 text-ink-muted">{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={(s.status as string).toUpperCase()} /></td>
                  <td className="px-4 py-3 text-ink-muted">{new Date(s.created_at as string).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/admin/stores/${s.id as string}`} className="text-burgundy underline">Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
