'use client';

/**
 * useChatUsers — singleton-safe hook that loads registered Firebase Auth users.
 *
 * Intentionally kept thin: just the onSnapshot listener + REST fallback that
 * previously lived inside useChatLegacy. Calling this at page level means the
 * chat hooks never fetch users independently — they receive allUsers as a prop.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth, type UserProfile } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { chatTrace, createChatTraceId } from '@/lib/chatTrace';

const FIRESTORE_USERS_REST_BASE =
  'https://firestore.googleapis.com/v1/projects/tv-industry-il/databases/(default)/documents/users';

function mergeUserProfiles(primary: UserProfile[], fallback: UserProfile[]): UserProfile[] {
  const merged = new Map<string, UserProfile>();
  for (const u of fallback) { if (u.uid) merged.set(u.uid, u); }
  for (const u of primary) {
    if (!u.uid) continue;
    const existing = merged.get(u.uid);
    merged.set(u.uid, existing ? { ...existing, ...u } : u);
  }
  return [...merged.values()].sort((a, b) =>
    (a.displayName || '').localeCompare(b.displayName || '', 'he')
  );
}

export function useChatUsers(): UserProfile[] {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const fallbackFiredRef = useRef(false);

  const fetchViaRest = useCallback(async (): Promise<UserProfile[]> => {
    if (!user) return [];
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${FIRESTORE_USERS_REST_BASE}?pageSize=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      const payload = await response.json() as {
        documents?: Array<{ name?: string; fields?: Record<string, Record<string, unknown>> }>;
      };
      return (payload.documents ?? []).flatMap((d) => {
        const uid = d.name?.split('/').pop() || '';
        if (!uid) return [] as UserProfile[];
        const f = d.fields ?? {};
        const str = (key: string) => (f[key]?.stringValue ? String(f[key].stringValue) : '');
        const bool = (key: string) => Boolean(f[key]?.booleanValue);
        const profile: UserProfile = {
          uid,
          displayName: str('displayName'),
          email: str('email'),
          photoURL: str('photoURL') || null,
          department: str('department'),
          departments: str('department') ? [str('department')] : [],
          role: str('role'),
          roles: str('role') ? [str('role')] : [],
          phone: str('phone'),
          bio: str('bio'),
          theme: str('theme') || 'dark',
          status: (str('status') as UserProfile['status']) || 'offline',
          isOnline: bool('isOnline'),
          onboardingComplete: bool('onboardingComplete'),
          skills: [],
          encryptionPublicKey: str('encryptionPublicKey') || undefined,
          lastSeen: f['lastSeen']?.timestampValue ? new Date(String(f['lastSeen'].timestampValue)).getTime() : null,
        };
        return [profile];
      });
    } catch {
      return [];
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let sdkLoaded = false;
    const traceId = createChatTraceId('users');
    const startedAt = performance.now();
    chatTrace('users', 'subscribe:start', { traceId, uid: user.uid });

    const applyUsers = (next: UserProfile[]) => {
      if (!cancelled) {
        chatTrace('users', 'apply', {
          traceId,
          count: next.length,
          durationMs: Math.round(performance.now() - startedAt),
        });
        setAllUsers((cur) => mergeUserProfiles(next, cur));
      }
    };

    const loadFallback = async () => {
      if (fallbackFiredRef.current) return;
      fallbackFiredRef.current = true;
      chatTrace('users', 'fallback:start', { traceId });
      const users = await fetchViaRest();
      if (!cancelled && users.length) applyUsers(users);
      if (!cancelled && !users.length) chatTrace('users', 'fallback:empty', { traceId }, { level: 'warn' });
    };

    const timer = setTimeout(() => { if (!sdkLoaded) void loadFallback(); }, 1500);

    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        sdkLoaded = true;
        const users: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const lastSeen = data.lastSeen instanceof Timestamp
            ? data.lastSeen.toMillis()
            : typeof data.lastSeen === 'number'
              ? data.lastSeen
              : typeof data.lastSeen === 'string'
                ? Date.parse(data.lastSeen) || null
                : null;
          users.push({ uid: d.id, ...data, lastSeen } as UserProfile);
        });
        if (users.length) { applyUsers(users); return; }
        void loadFallback();
      },
      (error) => {
        chatTrace('users', 'subscribe:error', { traceId, error }, { level: 'error' });
        void loadFallback();
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub();
    };
  }, [fetchViaRest, user]);

  return allUsers;
}
