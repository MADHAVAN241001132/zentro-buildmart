import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function PurchasingLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('purchase_orders', 'purchasing');
  return <>{children}</>;
}
