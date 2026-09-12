const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { getAuthUrl, exchangeCodeForTokens, getUserEmailAddress } = require('../lib/googleOAuth');

function createGmailRouter(pool, wsHub) {
  const router = express.Router();

  async function fetchStatus(userId) {
    const [rows] = await pool.query(
      'SELECT gmail_address, connected_at, auto_send_enabled, signature FROM email_accounts WHERE user_id = ?',
      [userId]
    );
    if (rows.length === 0) return { connected: false };
    return {
      connected: true,
      gmailAddress: rows[0].gmail_address,
      connectedAt: rows[0].connected_at,
      autoSendEnabled: Boolean(rows[0].auto_send_enabled),
      signature: rows[0].signature || '',
    };
  }

  router.get('/status', asyncHandler(async (req, res) => {
    res.json(await fetchStatus(req.session.userId));
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

    if (wsHub) wsHub.emitToUser(req.session.userId, 'gmail:status', await fetchStatus(req.session.userId));
    res.redirect(`${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/?gmail=connected`);
  }));

  router.post('/disconnect', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM email_accounts WHERE user_id = ?', [req.session.userId]);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'gmail:status', { connected: false });
    res.json({ ok: true });
  }));

  router.patch('/auto-send', asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    const [existingRows] = await pool.query('SELECT id FROM email_accounts WHERE user_id = ?', [req.session.userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'No Gmail account connected' });
    }

    await pool.query('UPDATE email_accounts SET auto_send_enabled = ? WHERE user_id = ?', [enabled ? 1 : 0, req.session.userId]);

    const status = await fetchStatus(req.session.userId);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'gmail:status', status);
    res.json(status);
  }));

  // Sets the text appended to every outgoing reply sent through this
  // account -- auto-sent and manually-sent alike (see appendSignature in
  // replyComposer.js, applied at every send call site).
  router.patch('/signature', asyncHandler(async (req, res) => {
    const { signature } = req.body;
    const [existingRows] = await pool.query('SELECT id FROM email_accounts WHERE user_id = ?', [req.session.userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'No Gmail account connected' });
    }

    await pool.query('UPDATE email_accounts SET signature = ? WHERE user_id = ?', [signature || null, req.session.userId]);

    const status = await fetchStatus(req.session.userId);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'gmail:status', status);
    res.json(status);
  }));

  return router;
}

module.exports = createGmailRouter;
