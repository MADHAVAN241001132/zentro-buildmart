'use client';

import { useRouter } from 'next/navigation';
import { useStatusPoll } from '@/components/realtime/use-status-poll';

interface FeatureFingerprint {
  fingerprint: string | null;
}

/** Keeps an open guest storefront synchronized when feature flags or assignments change in Super Admin. */
export function StoreFeatureSync({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  useStatusPoll<FeatureFingerprint>(`/api/store/${storeSlug}/features`, () => router.refresh());
  return null;
}
