import Link from 'next/link';
import { isPermissionKey, permissionLabel } from '@/lib/authz/permissions';

export const metadata = { title: 'Access denied | ZENTRO' };

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ permission?: string }>;
}) {
  const params = await searchParams;
  const requested = typeof params.permission === 'string' && isPermissionKey(params.permission) ? params.permission : null;

  return (
    <section className="mx-auto max-w-xl space-y-4 rounded-card border border-line bg-card p-6">
      <h1 className="font-display text-2xl text-burgundy-deep">Access denied</h1>
      <p className="text-sm text-ink-muted">
        {requested
          ? `Your role in this store does not include ${permissionLabel(requested).toLowerCase()}. Ask an owner to grant it if you need this area.`
          : 'Your role in this store does not include access to this area. Ask an owner to review your permissions.'}
      </p>
      <Link href="/owner" className="inline-block text-sm text-burgundy underline">
        Back to dashboard
      </Link>
    </section>
  );
}
