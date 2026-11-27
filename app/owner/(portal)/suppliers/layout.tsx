import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function SuppliersLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('purchase_orders', 'supplier_management');
  return <>{children}</>;
}
