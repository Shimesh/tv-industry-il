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
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
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
  /** Check if current user has a specific permission */
  can: (permission: Permission) => boolean;
  /** Check if current user has at least the given role */
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

async function fetchOrCreateProfile(firebaseUser: User): Promise<UserProfile | null> {
  try {
    const profileRef = doc(db, 'users', firebaseUser.uid);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      updateDoc(profileRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
      return { uid: firebaseUser.uid, ...profileSnap.data() } as UserProfile;
    }

    const profileData: Omit<UserProfile, 'uid'> = {
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

    await setDoc(profileRef, {
      ...profileData,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });

    return { uid: firebaseUser.uid, ...profileData };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to auth state changes
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

    const profileData: Omit<UserProfile, 'uid'> = {
      displayName: name,
      email: email,
      photoURL: null,
      department,
      role,
      phone: '',
      skills: [],
      bio: '',
      status: 'available',
      isOnline: true,
      onboardingComplete: false,
      theme: 'dark',
    };

    try {
      await setDoc(doc(db, 'users', result.user.uid), {
        ...profileData,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
    } catch {
      // Firestore write failed - still proceed with local profile
    }

    setProfile({ uid: result.user.uid, ...profileData });
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await fetchOrCreateProfile(result.user);
    } catch (error: unknown) {
      const authError = error as { code?: string };
      // If auth actually succeeded despite the error (e.g. iframe error after
      // popup completed), don't re-throw — onAuthStateChanged will handle it
      if (auth.currentUser) {
        return;
      }
      if (authError.code !== 'auth/popup-closed-by-user') {
        throw error;
      }
    }
  };

  const logout = async () => {
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        });
      } catch {
        // Firestore update failed - still proceed with logout
      }
    }
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), data);
    setProfile(prev => prev ? { ...prev, ...data } : null);
  };

  const canDo = (permission: Permission): boolean => {
    return can(profile?.siteRole, permission);
  };

  const hasRoleLevel = (role: UserRole): boolean => {
    return hasRole(profile?.siteRole, role);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      logout,
      updateUserProfile,
      can: canDo,
      hasRole: hasRoleLevel,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
