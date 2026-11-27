import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function DeliveriesLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('delivery', 'order_management');
  return <>{children}</>;
}
