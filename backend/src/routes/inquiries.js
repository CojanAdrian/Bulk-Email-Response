const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { getAccessToken } = require('../lib/googleOAuth');
const { sendReply, markMessageRead } = require('../lib/gmailClient');

function replySubject(originalSubject) {
  const subject = originalSubject || '';
  return subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
}

function createInquiriesRouter(pool, wsHub) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { reply_status } = req.query;
    const params = [req.session.userId];
    let sql = `
      SELECT ei.*, l.stops AS matched_load_stops, l.comment AS matched_load_comment,
             l.target_pay AS matched_load_target_pay, l.include_rate AS matched_load_include_rate,
             l.extra_stops AS matched_load_extra_stops
      FROM email_inquiries ei
      LEFT JOIN loads l ON l.id = ei.matched_load_id
      WHERE ei.user_id = ?`;
    if (reply_status) {
      sql += ' AND ei.reply_status = ?';
      params.push(reply_status);
    }
    sql += ' ORDER BY ei.received_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  }));

  router.post('/:id/send', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM email_inquiries WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    const inquiry = rows[0];
    if (inquiry.reply_status !== 'pending_review') {
      return res.status(400).json({ error: 'Inquiry is not pending review' });
    }

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [inquiry.email_account_id]);
    if (accountRows.length === 0) {
      return res.status(400).json({ error: 'Gmail account is no longer connected' });
    }

    const body = (req.body && req.body.body) || inquiry.reply_body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Reply body cannot be empty.' });
    }
    const accessToken = await getAccessToken(accountRows[0].refresh_token);
    await sendReply(accessToken, {
      to: inquiry.from_address,
      subject: replySubject(inquiry.subject),
      body,
      threadId: inquiry.gmail_thread_id,
      inReplyToMessageId: inquiry.gmail_in_reply_to,
    });

    // Best-effort -- the reply itself already went out, so a failure here
    // (e.g. a transient Gmail API error) shouldn't roll that back or block
    // the response. It just means the inbox keeps showing it as unread.
    try {
      await markMessageRead(accessToken, inquiry.gmail_message_id);
    } catch (err) {
      console.error(`Failed to mark message ${inquiry.gmail_message_id} as read:`, err);
    }

    await pool.query(
      "UPDATE email_inquiries SET reply_status = 'sent', reply_body = ?, reply_sent_at = NOW() WHERE id = ?",
      [body, inquiry.id]
    );

    const [updated] = await pool.query('SELECT * FROM email_inquiries WHERE id = ?', [inquiry.id]);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'inquiry:updated', updated[0]);
    res.json(updated[0]);
  }));

  router.post('/:id/reject', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM email_inquiries WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    if (rows[0].reply_status !== 'pending_review') {
      return res.status(400).json({ error: 'Inquiry is not pending review' });
    }

    await pool.query("UPDATE email_inquiries SET reply_status = 'rejected' WHERE id = ?", [req.params.id]);
    const [updated] = await pool.query('SELECT * FROM email_inquiries WHERE id = ?', [req.params.id]);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'inquiry:updated', updated[0]);
    res.json(updated[0]);
  }));

  return router;
}

module.exports = createInquiriesRouter;
