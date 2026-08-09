const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { getAuthUrl, exchangeCodeForTokens, getUserEmailAddress } = require('../lib/googleOAuth');

function createGmailRouter(pool, wsHub) {
  const router = express.Router();

  router.get('/status', asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT gmail_address, connected_at FROM email_accounts WHERE user_id = ?',
      [req.session.userId]
    );
    if (rows.length === 0) {
      return res.json({ connected: false });
    }
    res.json({ connected: true, gmailAddress: rows[0].gmail_address, connectedAt: rows[0].connected_at });
  }));

  router.get('/connect', (req, res) => {
    res.redirect(getAuthUrl());
  });

  router.get('/oauth/callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    const tokens = await exchangeCodeForTokens(code);
    const gmailAddress = await getUserEmailAddress(tokens.access_token);

    await pool.query(
      `INSERT INTO email_accounts (user_id, gmail_address, refresh_token, connected_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE gmail_address = VALUES(gmail_address), refresh_token = VALUES(refresh_token), connected_at = VALUES(connected_at)`,
      [req.session.userId, gmailAddress, tokens.refresh_token]
    );

    if (wsHub) {
      const [rows] = await pool.query(
        'SELECT gmail_address, connected_at FROM email_accounts WHERE user_id = ?',
        [req.session.userId]
      );
      wsHub.emitToUser(req.session.userId, 'gmail:status', { connected: true, gmailAddress: rows[0].gmail_address, connectedAt: rows[0].connected_at });
    }
    res.redirect(`${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/?gmail=connected`);
  }));

  router.post('/disconnect', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM email_accounts WHERE user_id = ?', [req.session.userId]);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'gmail:status', { connected: false });
    res.json({ ok: true });
  }));

  return router;
}

module.exports = createGmailRouter;
