'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, addDoc, doc, setDoc,
  query, where, orderBy
} from 'firebase/firestore';
import { getWeekId } from '@/lib/productionDiff';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';

type ProductionReminderData = {
  name?: string;
  date?: string;
  status?: string;
  startTime?: string;
  crew?: Array<{ name?: string; phone?: string; normalizedPhone?: string }>;
};

export interface AppNotification {
  id: string;
  type: 'production_reminder' | 'crew_assignment' | 'status_change' | 'file_upload' | 'general' | 'job_match' | 'availability_reminder' | 'new_message' | 'event_reminder' | 'team_invite' | 'team_schedule_update' | 'team_member_joined' | 'team_member_left' | 'team_role_changed' | 'bug_report' | 'user_pending_approval';
  title: string;
  message: string;
  productionId?: string;
  productionName?: string;
  linkUrl?: string;
  source?: 'admin' | 'system';
  createdBy?: string;
  read: boolean;
  readAt?: number;
  createdAt: number;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notif: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  browserPermission: NotificationPermission | 'default';
  requestBrowserPermission: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: async () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  clearAll: async () => {},
  browserPermission: 'default',
  requestBrowserPermission: async () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [realtimeFailed, setRealtimeFailed] = useState(false);
  const browserNotifiedRef = useRef(new Set<string>());
  const sentRemindersRef = useRef(new Set<string>());
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'default'>(() => (
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  ));

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const token = await user.getIdToken();
    const response = await fetch('/api/notifications', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to load notifications: ${response.status}`);
    }

    const payload = (await response.json()) as { notifications?: AppNotification[] };
    const notifs = Array.isArray(payload.notifications) ? payload.notifications : [];
    setNotifications(notifs);

    const latestUnread = notifs.find((notification) => !notification.read);
    if (
      latestUnread &&
      browserPermission === 'granted' &&
      !browserNotifiedRef.current.has(latestUnread.id)
    ) {
      browserNotifiedRef.current.add(latestUnread.id);
      showBrowserNotification(latestUnread.title, latestUnread.message);
    }
  }, [user, browserPermission]);

  const mutateNotifications = useCallback(async (method: 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
    if (!user) return;
    const token = await user.getIdToken();
    const response = await fetch('/api/notifications', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to update notifications: ${response.status}`);
    }
  }, [user]);

  // Check browser permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const timer = window.setTimeout(() => setBrowserPermission(Notification.permission), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  // Listen to user's notifications from Firestore
  useEffect(() => {
    if (!user) {
      const timer = window.setTimeout(() => setNotifications([]), 0);
      return () => window.clearTimeout(timer);
    }

    const initialRefreshTimer = window.setTimeout(() => {
      void refreshNotifications().catch((error) => {
        console.error('[notifications] initial API load failed:', error);
      });
    }, 0);

    let unsubscribe: (() => void) | null = null;
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid)
      );

      unsubscribe = onSnapshot(q, () => {
        setRealtimeFailed(false);
        void refreshNotifications().catch((error) => {
          console.error('[notifications] realtime refresh failed:', error);
        });
      }, (error) => {
        setRealtimeFailed(true);
        console.error('[notifications] realtime listener failed:', error);
        void refreshNotifications().catch((refreshError) => {
          console.error('[notifications] API fallback failed:', refreshError);
        });
      });
    } catch (error) {
      window.setTimeout(() => setRealtimeFailed(true), 0);
      console.error('[notifications] realtime listener setup failed:', error);
    }

    return () => {
      window.clearTimeout(initialRefreshTimer);
      unsubscribe?.();
    };
  }, [user, browserPermission, refreshNotifications]);

  // Explicit refresh channel for admin sends and a cautious fallback when realtime is unavailable.
  useEffect(() => {
    if (!user) return;

    const refresh = () => {
      void refreshNotifications().catch((error) => {
        console.error('[notifications] manual refresh failed:', error);
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    let channel: BroadcastChannel | null = null;
    window.addEventListener('app:notifications-refresh', refresh);
    document.addEventListener('visibilitychange', handleVisibility);

    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('tv-industry-notifications');
        channel.onmessage = (event) => {
          if (event.data?.type === 'refresh') refresh();
        };
      } catch (error) {
        console.warn('[notifications] BroadcastChannel unavailable:', error);
      }
    }

    const fallbackInterval = realtimeFailed ? window.setInterval(refresh, 30_000) : null;

    return () => {
      window.removeEventListener('app:notifications-refresh', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      channel?.close();
    };
  }, [user, realtimeFailed, refreshNotifications]);

  // Production change listener - auto-generate notifications (per-user path)
  useEffect(() => {
    if (!user) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const weekId = getWeekId(todayStr);

    const q = query(
      collection(db, 'productions', user.uid, 'weeks', weekId, 'productions'),
      orderBy('lastUpdatedAt', 'desc')
    );
    let isFirstLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isFirstLoad) {
        isFirstLoad = false;
        return;
      }

      snapshot.docChanges().forEach(async (change) => {
        const data = change.doc.data();

        if (change.type === 'modified') {
          await addDoc(collection(db, 'notifications'), {
            userId: user.uid,
            recipientUid: user.uid,
            type: 'status_change',
            title: 'הפקה עודכנה',
            message: `ההפקה "${data.name}" עודכנה`,
            productionId: change.doc.id,
            productionName: data.name,
            read: false,
            createdAt: Date.now(),
          });
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Production reminder checker - single listener + interval for time checks
  useEffect(() => {
    if (!user) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const weekId = getWeekId(todayStr);

    // Cache of today's productions, kept fresh by onSnapshot
    let todayProductions: Array<{ id: string; data: ProductionReminderData }> = [];

    const checkAndSendReminders = async () => {
      const now = new Date();
      const in30min = new Date(now.getTime() + 30 * 60 * 1000);
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const reminderTime = `${String(in30min.getHours()).padStart(2, '0')}:${String(in30min.getMinutes()).padStart(2, '0')}`;

      const userDisplayName = normalizeName(profile?.crewName || profile?.displayName || user.displayName || '');
      const userPhone = normalizePhone(profile?.phone || '') ?? '';

      for (const { id, data: prod } of todayProductions) {
        const startTime = typeof prod.startTime === 'string' ? prod.startTime : '';
        if (
          prod.date !== todayStr ||
          prod.status !== 'scheduled' ||
          startTime < currentTime ||
          startTime > reminderTime ||
          sentRemindersRef.current.has(id)
        ) continue;

        // Only remind for productions the user is actually in
        const crew = prod.crew ?? [];
        const isInCrew =
          crew.length === 0 || // no crew data → assume it's the user's own shift
          crew.some((m) => {
            if (userDisplayName && normalizeName(m.name ?? '') === userDisplayName) return true;
            if (userPhone.length >= 9 && normalizePhone(m.phone ?? '') === userPhone) return true;
            if (userPhone.length >= 9 && normalizePhone(m.normalizedPhone ?? '') === userPhone) return true;
            return false;
          });
        if (!isInCrew) continue;

        // Deterministic doc ID prevents Firestore duplicates even across remounts
        const reminderId = `reminder-${user.uid}-${id}-${todayStr}`;
        sentRemindersRef.current.add(id);
        await setDoc(doc(db, 'notifications', reminderId), {
          userId: user.uid,
          recipientUid: user.uid,
          type: 'production_reminder',
          title: 'תזכורת הפקה',
          message: `ההפקה "${prod.name}" מתחילה בעוד 30 דקות (${prod.startTime})`,
          productionId: id,
          productionName: prod.name,
          read: false,
          createdAt: Date.now(),
        });
        // Immediate browser push — doesn't wait for Firestore listener roundtrip
        showBrowserNotification('תזכורת הפקה', `ההפקה "${prod.name}" מתחילה בעוד 30 דקות (${prod.startTime})`);
      }
    };

    // Single listener — only refreshes the productions cache, does NOT call checkAndSendReminders
    // (avoids duplicates when productions change mid-session; interval handles time-based checks)
    const unsubscribe = onSnapshot(
      collection(db, 'productions', user.uid, 'weeks', weekId, 'productions'),
      (snapshot) => {
        todayProductions = snapshot.docs.map(d => ({ id: d.id, data: d.data() as ProductionReminderData }));
      }
    );

    // Re-check time window every minute
    const interval = setInterval(() => { void checkAndSendReminders(); }, 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [user, profile]);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
  }, []);

  const addNotification = useCallback(async (notif: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => {
    if (!user) return;
    await addDoc(collection(db, 'notifications'), {
      ...notif,
      userId: user.uid,
      recipientUid: user.uid,
      read: false,
      createdAt: Date.now(),
    });
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    const previous = notifications;
    const readAt = Date.now();
    setNotifications((current) => current.map((notification) => (
      notification.id === id ? { ...notification, read: true, readAt } : notification
    )));
    try {
      await mutateNotifications('PATCH', { id });
    } catch (error) {
      setNotifications(previous);
      throw error;
    }
  }, [mutateNotifications, notifications]);

  const markAllAsRead = useCallback(async () => {
    const previous = notifications;
    const readAt = Date.now();
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true, readAt })));
    try {
      await mutateNotifications('PATCH', { all: true });
    } catch (error) {
      setNotifications(previous);
      throw error;
    }
  }, [mutateNotifications, notifications]);

  const clearAll = useCallback(async () => {
    const previous = notifications;
    setNotifications([]);
    try {
      await mutateNotifications('DELETE', { all: true });
    } catch (error) {
      setNotifications(previous);
      throw error;
    }
  }, [mutateNotifications, notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      browserPermission,
      requestBrowserPermission,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'production-notification',
      dir: 'rtl',
      lang: 'he',
    });
  } catch {
    // Silently fail for environments that don't support notifications
  }
}

export const useNotifications = () => useContext(NotificationContext);
