'use client';

import { useRouter } from 'next/navigation';
import { useStatusPoll } from '@/components/realtime/use-status-poll';
import { StatusIndicator } from '@/components/realtime/status-indicator';

interface GuestSnapshot {
  fingerprint: string | null;
}

/**
 * Keeps an open order page current. It polls the guest's own status endpoint, which is scoped to the
 * guest session cookie. When the snapshot changes, the page is refreshed so the server renders the
 * verified records. The browser never receives payment state directly, and a notification is never
 * treated as proof of payment.
 */
export function OrderStatusPoller({ active, storeSlug }: { active: boolean; storeSlug: string }) {
  const router = useRouter();
  const { state } = useStatusPoll<GuestSnapshot>(active ? `/api/store/${storeSlug}/status` : null, () => router.refresh());
  if (!active) return null;
  return <StatusIndicator state={state} />;
}
