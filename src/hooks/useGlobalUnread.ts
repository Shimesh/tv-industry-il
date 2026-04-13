'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';

export function useGlobalUnread(): number {
  const { user } = useAuth();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user?.uid) { setTotal(0); return; }
    const q = query(
      collection(db, 'chats'),
      where('members', 'array-contains', user.uid)
    );
    return onSnapshot(q, (snap) => {
      let sum = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        const unread = data.unreadCount;
        if (typeof unread === 'object' && unread !== null) {
          sum += (unread[user.uid] ?? 0);
        }
      });
      setTotal(sum);
    }, () => { /* ignore permission errors on sign-out */ });
  }, [user?.uid]);

  return total;
}
