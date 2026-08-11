const { getAccessToken } = require('./googleOAuth');
const { listNewMessageIds, getMessage, sendReply, extractEmailAddresses, threadHasSentMessage } = require('./gmailClient');
const { matchInquiry } = require('./matchingEngine');
const { composeReply } = require('./replyComposer');
const { looksLikeAutomatedNotification } = require('./notificationFilter');

// Only these tiers confirm enough of the route (both ends, or an exact load
// number) to safely pre-fill a specific load's PU/DEL/rate details into a
// suggested reply -- weaker tiers ('city', 'state') still surface the
// inquiry for a human to handle, but never suggest text that could be about
// the wrong load.
const CONFIDENT_TIERS = new Set(['load_number', 'city_state']);

function replySubject(originalSubject) {
  const subject = originalSubject || '';
  return subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
}

// A message copied to anyone besides the connected account itself (a team
// alias, another rep, etc.) is not treated as a direct inquiry at all -- it
// is skipped entirely, not even logged to email_inquiries.
function isAddressedOnlyToAccount(message, accountEmail) {
  const recipients = [...extractEmailAddresses(message.to), ...extractEmailAddresses(message.cc)];
  const ownEmail = String(accountEmail || '').toLowerCase();
  return recipients.length > 0 && recipients.every((address) => address === ownEmail);
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

    if (!isAddressedOnlyToAccount(message, account.gmail_address)) {
      continue;
    }

    // Automated tracking/status-update mail (load-lock alerts, shipment-
    // tendered notifications, etc.) is not a carrier asking about a load --
    // exclude it the same way a group-addressed message is: no row at all.
    if (looksLikeAutomatedNotification(message)) {
      continue;
    }

    // A thread already logged once (regardless of what happened to that
    // first message -- sent, rejected, still pending) has already been
    // treated as an inquiry. Later messages in the same thread are followups
    // in an ongoing conversation (carrier confirming, asking for a BOL,
    // tracking/check-call chatter, etc.), not a new inquiry -- without this,
    // every reply in a back-and-forth thread re-matches and queues a
    // duplicate review-queue entry for what is really one inquiry.
    if (message.threadId) {
      const [existingThread] = await pool.query(
        'SELECT id FROM email_inquiries WHERE email_account_id = ? AND gmail_thread_id = ?',
        [account.id, message.threadId]
      );
      if (existingThread.length > 0) continue;

      // A never-before-seen thread might still already be handled -- the
      // user may have replied to the carrier directly in Gmail without ever
      // going through this app. If the connected account has already sent
      // something in this thread, it's not a fresh, unanswered inquiry.
      const alreadyAnswered = await threadHasSentMessage(accessToken, message.threadId);
      if (alreadyAnswered) continue;
    }

    const { matchedLoad, tier, refMismatch } = matchInquiry(`${message.subject} ${message.body}`, loads);
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
      if (CONFIDENT_TIERS.has(tier)) {
        replyBody = composeReply(matchedLoad);
      }
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
        reply_status, reply_body, reply_sent_at, ref_mismatch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.user_id, account.id, message.id, message.from, message.subject,
        message.body.slice(0, 500), message.receivedAt, matchedLoad ? matchedLoad.id : null, tier, status,
        message.threadId || null, message.messageIdHeader || null,
        replyStatus, replyBody, replySentAt, refMismatch ? 1 : 0,
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
