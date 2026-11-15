const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { getAccessToken } = require('../lib/googleOAuth');
const { sendReply } = require('../lib/gmailClient');
const { signedReplyFor } = require('../lib/signature');

// Emailing a load to the carriers found for it on DAT ("Find trucks on
// DAT"). Each carrier gets their own email from the connected Gmail, signed
// with the Gmail signature; every one is remembered, so a reply to it
// becomes an inquiry about this load (see emailPoller) and nobody is
// emailed twice about the same load.

const MAX_PER_SEND = 100;
const PAUSE_MS = 250; // between emails, so Gmail does not see a burst
const EMAIL_RE = /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createOffersRouter(pool, { pauseMs = PAUSE_MS } = {}) {
  const router = express.Router();

  async function ownLoad(req, loadId) {
    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [loadId]);
    const load = rows[0];
    if (!load) return null;
    if (req.session.role !== 'admin' && load.user_id !== req.session.userId) return null;
    return load;
  }

  // Who has already been emailed about a load.
  router.get('/', asyncHandler(async (req, res) => {
    const loadId = Number(req.query.load_id);
    if (!loadId) return res.status(400).json({ error: 'load_id is required' });
    if (!(await ownLoad(req, loadId))) return res.status(404).json({ error: 'Load not found' });
    const [rows] = await pool.query(
      'SELECT email, carrier_name, carrier_mc, sent_at FROM carrier_offers WHERE load_id = ? ORDER BY sent_at DESC',
      [loadId]
    );
    return res.json(rows);
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { load_id: loadId, subject, body, recipients } = req.body || {};
    const load = await ownLoad(req, Number(loadId));
    if (!load) return res.status(404).json({ error: 'Load not found' });
    if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'A subject is required.' });
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'The email cannot be empty.' });
    if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'Pick at least one carrier.' });
    if (recipients.length > MAX_PER_SEND) return res.status(400).json({ error: `At most ${MAX_PER_SEND} carriers at a time.` });

    const [accounts] = await pool.query('SELECT * FROM email_accounts WHERE user_id = ?', [req.session.userId]);
    const account = accounts[0];
    if (!account) return res.status(400).json({ error: 'Connect Gmail first.' });

    const [sentRows] = await pool.query('SELECT email FROM carrier_offers WHERE load_id = ?', [load.id]);
    const alreadySent = new Set(sentRows.map((row) => row.email.toLowerCase()));

    const accessToken = await getAccessToken(account.refresh_token);
    const signed = await signedReplyFor(account, accessToken, String(body).trim());
    const results = [];
    for (const recipient of recipients) {
      const email = String(recipient?.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        results.push({ email, ok: false, error: 'Not a valid email address.' });
        continue;
      }
      if (alreadySent.has(email)) {
        results.push({ email, ok: false, skipped: true, error: 'Already emailed about this load.' });
        continue;
      }
      try {
        if (results.some((r) => r.ok)) await sleep(pauseMs);
        const sent = await sendReply(accessToken, { to: email, subject: String(subject).trim(), body: signed.text, html: signed.html });
        await pool.query(
          `INSERT INTO carrier_offers (user_id, load_id, email, carrier_name, carrier_mc, gmail_thread_id, gmail_message_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.session.userId, load.id, email, recipient.name || null, recipient.mc || null, sent?.threadId || null, sent?.id || null]
        );
        alreadySent.add(email);
        results.push({ email, ok: true });
      } catch (err) {
        results.push({ email, ok: false, error: err.message || 'Could not send.' });
      }
    }
    return res.json({ results, sent: results.filter((r) => r.ok).length });
  }));

  return router;
}

module.exports = { createOffersRouter };
