'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslator } from '@/components/i18n/use-translator';
import { INSTALL_DISMISSED_KEY, isIosSafari, isStandalone, shouldOfferInstall } from '@/lib/pwa/support';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Mounted once in the root layout. It registers the service worker in production only, and shows:
 * an update banner (the new worker waits until the guest chooses to update), a connectivity notice,
 * and an install prompt (native prompt where the browser offers one, iOS Safari instructions otherwise).
 */
export function PwaShell() {
  const t = useTranslator();
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [offerInstall, setOfferInstall] = useState(false);

  // Service worker registration and update detection.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        registrationRef.current = registration;
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
      })
      .catch(() => {
        // Registration can fail on plain HTTP or in private windows. The app works without it.
      });

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  // Connectivity indication.
  useEffect(() => {
    setOnline(navigator.onLine);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const goOnline = () => {
      setOnline(true);
      setJustReconnected(true);
      timer = setTimeout(() => setJustReconnected(false), 3000);
    };
    const goOffline = () => {
      setOnline(false);
      setJustReconnected(false);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Install prompt. Native prompts appear on Chromium browsers; iOS Safari gets written instructions.
  useEffect(() => {
    const standalone = isStandalone(
      window.matchMedia('(display-mode: standalone)').matches,
      (navigator as Navigator & { standalone?: boolean }).standalone,
    );
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
    } catch {
      dismissed = false;
    }
    const allowed = shouldOfferInstall({ standalone, dismissed });
    setOfferInstall(allowed);
    if (allowed && isIosSafari(navigator.userAgent, navigator.maxTouchPoints)) setShowIosHint(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setOfferInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function applyUpdate() {
    registrationRef.current?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }

  function dismissInstall() {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // Storage may be blocked. The prompt simply reappears next visit.
    }
    setOfferInstall(false);
    setShowIosHint(false);
    setInstallEvent(null);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  const showNativeInstall = offerInstall && installEvent !== null;
  const showIos = offerInstall && showIosHint;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3">
      {!online ? (
        <p role="status" className="pointer-events-auto rounded-md bg-ink px-4 py-2 text-sm text-cream shadow">
          {t('status.offline')}
        </p>
      ) : justReconnected ? (
        <p role="status" className="pointer-events-auto rounded-md bg-success px-4 py-2 text-sm text-cream shadow">
          {t('status.backOnline')}
        </p>
      ) : null}

      {updateReady ? (
        <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-md bg-card px-4 py-3 text-sm text-ink shadow-lg ring-1 ring-line">
          <span>{t('pwa.updateAvailable')}</span>
          <button type="button" onClick={applyUpdate} className="rounded bg-burgundy px-3 py-1.5 font-semibold text-cream">
            {t('pwa.update')}
          </button>
        </div>
      ) : null}

      {showNativeInstall ? (
        <div role="region" aria-label={t('pwa.install')} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-md bg-card px-4 py-3 text-sm text-ink shadow-lg ring-1 ring-line">
          <span>{t('pwa.installHint')}</span>
          <button type="button" onClick={install} className="rounded bg-burgundy px-3 py-1.5 font-semibold text-cream">
            {t('pwa.install')}
          </button>
          <button type="button" onClick={dismissInstall} className="text-ink-muted underline">
            {t('pwa.later')}
          </button>
        </div>
      ) : null}

      {showIos && !showNativeInstall ? (
        <div role="region" aria-label={t('pwa.install')} className="pointer-events-auto flex max-w-md items-start gap-3 rounded-md bg-card px-4 py-3 text-sm text-ink shadow-lg ring-1 ring-line">
          <span>{t('pwa.iosInstall')}</span>
          <button type="button" onClick={dismissInstall} className="shrink-0 text-ink-muted underline">
            {t('pwa.dismiss')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
