import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/apiRouter.js';
import { setupSocketIO } from './src/server/socketHandler.js';
import { adminDb } from './src/server/firebaseAdmin.js';
import { db } from './src/server/db.js';
import config from './firebase-applet-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const FRONTEND_URL = process.env.FRONTEND_URL || '';
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || config.projectId || 'exalted-strata-468319-j8';
  const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || config.firestoreDatabaseId || 'ai-studio-ahunbingotelegra-e5b271a0-ddaa-40da-8f1e-b1ac2490e1df';

  console.log(`🚀 [Startup] Ahun Bingo Backend Starting...`);
  console.log(`ℹ️ [Startup] Environment: NODE_ENV=${process.env.NODE_ENV || 'development'}, PORT=${PORT}`);
  console.log(`ℹ️ [Startup] Firebase Project: ${firebaseProjectId}, Firestore DB: ${firestoreDatabaseId}`);

  // Test Firebase Firestore database connection
  try {
    console.log('🔥 [Startup] Checking Firebase Firestore database connection...');
    const testSnap = await adminDb.collection('settings').doc('platformConfig').get();
    console.log(`✅ [Startup] Firestore database connected successfully. Config exists: ${testSnap.exists}`);
  } catch (err: any) {
    console.warn('⚠️ [Startup Notice] Firestore database connection note:', err.message || err);
  }

  // Initialize In-Memory Data Store Synchronization
  try {
    console.log('🎮 [Startup] Synchronizing memory store with Cloud Firestore...');
    await db.initFirestoreSync();
    console.log('✅ [Startup] Memory store sync finished.');
  } catch (err: any) {
    console.warn('⚠️ [Startup Notice] In-memory store sync note:', err.message || err);
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS headers for Telegram WebApp iframe & Netlify frontend
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else if (FRONTEND_URL) {
      res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Health Check Endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'Ahun Bingo Telegram Mini App',
      environment: process.env.NODE_ENV || 'development',
      time: new Date().toISOString(),
    });
  });

  app.get('/api/health/firebase', async (req, res) => {
    try {
      const snap = await adminDb.collection('settings').doc('platformConfig').get();
      res.json({
        status: 'ok',
        firebase: 'connected',
        projectId: firebaseProjectId,
        databaseId: firestoreDatabaseId,
        configExists: snap.exists,
        time: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        firebase: 'disconnected',
        error: err.message || String(err),
        time: new Date().toISOString(),
      });
    }
  });

  // API Routes FIRST
  app.use('/api', apiRouter);

  // HTTP Server & Socket.IO Setup
  const server = http.createServer(app);
  setupSocketIO(server);

  // Vite middleware for dev / static for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ [Ahun Bingo Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('💥 [Fatal Server Error] Uncaught error in startServer:', err);
});
