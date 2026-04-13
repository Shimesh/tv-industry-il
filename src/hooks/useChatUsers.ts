'use client';

/**
 * useChatUsers — singleton-safe hook that loads registered Firebase Auth users.
 *
 * Intentionally kept thin: just the onSnapshot listener + REST fallback that
 * previously lived inside useChatLegacy. Calling this at page level means the
 * chat hooks never fetch users independently — they receive allUsers as a prop.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth, type UserProfile } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';

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
        if (!uid) return [];
        const f = d.fields ?? {};
        const str = (key: string) => (f[key]?.stringValue ? String(f[key].stringValue) : '');
        const bool = (key: string) => Boolean(f[key]?.booleanValue);
        return [{
          uid,
          displayName: str('displayName'),
          email: str('email'),
          photoURL: str('photoURL') || null,
          department: str('department'),
          role: str('role'),
          phone: str('phone'),
          bio: str('bio'),
          theme: str('theme') || 'dark',
          status: (str('status') as UserProfile['status']) || 'offline',
          isOnline: bool('isOnline'),
          onboardingComplete: bool('onboardingComplete'),
          skills: [],
          encryptionPublicKey: str('encryptionPublicKey') || undefined,
        } satisfies UserProfile];
      });
    } catch {
      return [];
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let sdkLoaded = false;

    const applyUsers = (next: UserProfile[]) => {
      if (!cancelled) setAllUsers((cur) => mergeUserProfiles(next, cur));
    };

    const loadFallback = async () => {
      if (fallbackFiredRef.current) return;
      fallbackFiredRef.current = true;
      const users = await fetchViaRest();
      if (!cancelled && users.length) applyUsers(users);
    };

    const timer = setTimeout(() => { if (!sdkLoaded) void loadFallback(); }, 1500);

    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        sdkLoaded = true;
        const users: UserProfile[] = [];
        snap.forEach((d) => users.push({ uid: d.id, ...d.data() } as UserProfile));
        if (users.length) { applyUsers(users); return; }
        void loadFallback();
      },
      () => { void loadFallback(); }
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub();
    };
  }, [fetchViaRest, user]);

  return allUsers;
}
