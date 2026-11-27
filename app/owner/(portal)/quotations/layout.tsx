import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function QuotationsLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('quotations', 'quotations');
  return <>{children}</>;
}
