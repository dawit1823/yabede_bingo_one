import { initializeApp, getApps, getApp, cert, AppOptions } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import config from '../../firebase-applet-config.json' with { type: 'json' };
import { logger } from './logger.js';

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  config.projectId ||
  'exalted-strata-468319-j8';

const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const databaseId =
  process.env.FIREBASE_FIRESTORE_DATABASE_ID ||
  config.firestoreDatabaseId ||
  'ai-studio-ahunbingotelegra-e5b271a0-ddaa-40da-8f1e-b1ac2490e1df';

let firebaseApp;

if (getApps().length === 0) {
  const options: AppOptions = {
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || config.storageBucket,
  };

  if (clientEmail && rawPrivateKey) {
    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
    options.credential = cert({
      projectId,
      clientEmail,
      privateKey,
    });
    logger.info(`🔥 [FirebaseAdmin] Initialized with Service Account (${clientEmail})`);
  } else {
    logger.info(`🔥 [FirebaseAdmin] Initialized with Project ID: ${projectId}`);
  }

  try {
    firebaseApp = initializeApp(options);
  } catch (err: any) {
    logger.error('🔥 [FirebaseAdmin] Fatal error initializing Firebase Admin App:', err.message);
    throw err;
  }
} else {
  firebaseApp = getApp();
}

export const app = firebaseApp;

export const adminDb: Firestore =
  databaseId && databaseId !== '(default)'
    ? getFirestore(app, databaseId)
    : getFirestore(app);

// Enable ignoreUndefinedProperties so undefined fields are ignored automatically without crashing
try {
  adminDb.settings({ ignoreUndefinedProperties: true });
} catch (err: any) {
  logger.debug('Firestore settings note:', err.message || err);
}

export const adminAuth: Auth = getAuth(app);
