'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNotifications } from '@/contexts/NotificationContext';

export default function PushClickTracker() {
  const searchParams = useSearchParams();
  const { markAllAsRead } = useNotifications();

  useEffect(() => {
    if (searchParams.get('src') !== 'push') return;
    void markAllAsRead().catch(() => {});

    const url = new URL(window.location.href);
    url.searchParams.delete('src');
    window.history.replaceState(null, '', url.toString());
  }, [searchParams, markAllAsRead]);

  return null;
}
