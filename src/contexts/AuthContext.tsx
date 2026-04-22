'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { can, hasRole, type Permission, type UserRole } from '@/lib/permissions';

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

type ProfileSource = 'server' | 'cache' | 'fallback';

type SessionBootstrapCache = {
  profile: UserProfile;
  contactsTotal: number | null;
  contactsUpdatedAt: string | null;
  profileSource: 'server';
  contactsSource: 'server' | 'unavailable';
  generatedAt: string;
};

type SessionBootstrapResponse = SessionBootstrapCache & {
  repaired?: boolean;
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileReady: boolean;
  profileSource: ProfileSource;
  bootstrapContactsTotal: number | null;
  bootstrapContactsUpdatedAt: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, department: string, role: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  repairUserProfile: () => Promise<void>;
  can: (permission: Permission) => boolean;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  profileReady: false,
  profileSource: 'fallback',
  bootstrapContactsTotal: null,
  bootstrapContactsUpdatedAt: null,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  logout: async () => {},
  updateUserProfile: async () => {},
  repairUserProfile: async () => {},
  can: () => false,
  hasRole: () => false,
});

const SESSION_BOOTSTRAP_CACHE_KEY = 'tv-session-bootstrap-cache';
const AUTH_PROFILE_CACHE_KEY = 'tv-auth-profile-cache';

function defaultProfile(firebaseUser: User): UserProfile {
  return {
    uid: firebaseUser.uid,
    displayName: firebaseUser.displayName || 'משתמש חדש',
    email: firebaseUser.email || '',
    photoURL: firebaseUser.photoURL,
    department: '',
    role: '',
    phone: '',
    skills: [],
    bio: '',
    status: 'available',
    isOnline: true,
    onboardingComplete: false,
    theme: 'dark',
  };
}

function readCachedBootstrap(): SessionBootstrapCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_BOOTSTRAP_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionBootstrapCache) : null;
  } catch {
    return null;
  }
}

