import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

// These values are public by design (they identify the project, they are not secrets).
// Access is protected by Firestore security rules, not by hiding the config.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | undefined;

function getApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured. Copy .env.example to .env.local and fill it in.");
  }
  app ??= getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function auth(): Auth {
  return getAuth(getApp());
}

let firestore: Firestore | undefined;

/**
 * Firestore keeps a copy of everything it read in IndexedDB, so the app works offline:
 * puzzles and training load from the copy, and saves wait until you're back online.
 */
export function db(): Firestore {
  if (!firestore) {
    try {
      firestore = initializeFirestore(getApp(), {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      // Already set up (a hot reload in dev re-runs this module).
      firestore = getFirestore(getApp());
    }
  }
  return firestore;
}

export const googleProvider = new GoogleAuthProvider();
