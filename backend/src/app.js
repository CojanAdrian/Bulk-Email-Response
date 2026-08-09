const express = require('express');
const session = require('express-session');
const cors = require('cors');
const createAuthRouter = require('./routes/auth');
const { createLoadsRouter } = require('./routes/loads');
const createGmailRouter = require('./routes/gmail');
const createInquiriesRouter = require('./routes/inquiries');
const requireAuth = require('./middleware/requireAuth');
const { store } = require('./lib/sessionStore');

function createApp(pool, wsHub) {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(session({
    store,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', createAuthRouter(pool));
  app.use('/api/loads', requireAuth, createLoadsRouter(pool, wsHub));
  app.use('/api/gmail', requireAuth, createGmailRouter(pool, wsHub));
  app.use('/api/inquiries', requireAuth, createInquiriesRouter(pool, wsHub));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
