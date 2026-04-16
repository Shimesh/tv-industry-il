import { initializeApp, getApps, getApp } from 'firebase/app';
// הוספנו כאן את הכלים לאתחול חכם וזיכרון מקומי
import { getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

const isBrowser = typeof window !== 'undefined';
const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.storageBucket &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

let app: ReturnType<typeof getApp> | null = null;
if (isBrowser) {
  if (hasFirebaseConfig && getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else if (getApps().length > 0) {
    app = getApp();
  }
}

let firestoreDb: any = null;
let authInstance: any = null;
let storageInstance: any = null;
let googleProviderInstance: any = null;

if (app) {
  googleProviderInstance = new GoogleAuthProvider();

  if (isBrowser) {
    firestoreDb = initializeFirestore(app, {
      localCache: persistentLocalCache(),
    });
    authInstance = getAuth(app);
    storageInstance = getStorage(app);
    setPersistence(authInstance, browserLocalPersistence).catch(() => {});
  } else {
    firestoreDb = getFirestore(app);
    authInstance = getAuth(app);
    storageInstance = getStorage(app);
  }
}

export const db = firestoreDb;
export const auth = authInstance;
export const storage = storageInstance;
export const googleProvider = googleProviderInstance;

// No-op kept for backward compat with imports
export async function ensureOnline() {}

export default app;