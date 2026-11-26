import type { ReactNode } from 'react';
import { requireOwnerPermission } from '@/lib/services/owner';
import { checkFeature } from '@/lib/services/entitlements';

export const dynamic = 'force-dynamic';

/** QR analytics is a premium feature. When the plan disables it, the page is replaced by a notice. */
export default async function QrAnalyticsLayout({ children }: { children: ReactNode }) {
  const owner = await requireOwnerPermission('qr_analytics');
  const blocked = await checkFeature(owner.storeId, 'qr_scan_analytics');
  if (!blocked) return <>{children}</>;
  return (
    <div className="grid gap-3 rounded-card border border-line bg-card p-6">
      <h1 className="font-display text-2xl text-burgundy">QR analytics is not included in your plan</h1>
      <p className="text-sm text-ink-muted">{blocked}</p>
    </div>
  );
}
