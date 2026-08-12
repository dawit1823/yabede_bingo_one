import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/apiRouter.js';
import { setupSocketIO } from './src/server/socketHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const FRONTEND_URL = process.env.FRONTEND_URL || '';

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

  // Health Check Endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'Ahun Bingo Telegram Mini App', time: new Date().toISOString() });
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
    console.log(`Ahun Bingo Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
