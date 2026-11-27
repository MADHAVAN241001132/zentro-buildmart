import type { ReactNode } from 'react';
import { requireOwnerFeature } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';

export default async function CouponsLayout({ children }: { children: ReactNode }) {
  await requireOwnerFeature('coupons', 'store_settings');
  return <>{children}</>;
}
