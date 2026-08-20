import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, setLogLevel } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfigJson from '../firebase-applet-config.json' with { type: 'json' };

// Silence internal Firestore SDK verbose logging & handle BloomFilter fallback noise
try {
  setLogLevel('silent');
} catch {
  // Ignore
}

if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : a?.message || String(a))).join(' ');
    if (msg.includes('BloomFilter') || msg.includes('Invalid hash count')) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const firestoreSettings = {
  localCache: memoryLocalCache(),
  experimentalAutoDetectLongPolling: true,
};

export const db = firebaseConfigJson.firestoreDatabaseId && firebaseConfigJson.firestoreDatabaseId !== '(default)'
  ? initializeFirestore(app, firestoreSettings, firebaseConfigJson.firestoreDatabaseId)
  : initializeFirestore(app, firestoreSettings);

export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Auto-initialize anonymous auth for web client permissions
if (typeof window !== 'undefined') {
  signInAnonymously(auth).catch((err) => {
    console.warn('⚡ [Firebase Auth] Anonymous auth initialization warning:', err.message);
  });
}
