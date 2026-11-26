'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * DEV-ONLY. Rendered only when the server confirms the simulator is allowed.
 * Simulated payments are labelled as simulated everywhere they appear.
 */
export function SimulatorPayButtons({ providerOrderId, amountPaise }: { providerOrderId: string; amountPaise: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(outcome: 'success' | 'failure') {
    startTransition(async () => {
      const res = await fetch('/api/payments/simulator/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerOrderId, amountPaise, outcome }),
      });
      setMessage(res.ok ? `Simulated ${outcome} recorded` : 'Simulator request was refused');
      router.refresh();
    });
  }

  return (
    <div className="rounded-card border-2 border-dashed border-warning bg-warning/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-warning">Development simulator · not a real payment</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => run('success')} disabled={pending}>Simulate success</Button>
        <Button type="button" variant="secondary" onClick={() => run('failure')} disabled={pending}>Simulate failure</Button>
      </div>
      {message ? <p className="mt-2 text-sm text-ink-muted">{message}</p> : null}
    </div>
  );
}