function normalizeUserProfile(raw: Record<string, unknown> | null, firebaseUser: User): UserProfile {
  const fallback = defaultProfile(firebaseUser);
  if (!raw) return fallback;

  const linkedContactIdRaw = raw.linkedContactId;
  const linkedContactId =
    typeof linkedContactIdRaw === 'number'
      ? linkedContactIdRaw
      : typeof linkedContactIdRaw === 'string' && linkedContactIdRaw.trim()
        ? Number(linkedContactIdRaw)
        : undefined;

  return {
    ...fallback,
    ...raw,
    uid: firebaseUser.uid,
    displayName: typeof raw.displayName === 'string' && raw.displayName.trim()
      ? raw.displayName
      : firebaseUser.displayName || fallback.displayName,
    email: typeof raw.email === 'string' && raw.email.trim()
      ? raw.email
      : firebaseUser.email || fallback.email,
    photoURL: typeof raw.photoURL === 'string'
      ? raw.photoURL
      : firebaseUser.photoURL || null,
    department: typeof raw.department === 'string' ? raw.department : '',
    role: typeof raw.role === 'string' ? raw.role : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    skills: Array.isArray(raw.skills) ? raw.skills.map((item) => String(item)) : [],
    bio: typeof raw.bio === 'string' ? raw.bio : '',
    status: raw.status === 'busy' || raw.status === 'offline' ? raw.status : 'available',
    isOnline: raw.isOnline === true,
    onboardingComplete: raw.onboardingComplete === true,
    theme: typeof raw.theme === 'string' && raw.theme.trim() ? raw.theme : 'dark',
    siteRole:
      raw.siteRole === 'admin' || raw.siteRole === 'moderator' || raw.siteRole === 'editor' || raw.siteRole === 'viewer'
        ? raw.siteRole
        : raw.siteRole === 'user'
          ? 'viewer'
          : undefined,
    linkedContactId: Number.isFinite(linkedContactId) ? linkedContactId : undefined,
    openToWork: raw.openToWork === true,
    city: typeof raw.city === 'string' ? raw.city : undefined,
    yearsOfExperience: typeof raw.yearsOfExperience === 'number' ? raw.yearsOfExperience : undefined,
    credits: Array.isArray(raw.credits) ? raw.credits.map((item) => String(item)) : undefined,
    gear: Array.isArray(raw.gear) ? raw.gear.map((item) => String(item)) : undefined,
    preferredRoles: Array.isArray(raw.preferredRoles) ? raw.preferredRoles.map((item) => String(item)) : undefined,
    preferredRegions: Array.isArray(raw.preferredRegions) ? raw.preferredRegions.map((item) => String(item)) : undefined,
    notificationsEnabled: typeof raw.notificationsEnabled === 'boolean' ? raw.notificationsEnabled : undefined,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : undefined,
    showPhone: typeof raw.showPhone === 'boolean' ? raw.showPhone : undefined,
    encryptionPublicKey: typeof raw.encryptionPublicKey === 'string' ? raw.encryptionPublicKey : undefined,
    crewName: typeof raw.crewName === 'string' ? raw.crewName : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedBootstrap = readCachedBootstrap();
  const [user, setUser] = useState<User | null>(() => auth?.currentUser ?? null);
  const [profile, setProfile] = useState<UserProfile | null>(() => cachedBootstrap?.profile || null);
  const [profileReady, setProfileReady] = useState<boolean>(() => Boolean(cachedBootstrap?.profile));
  const [profileSource, setProfileSource] = useState<ProfileSource>(() => (cachedBootstrap?.profile ? 'cache' : 'fallback'));
  const [bootstrapContactsTotal, setBootstrapContactsTotal] = useState<number | null>(() => cachedBootstrap?.contactsTotal ?? null);
  const [bootstrapContactsUpdatedAt, setBootstrapContactsUpdatedAt] = useState<string | null>(() => cachedBootstrap?.contactsUpdatedAt ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (profile && profileReady && profileSource === 'server') {
        const payload: SessionBootstrapCache = {
          profile,
          contactsTotal: bootstrapContactsTotal,
          contactsUpdatedAt: bootstrapContactsUpdatedAt,
          profileSource: 'server',
          contactsSource: bootstrapContactsTotal !== null ? 'server' : 'unavailable',
          generatedAt: new Date().toISOString(),
        };
        window.sessionStorage.setItem(SESSION_BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
        window.sessionStorage.setItem(
          AUTH_PROFILE_CACHE_KEY,
          JSON.stringify({ profile, resolved: true }),
        );
      } else if (!profile) {
        window.sessionStorage.removeItem(SESSION_BOOTSTRAP_CACHE_KEY);
        window.sessionStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
      }
    } catch {}
  }, [profile, profileReady, profileSource, bootstrapContactsTotal, bootstrapContactsUpdatedAt]);

  const fetchSessionBootstrap = async (firebaseUser: User) => {
    const token = await firebaseUser.getIdToken();
    const response = await fetch('/api/bootstrap/session', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Bootstrap failed (${response.status})`);
    }

    return (await response.json()) as SessionBootstrapResponse;
  };

  const fetchClientProfile = async (firebaseUser: User): Promise<UserProfile | null> => {
    if (!db) return null;

    const snapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (!snapshot.exists()) {
      return null;
    }

    return normalizeUserProfile(snapshot.data() as Record<string, unknown>, firebaseUser);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setProfileReady(false);
        setProfileSource('fallback');
        setBootstrapContactsTotal(null);
        setBootstrapContactsUpdatedAt(null);
        setLoading(false);
        return;
      }

      const fallback = defaultProfile(firebaseUser);
      const cached = readCachedBootstrap();
      if (cached?.profile) {
        setProfile(cached.profile);
        setProfileReady(true);
        setProfileSource('cache');
        setBootstrapContactsTotal(cached.contactsTotal ?? null);
        setBootstrapContactsUpdatedAt(cached.contactsUpdatedAt ?? null);
      } else {
        setProfile(fallback);
        setProfileReady(false);
        setProfileSource('fallback');
      }

      try {
        const bootstrap = await fetchSessionBootstrap(firebaseUser);
        setProfile(bootstrap.profile);
        setProfileReady(true);
        setProfileSource('server');
        setBootstrapContactsTotal(bootstrap.contactsTotal ?? null);
        setBootstrapContactsUpdatedAt(bootstrap.contactsUpdatedAt ?? null);
      } catch {
        try {
          const clientProfile = await fetchClientProfile(firebaseUser);
          if (clientProfile) {
            setProfile(clientProfile);
            setProfileReady(true);
            setProfileSource('cache');
          } else if (!cached?.profile) {
            setProfile(fallback);
            setProfileReady(false);
            setProfileSource('fallback');
          }
        } catch {
          if (!cached?.profile) {
            setProfile(fallback);
            setProfileReady(false);
            setProfileSource('fallback');
          }
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, name: string, department: string, role: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    setProfile({
      ...defaultProfile(result.user),
      displayName: name,
      email,
      department,
      role,
    });
    setProfileReady(false);
    setProfileSource('fallback');
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      const authError = error as { code?: string };
      if (auth.currentUser) return;
      if (authError.code !== 'auth/popup-closed-by-user') throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setProfileReady(false);
    setProfileSource('fallback');
    setBootstrapContactsTotal(null);
    setBootstrapContactsUpdatedAt(null);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const token = await user.getIdToken();
    const response = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to update profile');
    }

    setProfile((prev) => (prev ? { ...prev, ...data } : prev));
    setProfileReady(true);
    setProfileSource((prev) => (prev === 'server' ? prev : 'cache'));
  };

  const repairUserProfile = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch('/api/me/repair-profile', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const bootstrap = await fetchSessionBootstrap(user);
    setProfile(bootstrap.profile);
    setProfileReady(true);
    setProfileSource('server');
    setBootstrapContactsTotal(bootstrap.contactsTotal ?? null);
    setBootstrapContactsUpdatedAt(bootstrap.contactsUpdatedAt ?? null);
  };

  const canDo = (permission: Permission): boolean => can(profile?.siteRole, permission);
  const hasRoleLevel = (role: UserRole): boolean => hasRole(profile?.siteRole, role);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        profileReady,
        profileSource,
        bootstrapContactsTotal,
        bootstrapContactsUpdatedAt,
        signIn,
        signUp,
        signInWithGoogle,
        logout,
        updateUserProfile,
        repairUserProfile,
        can: canDo,
        hasRole: hasRoleLevel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
