'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, getDocs
} from 'firebase/firestore';
import { getWeekId } from '@/lib/productionDiff';

export interface AppNotification {
  id: string;
  type: 'production_reminder' | 'crew_assignment' | 'status_change' | 'file_upload' | 'general' | 'job_match' | 'availability_reminder' | 'new_message' | 'event_reminder' | 'team_invite' | 'team_schedule_update' | 'team_member_joined' | 'team_member_left' | 'team_role_changed';
  title: string;
  message: string;
  productionId?: string;
  productionName?: string;
  read: boolean;
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
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'default'>('default');

  // Check browser permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  // Listen to user's notifications from Firestore
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: AppNotification[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as AppNotification[];
      setNotifications(notifs);

      // Show browser notification for new unread ones
      const newUnread = notifs.filter(n => !n.read);
      if (newUnread.length > 0 && browserPermission === 'granted') {
        const latest = newUnread[0];
        showBrowserNotification(latest.title, latest.message);
      }
    });

    return () => unsubscribe();
  }, [user, browserPermission]);

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
    let todayProductions: Array<{ id: string; data: Record<string, any> }> = [];
    const sentReminders = new Set<string>();

    const checkAndSendReminders = async () => {
      const now = new Date();
      const in30min = new Date(now.getTime() + 30 * 60 * 1000);
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const reminderTime = `${String(in30min.getHours()).padStart(2, '0')}:${String(in30min.getMinutes()).padStart(2, '0')}`;

      for (const { id, data: prod } of todayProductions) {
        if (
          prod.date === todayStr &&
          prod.status === 'scheduled' &&
          prod.startTime >= currentTime &&
          prod.startTime <= reminderTime &&
          !sentReminders.has(id)
        ) {
          sentReminders.add(id);
          await addDoc(collection(db, 'notifications'), {
            userId: user.uid,
            type: 'production_reminder',
            title: 'תזכורת הפקה',
            message: `ההפקה "${prod.name}" מתחילה בעוד 30 דקות (${prod.startTime})`,
            productionId: id,
            productionName: prod.name,
            read: false,
            createdAt: Date.now(),
          });
        }
      }
    };

    // Single listener on user's current week productions
    const unsubscribe = onSnapshot(
      collection(db, 'productions', user.uid, 'weeks', weekId, 'productions'),
      (snapshot) => {
        todayProductions = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
        checkAndSendReminders();
      }
    );

    // Re-check time window every minute (no new Firestore listeners)
    const interval = setInterval(checkAndSendReminders, 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [user]);

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
      read: false,
      createdAt: Date.now(),
    });
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
  }, [notifications]);

  const clearAll = useCallback(async () => {
    await Promise.all(notifications.map(n => deleteDoc(doc(db, 'notifications', n.id))));
  }, [notifications]);

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
