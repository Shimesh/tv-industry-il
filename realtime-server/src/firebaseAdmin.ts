import admin from 'firebase-admin';
import type { App as FirebaseAdminApp, ServiceAccount as FirebaseServiceAccount } from 'firebase-admin';
import type { Auth as FirebaseAuth } from 'firebase-admin/auth';
import type { Firestore as FirebaseFirestore } from 'firebase-admin/firestore';
import { getFirebaseServiceAccountJson, realtimeConfig } from './config.js';

let app: FirebaseAdminApp | null = null;

export function getFirebaseAdminApp(): FirebaseAdminApp {
  if (app) return app;

  const serviceAccount = getFirebaseServiceAccountJson();
  if (serviceAccount) {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as FirebaseServiceAccount),
      projectId: realtimeConfig.firebaseProjectId,
      storageBucket: realtimeConfig.storageBucket || undefined,
    });
    return app;
  }

  app = admin.initializeApp({
    projectId: realtimeConfig.firebaseProjectId,
    storageBucket: realtimeConfig.storageBucket || undefined,
  });
  return app;
}

export function getFirebaseAuth(): FirebaseAuth {
  return getFirebaseAdminApp().auth();
}

export function getFirestore(): FirebaseFirestore {
  return getFirebaseAdminApp().firestore();
}
