'use client';

import { useEffect, useState } from 'react';
import { getToken } from 'firebase/messaging';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { getFirebaseMessaging, auth } from '@/lib/firebase';

export async function registerFcmToken(uid: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (typeof window === 'undefined') return { ok: false, reason: 'server' };
    if (!('Notification' in window)) return { ok: false, reason: 'no-notification-api' };

    alert(
      "DEBUG ENV:\n" +
      "API_KEY: " + !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY + "\n" +
      "APP_ID: " + !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID + "\n" +
      "PROJECT_ID: " + !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    );

    console.log('[FCM] Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('[FCM] Permission result:', permission);
    if (permission !== 'granted') return { ok: false, reason: `permission-${permission}` };

    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      console.log('[FCM] Firebase Messaging not supported on this browser.');
      return { ok: false, reason: 'messaging-unsupported' };
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.log('[FCM] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set.');
      return { ok: false, reason: 'no-vapid-key' };
    }

    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
    if (!token) {
      console.log('[FCM] getToken returned empty — check VAPID key or SW registration.');
      return { ok: false, reason: 'empty-token' };
    }

    console.log('[FCM] Token retrieved:', token);

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      console.log('[FCM] No Firebase Auth session — cannot save token.');
      return { ok: false, reason: 'not-authenticated' };
    }

    console.log('[FCM] Sending token to backend API...');
    const res = await fetch('/api/me/fcm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => String(res.status));
      console.log('[FCM] Backend save failed:', msg);
      return { ok: false, reason: `api-${res.status}` };
    }

    console.log('[FCM] Firestore write resolved successfully via API!');
    return { ok: true };
  } catch (err) {
    console.error('[FCM] registerFcmToken error:', err);
    return { ok: false, reason: String(err) };
  }
}

export function FCMForegroundListener() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !user) return;

    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;
      const { onMessage } = await import('firebase/messaging');
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? '';
        const body = payload.notification?.body ?? '';
        const text = title && body ? `${title} — ${body}` : title || body;
        if (text) showToast(text, 'info');
      });
    })();

    return () => unsubscribe?.();
  }, [mounted, user, showToast]);

  return null;
}
