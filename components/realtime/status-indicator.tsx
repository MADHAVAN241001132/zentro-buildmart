'use client';

import { useTranslator } from '@/components/i18n/use-translator';
import type { ConnectionState } from '@/lib/realtime/poll-policy';

const DOT: Record<ConnectionState, string> = {
  live: 'bg-success',
  reconnecting: 'bg-gold',
  offline: 'bg-ink-muted',
};

/** Shows whether live status is current. Announced politely, so it does not interrupt the reader. */
export function StatusIndicator({ state }: { state: ConnectionState }) {
  const t = useTranslator();
  const label = state === 'live' ? t('status.live') : state === 'reconnecting' ? t('status.reconnecting') : t('status.offline');
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-ink-muted">
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${DOT[state]}`} />
      {label}
    </p>
  );
}
