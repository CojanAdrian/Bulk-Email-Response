const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { getAccessToken } = require('../lib/googleOAuth');
const { sendReply, markMessageRead } = require('../lib/gmailClient');
const { appendSignature } = require('../lib/replyComposer');
const { INQUIRY_JOIN_FIELDS, attachLiveReplyBody } = require('../lib/inquiryQueries');

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
      SELECT ei.*, ${INQUIRY_JOIN_FIELDS}
      FROM email_inquiries ei
      LEFT JOIN loads l ON l.id = ei.matched_load_id
      WHERE ei.user_id = ?`;
    if (reply_status) {
      sql += ' AND ei.reply_status = ?';
      params.push(reply_status);
    }
    sql += ' ORDER BY ei.received_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows.map(attachLiveReplyBody));
  }));

  // Shared by POST /:id/send and POST /bulk-send so both go through the
  // exact same validation/signature/send/mark-read/persist sequence --
  // bulk-send just calls this once per selected inquiry, tolerating one
  // item's failure without aborting the rest of the batch.
  async function sendOneInquiry(userId, id, bodyOverride) {
    const [rows] = await pool.query('SELECT * FROM email_inquiries WHERE id = ? AND user_id = ?', [id, userId]);
    const inquiry = rows[0];
    if (!inquiry) {
      throw Object.assign(new Error('Inquiry not found'), { status: 404 });
    }
    if (inquiry.reply_status !== 'pending_review') {
      throw Object.assign(new Error('Inquiry is not pending review'), { status: 400 });
    }

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [inquiry.email_account_id]);
    if (accountRows.length === 0) {
      throw Object.assign(new Error('Gmail account is no longer connected'), { status: 400 });
    }

    const draftBody = bodyOverride || inquiry.reply_body;
    if (!draftBody || !draftBody.trim()) {
      throw Object.assign(new Error('Reply body cannot be empty.'), { status: 400 });
    }
    const body = appendSignature(draftBody, accountRows[0].signature);
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
    if (wsHub) wsHub.emitToUser(userId, 'inquiry:updated', updated[0]);
    return updated[0];
  }

  router.post('/:id/send', asyncHandler(async (req, res) => {
    try {
      const updated = await sendOneInquiry(req.session.userId, req.params.id, req.body && req.body.body);
      res.json(updated);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }));

  // Sends a batch of selected review-queue inquiries in one request, so the
  // user doesn't have to click Send on each one individually. Each item can
  // carry its own edited draft text (bodyOverride) the same way a single
  // send does; one item failing (already sent, blank body, etc.) doesn't
  // block the rest of the batch -- the per-item result reports it instead.
  router.post('/bulk-send', asyncHandler(async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }
    const results = [];
    for (const item of items) {
      const id = item && item.id;
      try {
        const updated = await sendOneInquiry(req.session.userId, id, item && item.body);
        results.push({ id, ok: true, inquiry: updated });
      } catch (err) {
        results.push({ id, ok: false, error: err.message });
      }
    }
    res.json({ results });
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

  // Bulk-rejects a batch of selected review-queue inquiries. Scoped to
  // pending_review the same way the single reject route is -- an id that's
  // already sent/rejected, or belongs to another user, is silently left
  // alone rather than erroring out the whole batch.
  router.post('/bulk-reject', asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    const placeholders = ids.map(() => '?').join(', ');
    await pool.query(
      `UPDATE email_inquiries SET reply_status = 'rejected'
       WHERE id IN (${placeholders}) AND user_id = ? AND reply_status = 'pending_review'`,
      [...ids, req.session.userId]
    );
    const [updatedRows] = await pool.query(
      `SELECT * FROM email_inquiries WHERE id IN (${placeholders}) AND user_id = ?`,
      [...ids, req.session.userId]
    );
    if (wsHub) {
      updatedRows.forEach((row) => wsHub.emitToUser(req.session.userId, 'inquiry:updated', row));
    }
    res.json({ updated: updatedRows.filter((row) => row.reply_status === 'rejected').length });
  }));

  return router;
}

module.exports = createInquiriesRouter;
