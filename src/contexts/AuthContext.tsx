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
  console.log('[AUTH] fetchOrCreateProfile - start for uid:', firebaseUser.uid, 'email:', firebaseUser.email);
  try {
    const profileRef = doc(db, 'users', firebaseUser.uid);
    console.log('[AUTH] fetchOrCreateProfile - calling getDoc...');
    const profileSnap = await getDoc(profileRef);
    console.log('[AUTH] fetchOrCreateProfile - getDoc result: exists =', profileSnap.exists());

    if (profileSnap.exists()) {
      // Update online status (non-blocking)
      updateDoc(profileRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
      return { uid: firebaseUser.uid, ...profileSnap.data() } as UserProfile;
    }

    // Profile doesn't exist yet - create it
    console.log('[AUTH] fetchOrCreateProfile - creating new profile...');
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
    console.log('[AUTH] fetchOrCreateProfile - profile created successfully');

    return { uid: firebaseUser.uid, ...profileData };
  } catch (error) {
    console.error('[AUTH] fetchOrCreateProfile - ERROR:', error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Handle Google redirect result FIRST, then listen to auth state
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      console.log('[AUTH] 1. init() started');
      // Process pending Google redirect result BEFORE listening to auth state.
      // Without this, onAuthStateChanged fires with null (user not yet resolved),
      // sets loading=false, and the login page thinks no one is logged in.
      try {
        console.log('[AUTH] 2. calling getRedirectResult...');
        const result = await getRedirectResult(auth);
        console.log('[AUTH] 3. getRedirectResult returned:', result ? `user=${result.user?.email}` : 'null (not a redirect)');
        if (result?.user) {
          console.log('[AUTH] 3a. redirect user found, fetching profile...');
          await fetchOrCreateProfile(result.user);
          // Don't redirect here - onAuthStateChanged will fire and handle it
        }
      } catch (error) {
        console.error('[AUTH] 3-ERROR. getRedirectResult failed:', error);
      }

      // NOW listen to auth state changes (fires immediately with current state)
      console.log('[AUTH] 4. setting up onAuthStateChanged listener...');
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        console.log('[AUTH] 5. onAuthStateChanged fired, user:', firebaseUser?.email ?? 'null');
        setUser(firebaseUser);
        if (firebaseUser) {
          console.log('[AUTH] 6. user exists, fetching profile...');
          const userProfile = await fetchOrCreateProfile(firebaseUser);
          console.log('[AUTH] 7. profile result:', userProfile ? 'loaded' : 'null');
          setProfile(userProfile);
        } else {
          console.log('[AUTH] 6. no user, clearing profile');
          setProfile(null);
        }
        console.log('[AUTH] 8. setLoading(false) - auth flow complete');
        setLoading(false);
      });
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
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
