import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function TileBatchesLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('tile_batches', 'tile_batch_management');
  return <>{children}</>;
}
