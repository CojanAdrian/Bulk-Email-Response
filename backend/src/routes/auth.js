const express = require('express');
const bcrypt = require('bcrypt');
const asyncHandler = require('../lib/asyncHandler');
const requireAuth = require('../middleware/requireAuth');

function createAuthRouter(pool) {
  const router = express.Router();

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
    res.json({ username: user.username });
  }));

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ ok: true });
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ username: req.session.username });
  });

  return router;
}

module.exports = createAuthRouter;
