'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
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

        // Proactively check for a new SW version on every load
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
