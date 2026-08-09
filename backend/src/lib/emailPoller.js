const { getAccessToken } = require('./googleOAuth');
const { listNewMessageIds, getMessage } = require('./gmailClient');
const { matchInquiry } = require('./matchingEngine');

async function pollAccount(pool, account) {
  const accessToken = await getAccessToken(account.refresh_token);
  const sinceDate = account.last_polled_at ? new Date(account.last_polled_at) : null;
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

    await pool.query(
      `INSERT INTO email_inquiries
       (user_id, email_account_id, gmail_message_id, from_address, subject, body_snippet, received_at, matched_load_id, match_tier, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.user_id, account.id, message.id, message.from, message.subject,
        message.body.slice(0, 500), message.receivedAt, matchedLoad ? matchedLoad.id : null, tier, status,
      ]
    );
  }

  await pool.query('UPDATE email_accounts SET last_polled_at = NOW() WHERE id = ?', [account.id]);
}

async function pollAllAccounts(pool) {
  const [accounts] = await pool.query('SELECT * FROM email_accounts');
  for (const account of accounts) {
    try {
      await pollAccount(pool, account);
    } catch (err) {
      console.error(`Failed to poll Gmail for account ${account.id}:`, err);
    }
  }
}

module.exports = { pollAccount, pollAllAccounts };
