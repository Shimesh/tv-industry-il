'use client';

import { useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useOnlineStatus(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const userRef = doc(db, 'users', userId);

    const setOnline = () => {
      updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
    };

    const setOffline = () => {
      updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
    };

    setOnline();

    const handleVisibility = () => {
      document.visibilityState === 'visible' ? setOnline() : setOffline();
    };

    window.addEventListener('beforeunload', setOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    // Heartbeat every 60 seconds
    const heartbeat = setInterval(setOnline, 60000);

    return () => {
      window.removeEventListener('beforeunload', setOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(heartbeat);
      setOffline();
    };
  }, [userId]);
}
