import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function CustomersLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('credit_ledger', 'customer_management');
  return <>{children}</>;
}
