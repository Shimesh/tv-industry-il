import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const adminAuth = require('firebase-admin/auth') as {
  getAuth: (app?: ReturnType<typeof getApp>) => {
    verifyIdToken: (idToken: string) => Promise<{
      uid: string;
      email?: string;
      name?: string;
      picture?: string;
      phone_number?: string;
    }>;
    getUser: (uid: string) => Promise<{
      uid: string;
      email?: string;
      displayName?: string;
      photoURL?: string;
    }>;
    deleteUser: (uid: string) => Promise<void>;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const adminFirestore = require('firebase-admin/firestore') as {
  getFirestore: (app?: ReturnType<typeof getApp>) => {
    batch: () => {
      set: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => unknown;
      update: (ref: unknown, data: Record<string, unknown>) => unknown;
      delete: (ref: unknown) => unknown;
      commit: () => Promise<unknown>;
    };
    doc: (path: string) => unknown;
  };
};

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() || process.env.FIREBASE_PROJECT_ID?.trim() || '';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() || '';
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase admin service account is not configured');
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getFirebaseAdminAuth() {
  return adminAuth.getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminMessaging() {
  return getMessaging(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  return adminFirestore.getFirestore(getFirebaseAdminApp());
}
