'use client';

import Link from 'next/link';
import { StatusIndicator } from '@/components/realtime/status-indicator';
import { useStatusPoll } from '@/components/realtime/use-status-poll';

interface OwnerCounts {
  incomingOrders: number | null;
  cashPending: number | null;
  onlinePending: number | null;
  newQuotations: number | null;
  refundRequests: number | null;
  fingerprint: string | null;
}

/** Notification counts at the top of every owner page. Counts come from the owner's own store only. */
export function OwnerStatusBar() {
  const { state, data } = useStatusPoll<OwnerCounts>('/api/owner/status');
  const items: { label: string; value: number | null | undefined; href: string }[] = [
    { label: 'Incoming orders', value: data?.incomingOrders, href: '/owner/orders' },
    { label: 'Cash pending', value: data?.cashPending, href: '/owner/cash' },
    { label: 'Online pending', value: data?.onlinePending, href: '/owner/orders' },
    { label: 'New quotations', value: data?.newQuotations, href: '/owner/quotations' },
    { label: 'Refund requests', value: data?.refundRequests, href: '/owner/refund-requests' },
  ];

  // Before the first response every item shows a dash. Afterwards, items the owner may not see are removed.
  const visible = data ? items.filter((item) => item.value !== null) : items;
  if (data && visible.length === 0) return null;

  return (
    <section aria-label="Live counts" className="mb-6 grid gap-3 rounded-card border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-burgundy">Needs attention</h2>
        <StatusIndicator state={state} />
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {visible.map((item) => (
          <li key={item.label}>
            <Link href={item.href} className="flex flex-col rounded-control bg-cream px-3 py-2 hover:bg-burgundy/10">
              <span className="text-xs text-ink-muted">{item.label}</span>
              <span className="font-display text-xl text-burgundy">{item.value ?? '–'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
