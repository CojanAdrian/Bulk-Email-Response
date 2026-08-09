const express = require('express');
const bcrypt = require('bcrypt');
const asyncHandler = require('../lib/asyncHandler');
const requireAuth = require('../middleware/requireAuth');
const { getSignInAuthUrl, exchangeSignInCodeForTokens, getGoogleIdentity } = require('../lib/googleOAuth');

const MIN_PASSWORD_LENGTH = 8;

function frontendUrl(path) {
  return `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}${path}`;
}

function createAuthRouter(pool) {
  const router = express.Router();

  router.post('/register', asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const [existingRows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let result;
    try {
      [result] = await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [username, passwordHash, 'user']
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Username already taken' });
      }
      throw err;
    }

    req.session.userId = result.insertId;
    req.session.username = username;
    req.session.role = 'user';
    res.json({ username, role: 'user' });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    // A Google-only account (no password ever set) has password_hash NULL --
    // bcrypt.compare requires a string hash, so this must be rejected before
    // reaching it rather than crashing into a 500.
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ username: user.username, role: user.role });
  }));

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ ok: true });
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ username: req.session.username, role: req.session.role });
  });

  router.get('/google', (req, res) => {
    res.redirect(getSignInAuthUrl());
  });

  router.get('/google/callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.redirect(frontendUrl('/?authError=missing_code'));
    }

    let tokens;
    try {
      tokens = await exchangeSignInCodeForTokens(code);
    } catch (err) {
      return res.redirect(frontendUrl('/?authError=google_auth_failed'));
    }

    const identity = await getGoogleIdentity(tokens.access_token);
    if (!identity.emailVerified) {
      return res.redirect(frontendUrl('/?authError=email_not_verified'));
    }

    const [existingRows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [identity.googleId]);
    let user = existingRows[0];

    if (!user) {
      try {
        const [result] = await pool.query(
          "INSERT INTO users (username, password_hash, google_id, role) VALUES (?, NULL, ?, 'user')",
          [identity.email, identity.googleId]
        );
        user = { id: result.insertId, username: identity.email, role: 'user' };
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.redirect(frontendUrl('/?authError=account_exists'));
        }
        throw err;
      }
    }

    // Same token pair that authenticated the sign-in also connects Gmail --
    // this is the "auto-connect on Google sign-up" behavior. Only meaningful
    // if a refresh_token actually came back (always true for
    // access_type=offline + prompt=consent, but don't clobber an existing
    // connection on the rare response that omits one).
    if (tokens.refresh_token) {
      await pool.query(
        `INSERT INTO email_accounts (user_id, gmail_address, refresh_token, connected_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE gmail_address = VALUES(gmail_address), refresh_token = VALUES(refresh_token), connected_at = VALUES(connected_at)`,
        [user.id, identity.email, tokens.refresh_token]
      );
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.redirect(frontendUrl('/'));
  }));

  return router;
}

module.exports = createAuthRouter;
