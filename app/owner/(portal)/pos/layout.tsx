import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function PosLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('pos_billing', 'pos_billing');
  return <>{children}</>;
}
