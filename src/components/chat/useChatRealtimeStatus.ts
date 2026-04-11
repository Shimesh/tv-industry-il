'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChatConnectionState } from './chatTypes';

interface UseChatRealtimeStatusOptions {
  enabled: boolean;
  userId: string | null;
  activeChatId: string | null;
  getIdToken?: (() => Promise<string>) | null;
}

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'on';
}

function getOnlineState(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function buildLegacyState(online: boolean): ChatConnectionState {
  return {
    mode: 'legacy',
    online,
    label: 'סנכרון V1 פעיל',
    detail: 'Firestore הוא כרגע שכבת ה-realtime הראשית.',
  };
}

function buildPreviewState(online: boolean): ChatConnectionState {
  return online
    ? {
        mode: 'preview',
        online: true,
        label: 'ממשק V2 מוכן',
        detail: 'ה-UI יודע לעבוד מול Socket.IO עם חיבור לשרת realtime, ובינתיים נשאר על Firestore כ-fallback.',
      }
    : {
        mode: 'offline',
        online: false,
        label: 'אין חיבור לרשת',
        detail: 'האפליקציה תשמור מצב מקומי ותתחבר מחדש כשהרשת תחזור.',
      };
}

export function useChatRealtimeStatus({
  enabled,
  userId,
  activeChatId,
  getIdToken,
}: UseChatRealtimeStatusOptions) {
  const socketUrl = useMemo(() => process.env.NEXT_PUBLIC_CHAT_SOCKET_URL?.trim() || '', []);
  const socketEnabled = enabled && isTruthyFlag(process.env.NEXT_PUBLIC_CHAT_SOCKET_ENABLED) && Boolean(socketUrl);
  const [online, setOnline] = useState<boolean>(getOnlineState());

  const [connectionState, setConnectionState] = useState<ChatConnectionState>(() => {
    if (!enabled) return buildLegacyState(getOnlineState());
    if (!getOnlineState()) return buildPreviewState(false);
    return socketEnabled
      ? {
          mode: 'preview',
          online: true,
          label: 'Socket-ready boundary',
          detail: 'ה-UI מוכן ל-Socket.IO; כרגע המערכת נשארת על Firestore עד שהשרת הייעודי יתחבר.',
        }
      : buildPreviewState(true);
  });

  useEffect(() => {
    if (!enabled) return;

    const syncOnline = () => {
      const nextOnline = getOnlineState();
      setOnline(nextOnline);

      if (!nextOnline) {
        setConnectionState(buildPreviewState(false));
        return;
      }

      if (!socketEnabled) {
        setConnectionState(buildPreviewState(true));
        return;
      }

      setConnectionState({
        mode: 'preview',
        online: true,
        label: 'Socket-ready boundary',
        detail: 'ה-UI מוכן ל-Socket.IO; כרגע המערכת נשארת על Firestore עד שהשרת הייעודי יתחבר.',
      });
    };

    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, [enabled, socketEnabled]);

  useEffect(() => {
    if (!enabled) {
      setConnectionState(buildLegacyState(online));
      return;
    }

    if (!online) {
      setConnectionState(buildPreviewState(false));
      return;
    }

    if (!socketEnabled) {
      setConnectionState(buildPreviewState(true));
      return;
    }

    setConnectionState({
      mode: 'preview',
      online: true,
      label: 'Socket-ready boundary',
      detail: 'ה-UI מוכן ל-Socket.IO; כרגע המערכת נשארת על Firestore עד שהשרת הייעודי יתחבר.',
    });
  }, [enabled, online, socketEnabled, userId, activeChatId, getIdToken]);

  return {
    connectionState,
    socketReady: false,
    transportMode: socketEnabled ? 'socket-ready' : 'firestore',
    online,
  } as const;
}
