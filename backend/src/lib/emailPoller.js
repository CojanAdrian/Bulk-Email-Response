const { getAccessToken } = require('./googleOAuth');
const { listNewMessageIds, getMessage, sendReply } = require('./gmailClient');
const { matchInquiry } = require('./matchingEngine');
const { composeReply } = require('./replyComposer');

function replySubject(originalSubject) {
  const subject = originalSubject || '';
  return subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
}

async function pollAccount(pool, account, wsHub) {
  if (!account.last_polled_at) {
    // First-ever poll for this account: listNewMessageIds(token, null) queries
    // Gmail with no date filter at all, returning the 50 most recent inbox
    // messages regardless of age -- processing that backlog as "new inquiries"
    // would sweep in old carrier threads and unrelated mail alike. Only
    // establish a "from now on" baseline; the next poll picks up anything
    // that arrives after this point.
    await pool.query('UPDATE email_accounts SET last_polled_at = NOW() WHERE id = ?', [account.id]);
    return;
  }

  const accessToken = await getAccessToken(account.refresh_token);
  const sinceDate = new Date(account.last_polled_at);
  const messageIds = await listNewMessageIds(accessToken, sinceDate);

  const [loads] = await pool.query('SELECT * FROM loads WHERE user_id = ? AND status = ?', [account.user_id, 'active']);

  for (const messageId of messageIds) {
    const [existing] = await pool.query(
      'SELECT id FROM email_inquiries WHERE email_account_id = ? AND gmail_message_id = ?',
      [account.id, messageId]
    );
    if (existing.length > 0) continue;

    const message = await getMessage(accessToken, messageId);
    const { matchedLoad, tier } = matchInquiry(`${message.subject} ${message.body}`, loads);
    const status = matchedLoad ? 'matched' : 'needs_review';

    // Only an exact load-number match is confident enough to auto-send without a
    // human looking at it first -- every other matched tier is ambiguous enough
    // (multiple candidate loads existed and were tie-broken by heuristics) that it
    // waits in the review queue instead. See the design spec's "Confidence policy".
    // Even a load_number match only actually sends when the user has explicitly
    // opted in via email_accounts.auto_send_enabled -- everyone starts opted out.
    let replyStatus = 'none';
    let replyBody = null;
    let replySentAt = null;

    if (matchedLoad) {
      replyBody = composeReply(matchedLoad);
      if (tier === 'load_number' && account.auto_send_enabled) {
        try {
          await sendReply(accessToken, {
            to: message.from,
            subject: replySubject(message.subject),
            body: replyBody,
            threadId: message.threadId,
            inReplyToMessageId: message.messageIdHeader,
          });
          replyStatus = 'auto_sent';
          replySentAt = new Date();
        } catch (err) {
          console.error(`Failed to auto-send reply for message ${messageId}:`, err);
          replyStatus = 'pending_review';
        }
      } else {
        replyStatus = 'pending_review';
      }
    }

    const [insertResult] = await pool.query(
      `INSERT INTO email_inquiries
       (user_id, email_account_id, gmail_message_id, from_address, subject, body_snippet, received_at,
        matched_load_id, match_tier, status, gmail_thread_id, gmail_in_reply_to,
        reply_status, reply_body, reply_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.user_id, account.id, message.id, message.from, message.subject,
        message.body.slice(0, 500), message.receivedAt, matchedLoad ? matchedLoad.id : null, tier, status,
        message.threadId || null, message.messageIdHeader || null,
        replyStatus, replyBody, replySentAt,
      ]
    );

    if (wsHub) {
      const [insertedRows] = await pool.query('SELECT * FROM email_inquiries WHERE id = ?', [insertResult.insertId]);
      wsHub.emitToUser(account.user_id, 'inquiry:new', insertedRows[0]);
    }
  }

  await pool.query('UPDATE email_accounts SET last_polled_at = NOW() WHERE id = ?', [account.id]);
}

async function pollAllAccounts(pool, wsHub) {
  const [accounts] = await pool.query('SELECT * FROM email_accounts');
  for (const account of accounts) {
    try {
      await pollAccount(pool, account, wsHub);
    } catch (err) {
      console.error(`Failed to poll Gmail for account ${account.id}:`, err);
    }
  }
}

module.exports = { pollAccount, pollAllAccounts };
