import type { ReactNode } from 'react';
import { requireOwnerPermission } from '@/lib/services/owner';
import { checkFeature } from '@/lib/services/entitlements';

export const dynamic = 'force-dynamic';

/**
 * Reports are a premium feature. When the plan disables them, the screens are replaced by a notice.
 * Invoices, refunds and other financial records stay available through their own pages.
 */
export default async function ReportsLayout({ children }: { children: ReactNode }) {
  const owner = await requireOwnerPermission('reports_exports');
  const blocked = await checkFeature(owner.storeId, 'reports');
  if (!blocked) return <>{children}</>;
  return (
    <div className="grid gap-3 rounded-card border border-line bg-card p-6">
      <h1 className="font-display text-2xl text-burgundy">Reports are not included in your plan</h1>
      <p className="text-sm text-ink-muted">{blocked}</p>
      <p className="text-sm text-ink-muted">Invoices, refunds and other financial records remain available from their own pages.</p>
    </div>
  );
}
