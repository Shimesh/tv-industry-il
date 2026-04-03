'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { type UserRole, can, hasRole, type Permission } from '@/lib/permissions';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  department: string;
  role: string;
  phone: string;
  linkedContactId?: number;
  skills: string[];
  bio: string;
  status: 'available' | 'busy' | 'offline';
  isOnline: boolean;
  onboardingComplete: boolean;
  theme: string;
  siteRole?: UserRole;
  openToWork?: boolean;
  city?: string;
  yearsOfExperience?: number;
  credits?: string[];
  gear?: string[];
  preferredRoles?: string[];
  preferredRegions?: string[];
  notificationsEnabled?: boolean;
  soundEnabled?: boolean;
  showPhone?: boolean;
  encryptionPublicKey?: string;
  crewName?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, department: string, role: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  can: (permission: Permission) => boolean;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  logout: async () => {},
  updateUserProfile: async () => {},
  can: () => false,
  hasRole: () => false,
});

/* ─── Firestore REST helpers ─────────────────────────────── */
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/tv-industry-il/databases/(default)/documents';

function toFsFields(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string')       fields[k] = { stringValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number')  fields[k] = { integerValue: String(v) };
    else if (v === null)             fields[k] = { nullValue: null };
    else if (Array.isArray(v))       fields[k] = { arrayValue: { values: v.map(s => ({ stringValue: String(s) })) } };
  }
  return fields;
}

function fromFsFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue'  in v) result[k] = v.stringValue;
    else if ('booleanValue' in v) result[k] = v.booleanValue;
    else if ('integerValue' in v) result[k] = Number(v.integerValue);
    else if ('nullValue'   in v) result[k] = null;
    else if ('arrayValue'  in v) {
      const av = v.arrayValue as { values?: Array<{ stringValue?: string }> };
      result[k] = (av.values ?? []).map(i => i.stringValue ?? '');
    }
  }
  return result;
}

function defaultProfile(firebaseUser: User): UserProfile {
  return {
    uid: firebaseUser.uid,
    displayName: firebaseUser.displayName || 'משתמש חדש',
    email: firebaseUser.email || '',
    photoURL: firebaseUser.photoURL,
    department: '', role: '', phone: '',
    skills: [], bio: '',
    status: 'available', isOnline: true,
    onboardingComplete: false, theme: 'dark',
  };
}

async function fetchOrCreateProfile(firebaseUser: User): Promise<UserProfile> {
  try {
    const token = await firebaseUser.getIdToken();
    const url = `${FS_BASE}/users/${firebaseUser.uid}`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json() as { fields?: Record<string, Record<string, unknown>> };
      if (data.fields) {
        // Mark online — fire-and-forget
        fetch(`${url}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastSeen`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ fields: {
            isOnline: { booleanValue: true },
            lastSeen: { timestampValue: new Date().toISOString() },
          }}),
        }).catch(() => {});
        return { uid: firebaseUser.uid, ...fromFsFields(data.fields) } as UserProfile;
      }
    }

    // Create new profile
    const profileData = defaultProfile(firebaseUser);
    await fetch(url, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fields: toFsFields({
        ...profileData,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      })}),
    });
    return profileData;
  } catch {
    // Firestore failure must never break auth — return minimal profile from Firebase Auth
    return defaultProfile(firebaseUser);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userProfile = await fetchOrCreateProfile(firebaseUser);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, name: string, department: string, role: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });

    const profileData: UserProfile = {
      uid: result.user.uid,
      displayName: name,
      email,
      photoURL: null,
      department, role, phone: '',
      skills: [], bio: '',
      status: 'available', isOnline: true,
      onboardingComplete: false, theme: 'dark',
    };

    try {
      const token = await result.user.getIdToken();
      await fetch(`${FS_BASE}/users/${result.user.uid}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFsFields({
          ...profileData,
          createdAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        })}),
      });
    } catch { /* non-critical */ }

    setProfile(profileData);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await fetchOrCreateProfile(result.user);
    } catch (error: unknown) {
      const authError = error as { code?: string };
      if (auth.currentUser) return;
      if (authError.code !== 'auth/popup-closed-by-user') throw error;
    }
  };

  const logout = async () => {
    if (user) {
      user.getIdToken().then(token =>
        fetch(`${FS_BASE}/users/${user.uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastSeen`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: {
            isOnline: { booleanValue: false },
            lastSeen: { timestampValue: new Date().toISOString() },
          }}),
        })
      ).catch(() => {});
    }
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const fieldPaths = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
      await fetch(`${FS_BASE}/users/${user.uid}?${fieldPaths}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFsFields(data as Record<string, unknown>) }),
      });
    } catch { /* non-critical */ }
    setProfile(prev => prev ? { ...prev, ...data } : null);
  };

  const canDo = (permission: Permission): boolean => can(profile?.siteRole, permission);
  const hasRoleLevel = (role: UserRole): boolean => hasRole(profile?.siteRole, role);

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signUp, signInWithGoogle, logout, updateUserProfile,
      can: canDo, hasRole: hasRoleLevel,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
