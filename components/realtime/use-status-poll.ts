'use client';

import { useEffect, useRef, useState } from 'react';
import { connectionState, hasChanged, nextDelayMs, type ConnectionState } from '@/lib/realtime/poll-policy';

interface Fingerprinted {
  fingerprint: string | null;
}

/**
 * Polls an authorised server endpoint for a status snapshot. No browser subscription to the database is
 * opened, so no client can receive rows it is not allowed to read.
 *
 * - Pauses polling while the tab is hidden and refreshes at once when it becomes visible again.
 * - Backs off after failures and resumes on the browser's online event.
 * - Calls onChange only when the fingerprint changes, so duplicate responses do nothing.
 * - Aborts the in-flight request and clears the timer on unmount.
 */
export function useStatusPoll<T extends Fingerprinted>(url: string | null, onChange?: (next: T) => void) {
  const [data, setData] = useState<T | null>(null);
  const [failures, setFailures] = useState(0);
  const [online, setOnline] = useState(true);
  const latest = useRef<T | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!url) return;

    let stopped = false;
    let failureCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const visible = () => document.visibilityState !== 'hidden';

    function schedule(delay: number) {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), delay);
    }

    async function tick() {
      if (stopped) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(url as string, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const next = (await response.json()) as T;
        failureCount = 0;
        setFailures(0);
        setOnline(true);

        const previous = latest.current;
        const changed = hasChanged(previous?.fingerprint ?? null, next.fingerprint);
        latest.current = next;
        setData(next);
        if (previous !== null && changed) onChangeRef.current?.(next);
      } catch (error) {
        // An aborted request was replaced by a newer one, which schedules its own next poll.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        failureCount += 1;
        setFailures(failureCount);
        if (typeof navigator !== 'undefined' && !navigator.onLine) setOnline(false);
      }
      schedule(nextDelayMs(failureCount, visible()));
    }

    function onVisibilityChange() {
      if (visible() && !stopped) {
        if (timer) clearTimeout(timer);
        void tick();
      }
    }
    function onOnline() {
      setOnline(true);
      if (!stopped) {
        if (timer) clearTimeout(timer);
        void tick();
      }
    }
    function onOffline() {
      setOnline(false);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      latest.current = null;
    };
  }, [url]);

  const state: ConnectionState = url ? connectionState(failures, online) : 'live';
  return { state, data };
}
