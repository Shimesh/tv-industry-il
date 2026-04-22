import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app';
const adminAuth = require('firebase-admin/auth') as {
  getAuth: (app?: ReturnType<typeof getApp>) => {
    verifyIdToken: (idToken: string) => Promise<{
      uid: string;
      email?: string;
      name?: string;
      picture?: string;
    }>;
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
