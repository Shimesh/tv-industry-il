'use client';

import { useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseMessaging } from '@/lib/firebase';
import { db } from '@/lib/firebase';

const SESSION_KEY = 'fcm_token_registered';

export function FCMTokenRegistration() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    void registerToken(user.uid);
  }, [user]);

  return null;
}

async function registerToken(uid: string) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const messaging = await getFirebaseMessaging();
    if (!messaging) return;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return;

    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
    if (!token) return;

    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Permission denied or FCM unavailable — silent failure is correct here
  }
}
