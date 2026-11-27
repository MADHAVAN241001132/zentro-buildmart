import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

/** QR analytics is gated by role permission and store feature flag/assignment. */
export default async function QrAnalyticsLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('qr_scan_analytics', 'qr_analytics');
  return <>{children}</>;
}
