import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import firebaseConfigJson from '../firebase-applet-config.json' with { type: 'json' };

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
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Auto-initialize anonymous auth for web client permissions
if (typeof window !== 'undefined') {
  signInAnonymously(auth).catch((err) => {
    console.warn('⚡ [Firebase Auth] Anonymous auth initialization warning:', err.message);
  });
}

