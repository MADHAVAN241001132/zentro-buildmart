import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function BulkImportLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('bulk_imports', 'product_management');
  return <>{children}</>;
}
