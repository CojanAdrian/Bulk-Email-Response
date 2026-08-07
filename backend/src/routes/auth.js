const express = require('express');
const bcrypt = require('bcrypt');
const asyncHandler = require('../lib/asyncHandler');
const requireAuth = require('../middleware/requireAuth');

const MIN_PASSWORD_LENGTH = 8;

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
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, passwordHash, 'user']
    );

    req.session.userId = result.insertId;
    req.session.username = username;
    req.session.role = 'user';
    res.json({ username, role: 'user' });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user) {
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

  return router;
}

module.exports = createAuthRouter;
