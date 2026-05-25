import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import type { Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? '',
};

const isBuildTime = !firebaseConfig.apiKey && typeof window === 'undefined';

const isNewApp = getApps().length === 0;
const app: FirebaseApp = isNewApp
  ? initializeApp(isBuildTime ? { ...firebaseConfig, apiKey: 'build-placeholder' } : firebaseConfig)
  : getApp();

// memoryLocalCache avoids IndexedDB which can cause lock contention when Service Workers
// are transitioning (especially after SW updates). For a real-time chat app, in-memory
// cache is sufficient — fresh data always comes from the live onSnapshot subscription.
const db: Firestore =
  isNewApp
    ? initializeFirestore(app, { localCache: memoryLocalCache() })
    : getFirestore(app);

const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

// firebase/messaging must NEVER be imported at the module level — it accesses
// browser-only APIs (Notification, ServiceWorkerRegistration) during initialization
// and will crash SSR. Dynamic import keeps it fully isolated to the browser.
let _messagingCache: Messaging | null = null;
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (_messagingCache) return _messagingCache;
  const { getMessaging, isSupported } = await import('firebase/messaging');
  const supported = await isSupported();
  if (!supported) return null;
  _messagingCache = getMessaging(app);
  return _messagingCache;
}

// No-op kept for backward compat with existing imports
export async function ensureOnline() {}

export { app, db, auth, storage, googleProvider };
export default app;
