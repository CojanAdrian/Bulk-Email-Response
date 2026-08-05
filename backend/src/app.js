const express = require('express');
const session = require('express-session');
const cors = require('cors');
const createAuthRouter = require('./routes/auth');
const { createLoadsRouter } = require('./routes/loads');
const requireAuth = require('./middleware/requireAuth');

function createApp(pool) {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', createAuthRouter(pool));
  app.use('/api/loads', requireAuth, createLoadsRouter(pool));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
