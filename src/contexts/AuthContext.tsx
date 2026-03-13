'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  department: string;
  role: string;
  phone: string;
  skills: string[];
  bio: string;
  status: 'available' | 'busy' | 'offline';
  isOnline: boolean;
  onboardingComplete: boolean;
  theme: string;
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
});

async function fetchOrCreateProfile(firebaseUser: User): Promise<UserProfile | null> {
  try {
    const profileRef = doc(db, 'users', firebaseUser.uid);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      // Update online status (non-blocking)
      updateDoc(profileRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
      return { uid: firebaseUser.uid, ...profileSnap.data() } as UserProfile;
    }

    // Profile doesn't exist yet - create it
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
    // Firestore operations failed (likely security rules) - auth still works
    console.warn('Firestore profile fetch failed - user is authenticated but profile unavailable');
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Handle Google redirect result on page load
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          const userProfile = await fetchOrCreateProfile(result.user);
          if (userProfile) setProfile(userProfile);
        }
      })
      .catch(() => {});
  }, []);

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
      console.warn('Firestore profile creation failed');
    }

    setProfile({ uid: result.user.uid, ...profileData });
  };

  const signInWithGoogle = async () => {
    // Always use redirect - popups are blocked in production/iframes
    await signInWithRedirect(auth, googleProvider);
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
    setProfile(null);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), data);
    setProfile(prev => prev ? { ...prev, ...data } : null);
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
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
