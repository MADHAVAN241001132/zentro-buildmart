import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { getStoreBySlug } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

export default async function QuotesLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store || !(await isFeatureEnabled(store.id, 'quotations'))) notFound();
  return <>{children}</>;
}
