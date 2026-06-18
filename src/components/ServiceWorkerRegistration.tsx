'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Guard against double-reloads when two SWs (sw.js + firebase-messaging-sw.js)
    // both activate in quick succession — the second controllerchange fires after
    // the first reload, on the new page, so `refreshing` resets to false.
    // sessionStorage persists across reloads in the same tab, giving us a
    // cross-reload cooldown window.
    const SW_RELOAD_KEY = 'sw-reloaded-at';
    const SW_RELOAD_COOLDOWN_MS = 15_000;
    const SW_UPDATE_CHECK_KEY = 'sw-last-update-check';
    const SW_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      try {
        const last = parseInt(sessionStorage.getItem(SW_RELOAD_KEY) || '0', 10);
        if (Date.now() - last < SW_RELOAD_COOLDOWN_MS) return;
        sessionStorage.setItem(SW_RELOAD_KEY, String(Date.now()));
      } catch {}
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Register the app's caching service worker (handles PWA offline & cache).
    // firebase-messaging-sw.js is registered separately by FCMTokenRegistration.
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        // Activate any already-waiting SW immediately
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // When a new SW finishes installing, skip waiting and take control
        registration.addEventListener('updatefound', () => {
          const newSW = registration.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              newSW.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Check for a new SW version, but do not force a network update on every app entry.
        try {
          const last = parseInt(localStorage.getItem(SW_UPDATE_CHECK_KEY) || '0', 10);
          if (Date.now() - last < SW_UPDATE_CHECK_INTERVAL_MS) return;
          localStorage.setItem(SW_UPDATE_CHECK_KEY, String(Date.now()));
        } catch {}
        void registration.update();
      })
      .catch((error) => {
        console.warn('SW registration failed:', error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
