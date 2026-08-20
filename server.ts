import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/apiRouter.js';
import { setupSocketIO } from './src/server/socketHandler.js';
import { adminDb } from './src/server/firebaseAdmin.js';
import { db } from './src/server/db.js';
import config from './firebase-applet-config.json' with { type: 'json' };

async function startServer() {
  console.log('[Backend] Starting Ahun Bingo backend...');

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://melodic-ganache-8bad94.netlify.app';
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || config.projectId || 'exalted-strata-468319-j8';
  const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || config.firestoreDatabaseId || 'ai-studio-ahunbingotelegra-e5b271a0-ddaa-40da-8f1e-b1ac2490e1df';

  // Allowed origins list
  const allowedOrigins = [
    'https://melodic-ganache-8bad94.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];
  const customOrigins = [process.env.FRONTEND_URL, process.env.ADMIN_URL, process.env.ALLOWED_ORIGINS];
  customOrigins.forEach((envVal) => {
    if (envVal) {
      envVal.split(',').forEach((u) => {
        const trimmed = u.trim().replace(/\/+$/, '');
        if (trimmed && !allowedOrigins.includes(trimmed)) {
          allowedOrigins.push(trimmed);
        }
      });
    }
  });

  // Check Firebase Firestore connectivity
  try {
    const testSnap = await adminDb.collection('settings').doc('platformConfig').get();
    console.log(`[Firestore] Connected to database: ${firestoreDatabaseId} (platformConfig exists: ${testSnap.exists})`);
  } catch (err: any) {
    console.warn('[Firestore] Notice during startup connection check:', err.message || err);
  }

  // Initialize In-Memory Data Store Synchronization
  try {
    await db.initFirestoreSync();
    console.log('[Backend] Memory store synchronized with Firestore');
  } catch (err: any) {
    console.warn('[Backend] Notice during memory store sync:', err.message || err);
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS headers middleware with safe origin reflection & credentials support
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.netlify.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('run.app')
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || FRONTEND_URL);
      }
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || FRONTEND_URL);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-admin-token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Health Check Endpoints
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      app: 'Ahun Bingo Telegram Mini App',
      environment: process.env.NODE_ENV || 'production',
      time: new Date().toISOString(),
    });
  });

  app.get('/api/health/firebase', async (req, res) => {
    try {
      const snap = await adminDb.collection('settings').doc('platformConfig').get();
      res.status(200).json({
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
  const io = setupSocketIO(server);
  if (!io) {
    throw new Error('Fatal: Socket.IO failed to initialize');
  }
  console.log('[Socket.IO] Initialized');

  // Vite middleware for dev / static for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Backend] Listening on port ${PORT}`);
  });
}

// Global Fatal Error Handlers
process.on('uncaughtException', (err) => {
  console.error('💥 [Fatal Server Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [Fatal Server Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch((err) => {
  console.error('💥 [Fatal Server Error] Uncaught error in startServer:', err);
  process.exit(1);
});
