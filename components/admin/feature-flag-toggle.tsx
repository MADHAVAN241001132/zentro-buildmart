'use client';

import { useOptimistic, useTransition } from 'react';
import { setFeatureFlagAction } from '@/app/admin/(portal)/feature-flags/actions';

interface Props {
  storeId: string;
  featureKey: string;
  enabled: boolean;
  storeName: string;
  featureLabel: string;
}

export function FeatureFlagToggle({ storeId, featureKey, enabled, storeName, featureLabel }: Props) {
  const [isPending, startTransition] = useTransition();
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(enabled);

  function handleToggle() {
    const next = !optimisticEnabled;
    startTransition(async () => {
      setOptimisticEnabled(next);
      const fd = new FormData();
      fd.set('storeId', storeId);
      fd.set('featureKey', featureKey);
      fd.set('enabled', String(next));
      await setFeatureFlagAction(fd);
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimisticEnabled}
      aria-label={`${optimisticEnabled ? 'Disable' : 'Enable'} ${featureLabel} for ${storeName}`}
      disabled={isPending}
      onClick={handleToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-wait disabled:opacity-60 ${
        optimisticEnabled ? 'bg-burgundy' : 'bg-ink-muted/30'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          optimisticEnabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
