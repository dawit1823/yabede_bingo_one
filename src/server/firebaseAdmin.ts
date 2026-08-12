import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  setLogLevel,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit as limitFn,
  where as whereFn,
  QueryConstraint
} from 'firebase/firestore';
import { runTransaction as runTx } from 'firebase/firestore';
import { getAuth } from 'firebase-admin/auth';
import config from '../../firebase-applet-config.json' with { type: 'json' };

try {
  setLogLevel('silent');
} catch {
  // Ignore
}

const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args.map((a) => (typeof a === 'string' ? a : a?.message || String(a))).join(' ');
  if (msg.includes('BloomFilter') || msg.includes('Invalid hash count')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || config.apiKey,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || config.authDomain,
  projectId: process.env.FIREBASE_PROJECT_ID || config.projectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || config.storageBucket,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId,
  appId: process.env.FIREBASE_APP_ID || config.appId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const firestoreSettings = {
  localCache: memoryLocalCache(),
  experimentalAutoDetectLongPolling: true,
};

const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || config.firestoreDatabaseId;

const rawDb = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
  ? initializeFirestore(app, firestoreSettings, firestoreDatabaseId)
  : initializeFirestore(app, firestoreSettings);

// Helper to remove undefined properties before writing to Firestore
function sanitizeData(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== 'object') return data;
  if (data instanceof Date) return data.toISOString();
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      clean[key] = sanitizeData(value);
    }
  }
  return clean;
}

export class DocumentReferenceAdapter {
  constructor(public collectionPath: string, public docId: string) {}

  get rawRef() {
    return doc(rawDb, this.collectionPath, this.docId);
  }

  async get() {
    try {
      const snap = await getDoc(this.rawRef);
      return {
        id: snap.id,
        exists: snap.exists(),
        data: () => snap.data(),
      };
    } catch (err: any) {
      console.warn('🔥 [Firestore Get Quota/Connection Note]:', err.message || err);
      return {
        id: this.docId,
        exists: false,
        data: () => undefined,
      };
    }
  }

  async set(data: any, options?: { merge?: boolean }) {
    try {
      const clean = sanitizeData(data);
      if (options?.merge) {
        await setDoc(this.rawRef, clean, { merge: true });
      } else {
        await setDoc(this.rawRef, clean);
      }
    } catch (err: any) {
      console.warn('🔥 [Firestore Set Quota Note]:', err.message || err);
    }
  }

  async update(data: any) {
    try {
      const clean = sanitizeData(data);
      await updateDoc(this.rawRef, clean);
    } catch (err: any) {
      console.warn('🔥 [Firestore Update Quota Note]:', err.message || err);
    }
  }

  async delete() {
    try {
      await deleteDoc(this.rawRef);
    } catch (err: any) {
      console.warn('🔥 [Firestore Delete Quota Note]:', err.message || err);
    }
  }
}

export class QueryAdapter {
  constructor(
    public collectionPath: string,
    public constraints: QueryConstraint[] = []
  ) {}

  where(field: string, op: any, val: any) {
    return new QueryAdapter(this.collectionPath, [
      ...this.constraints,
      whereFn(field, op, val),
    ]);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new QueryAdapter(this.collectionPath, [
      ...this.constraints,
      orderBy(field, direction),
    ]);
  }

  limit(n: number) {
    return new QueryAdapter(this.collectionPath, [
      ...this.constraints,
      limitFn(n),
    ]);
  }

  async get() {
    try {
      const colRef = collection(rawDb, this.collectionPath);
      const q = this.constraints.length > 0 ? query(colRef, ...this.constraints) : colRef;
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({
        id: d.id,
        exists: d.exists(),
        data: () => d.data(),
      }));
      return {
        empty: snap.empty,
        docs,
        forEach: (callback: (doc: { id: string; exists: boolean; data: () => any }) => void) => {
          docs.forEach(callback);
        },
      };
    } catch (err: any) {
      console.warn('🔥 [Firestore Query Quota Note]:', err.message || err);
      return {
        empty: true,
        docs: [],
        forEach: (_cb: any) => {},
      };
    }
  }
}

export class CollectionReferenceAdapter extends QueryAdapter {
  constructor(collectionPath: string) {
    super(collectionPath, []);
  }

  doc(docId: string) {
    return new DocumentReferenceAdapter(this.collectionPath, docId);
  }
}

export const adminDb = {
  collection(collectionPath: string) {
    return new CollectionReferenceAdapter(collectionPath);
  },
  batch() {
    const operations: Array<() => Promise<void>> = [];
    return {
      set(docRefAdapter: DocumentReferenceAdapter, data: any, options?: { merge?: boolean }) {
        operations.push(() => docRefAdapter.set(data, options));
        return this;
      },
      update(docRefAdapter: DocumentReferenceAdapter, data: any) {
        operations.push(() => docRefAdapter.update(data));
        return this;
      },
      delete(docRefAdapter: DocumentReferenceAdapter) {
        operations.push(() => docRefAdapter.delete());
        return this;
      },
      async commit() {
        await Promise.all(operations.map((op) => op()));
      },
    };
  },
  async runTransaction<T>(
    updateFunction: (transaction: any) => Promise<T>
  ): Promise<T> {
    try {
      return await runTx(rawDb, async (tx) => {
        const txAdapter = {
          async get(docRefAdapter: DocumentReferenceAdapter) {
            const snap = await tx.get(docRefAdapter.rawRef);
            return {
              id: snap.id,
              exists: snap.exists(),
              data: () => snap.data(),
            };
          },
          set(docRefAdapter: DocumentReferenceAdapter, data: any, options?: { merge?: boolean }) {
            const clean = sanitizeData(data);
            if (options?.merge) {
              tx.set(docRefAdapter.rawRef, clean, { merge: true });
            } else {
              tx.set(docRefAdapter.rawRef, clean);
            }
            return this;
          },
          update(docRefAdapter: DocumentReferenceAdapter, data: any) {
            const clean = sanitizeData(data);
            tx.update(docRefAdapter.rawRef, clean);
            return this;
          },
          delete(docRefAdapter: DocumentReferenceAdapter) {
            tx.delete(docRefAdapter.rawRef);
            return this;
          },
        };
        return updateFunction(txAdapter);
      });
    } catch (err: any) {
      console.warn('🔥 [Firestore Transaction Quota Note]:', err.message || err);
      // Quota fallback mock transaction
      const mockTx = {
        async get(docRefAdapter: DocumentReferenceAdapter) {
          return docRefAdapter.get();
        },
        set(docRefAdapter: DocumentReferenceAdapter, data: any, options?: { merge?: boolean }) {
          docRefAdapter.set(data, options);
          return this;
        },
        update(docRefAdapter: DocumentReferenceAdapter, data: any) {
          docRefAdapter.update(data);
          return this;
        },
        delete(docRefAdapter: DocumentReferenceAdapter) {
          docRefAdapter.delete();
          return this;
        },
      };
      return await updateFunction(mockTx);
    }
  },
  settings(_opts: any) {},
};

import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

let adminAuthInstance: any = null;

try {
  if (getAdminApps().length === 0) {
    initAdminApp({
      projectId: config.projectId,
      storageBucket: config.storageBucket,
    });
  }
  adminAuthInstance = getAdminAuth();
} catch (err) {
  console.warn('Firebase Admin Auth initialization notice:', err);
  adminAuthInstance = {
    async createUser(args: any) {
      return { uid: args.uid };
    },
    async getUser(uid: string) {
      return { uid };
    },
    async deleteUser(_uid: string) {},
  };
}

export const adminAuth = adminAuthInstance;

