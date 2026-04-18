'use client';

import { useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';

const FS_BASE =
  'https://firestore.googleapis.com/v1/projects/tv-industry-il/databases/(default)/documents';

export function useOnlineStatus(userId: string | undefined) {
  // Cache the token so the synchronous beforeunload handler can use it
  const tokenRef = useRef<string>('');

  useEffect(() => {
    if (!userId) return;

    const url =
      `${FS_BASE}/users/${userId}` +
      '?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastSeen';

    /** PATCH isOnline + lastSeen via REST (bypasses SDK phantom-write queue). */
    const patch = (isOnline: boolean, keepalive = false) => {
      const token = tokenRef.current;
      if (!token) return;
      fetch(url, {
        method: 'PATCH',
        keepalive,   // keepalive=true → browser sends even during page unload
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            isOnline: { booleanValue: isOnline },
            lastSeen: { timestampValue: new Date().toISOString() },
          },
        }),
      }).catch(() => {});
    };

    /** Refresh the cached token then mark online. */
    const setOnline = async () => {
      tokenRef.current = (await auth?.currentUser?.getIdToken()) ?? '';
      patch(true);
    };

    /** Mark offline — uses keepalive so it survives tab close. */
    const setOffline = () => patch(false, true);

    setOnline();

    const handleVisibility = () =>
      document.visibilityState === 'visible' ? setOnline() : setOffline();

    window.addEventListener('beforeunload', setOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    // Heartbeat: refreshes token + lastSeen every 60 s
    const heartbeat = setInterval(setOnline, 60_000);

    return () => {
      window.removeEventListener('beforeunload', setOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(heartbeat);
      setOffline();
    };
  }, [userId]);
}
