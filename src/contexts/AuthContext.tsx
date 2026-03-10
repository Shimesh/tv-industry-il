'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Handle Google redirect result on page load
  useEffect(() => {
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        const profileRef = doc(db, 'users', result.user.uid);
        const profileSnap = await getDoc(profileRef);
        if (!profileSnap.exists()) {
          const profileData: Omit<UserProfile, 'uid'> = {
            displayName: result.user.displayName || 'משתמש חדש',
            email: result.user.email || '',
            photoURL: result.user.photoURL,
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
          setProfile({ uid: result.user.uid, ...profileData });
        }
      }
    }).catch(() => {
      // Redirect result errors handled silently
    });
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create user profile
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setProfile({ uid: firebaseUser.uid, ...profileSnap.data() } as UserProfile);
          // Update online status
          await updateDoc(profileRef, { isOnline: true, lastSeen: serverTimestamp() });
        }
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

    // Create user profile in Firestore
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

    await setDoc(doc(db, 'users', result.user.uid), {
      ...profileData,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });

    setProfile({ uid: result.user.uid, ...profileData });
  };

  const signInWithGoogle = async () => {
    try {
      // Try popup first (works on localhost and some browsers)
      const result = await signInWithPopup(auth, googleProvider);
      const profileRef = doc(db, 'users', result.user.uid);
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        const profileData: Omit<UserProfile, 'uid'> = {
          displayName: result.user.displayName || 'משתמש חדש',
          email: result.user.email || '',
          photoURL: result.user.photoURL,
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

        setProfile({ uid: result.user.uid, ...profileData });
      }
    } catch (popupError: unknown) {
      const err = popupError as { code?: string };
      // If popup blocked or fails, fall back to redirect
      if (err.code === 'auth/popup-blocked' ||
          err.code === 'auth/popup-closed-by-user' ||
          err.code === 'auth/cancelled-popup-request') {
        // For popup-closed, user cancelled - don't redirect
        if (err.code === 'auth/popup-closed-by-user') throw popupError;
      }
      // For any other popup error, use redirect
      await signInWithRedirect(auth, googleProvider);
    }
  };

  const logout = async () => {
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), {
        isOnline: false,
        lastSeen: serverTimestamp(),
      });
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
