'use client';

import { useEffect, useState } from 'react';
import { getToken } from 'firebase/messaging';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { getFirebaseMessaging, auth } from '@/lib/firebase';

type PushRegistrationResult = {
  ok: boolean;
  reason?: string;
};

function getMessagingServiceWorkerUrl(): string {
  const params = new URLSearchParams({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || '',
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

function base64UrlToApplicationServerKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}

async function sendPushRegistration(payload: {
  token?: string;
  webPushSubscription?: PushSubscriptionJSON;
}): Promise<PushRegistrationResult> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    console.log('[Push] No Firebase Auth session - cannot save push registration.');
    return { ok: false, reason: 'not-authenticated' };
  }

  const res = await fetch('/api/me/fcm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => String(res.status));
    console.log('[Push] Backend save failed:', msg);
    return { ok: false, reason: `api-${res.status}` };
  }

  return { ok: true };
}

async function registerWebPushSubscription(
  swReg: ServiceWorkerRegistration,
): Promise<PushRegistrationResult> {
  if (!('PushManager' in window)) return { ok: false, reason: 'no-push-manager' };

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    console.log('[WebPush] NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY is not set.');
    return { ok: false, reason: 'no-web-push-vapid-key' };
  }

  const existing = await swReg.pushManager.getSubscription();
  const subscription = existing || await swReg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToApplicationServerKey(publicKey),
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    console.log('[WebPush] Subscription did not include endpoint/keys.');
    return { ok: false, reason: 'invalid-subscription' };
  }

  return sendPushRegistration({ webPushSubscription: json });
}

export async function registerFcmToken(uid: string): Promise<PushRegistrationResult> {
  try {
    if (typeof window === 'undefined') return { ok: false, reason: 'server' };
    if (!uid) return { ok: false, reason: 'missing-uid' };
    if (!('Notification' in window)) return { ok: false, reason: 'no-notification-api' };
    if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no-service-worker' };

    console.log('[Push] Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('[Push] Permission result:', permission);
    if (permission !== 'granted') return { ok: false, reason: `permission-${permission}` };

    const swReg = await navigator.serviceWorker.register(getMessagingServiceWorkerUrl(), { scope: '/' });
    await navigator.serviceWorker.ready.catch(() => swReg);

    const webPushResultPromise = registerWebPushSubscription(swReg).catch((err) => {
      console.log('[WebPush] registerWebPushSubscription error:', err);
      return { ok: false, reason: String(err) };
    });

    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      console.log('[FCM] Firebase Messaging not supported on this browser.');
      return webPushResultPromise;
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
    if (!vapidKey) {
      console.log('[FCM] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set.');
      const webPushResult = await webPushResultPromise;
      return webPushResult.ok ? webPushResult : { ok: false, reason: 'no-vapid-key' };
    }

    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
    if (!token) {
      console.log('[FCM] getToken returned empty - check VAPID key or SW registration.');
      const webPushResult = await webPushResultPromise;
      return webPushResult.ok ? webPushResult : { ok: false, reason: 'empty-token' };
    }

    console.log('[FCM] Token retrieved:', token);
    console.log('[FCM] Sending token to backend API...');
    const fcmResult = await sendPushRegistration({ token });
    const webPushResult = await webPushResultPromise;

    if (fcmResult.ok || webPushResult.ok) {
      console.log('[Push] Firestore write resolved successfully via API.');
      return { ok: true };
    }

    return fcmResult;
  } catch (err) {
    console.error('[Push] registerFcmToken error:', err);
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
        const title = payload.notification?.title ?? payload.data?.title ?? '';
        const body = payload.notification?.body ?? payload.data?.body ?? '';
        const text = title && body ? `${title} - ${body}` : title || body;
        if (text) showToast(text, 'info');
      });
    })();

    return () => unsubscribe?.();
  }, [mounted, user, showToast]);

  return null;
}
