import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

/** Reports are gated by role permission and store feature flag/assignment. */
export default async function ReportsLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('reports', 'reports_exports');
  return <>{children}</>;
}
