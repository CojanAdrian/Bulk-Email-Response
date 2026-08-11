const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const createAuthRouter = require('./routes/auth');
const { createLoadsRouter } = require('./routes/loads');
const createGmailRouter = require('./routes/gmail');
const createInquiriesRouter = require('./routes/inquiries');
const requireAuth = require('./middleware/requireAuth');
const { createMemoryStore } = require('./lib/sessionStore');

// In production (the Docker image), the frontend's built assets are copied
// to ../frontend-dist alongside this backend and served directly -- one
// container, one process, no separate frontend host/CORS needed. In local
// dev this directory doesn't exist (the frontend runs via its own Vite dev
// server instead), so everything below is a no-op then.
const FRONTEND_DIST_PATH = path.join(__dirname, '..', '..', 'frontend-dist');
const FRONTEND_INDEX_PATH = path.join(FRONTEND_DIST_PATH, 'index.html');

// A login lasts 30 days -- `rolling: true` pushes that expiry out on every
// authenticated request, so an active user effectively never gets logged
// out just from time passing.
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function createApp(pool, wsHub, store) {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(session({
    store: store || createMemoryStore(),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS },
  }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', createAuthRouter(pool));
  app.use('/api/loads', requireAuth, createLoadsRouter(pool, wsHub));
  app.use('/api/gmail', requireAuth, createGmailRouter(pool, wsHub));
  app.use('/api/inquiries', requireAuth, createInquiriesRouter(pool, wsHub));

  if (fs.existsSync(FRONTEND_INDEX_PATH)) {
    app.use(express.static(FRONTEND_DIST_PATH));
    // Client-side routes (anything not /api/*) fall through to index.html
    // so the frontend's own router/tabs handle the path, same as any
    // single-page app served alongside its API.
    app.get('*', (req, res) => {
      res.sendFile(FRONTEND_INDEX_PATH);
    });
  }

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
