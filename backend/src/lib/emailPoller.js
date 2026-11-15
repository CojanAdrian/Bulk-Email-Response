const { getAccessToken } = require('./googleOAuth');
const { listNewMessageIds, getMessage, sendReply, extractEmailAddresses, threadHasSentMessage, markMessageRead } = require('./gmailClient');
const { matchInquiry } = require('./matchingEngine');
const { composeReply } = require('./replyComposer');
const { signedReplyFor } = require('./signature');
const { looksLikeAutomatedNotification } = require('./notificationFilter');
const { fetchInquiryWithLoad } = require('./inquiryQueries');

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

// Free mail providers: many carriers use them, so sharing one with the
// account says nothing about being a coworker.
const PUBLIC_MAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'mail.com', 'comcast.net', 'att.net', 'verizon.net']);

const domainOf = (address) => String(address || '').toLowerCase().split('@')[1] || '';

// Mail from your own company's domain is a coworker, not a carrier.
function isFromColleague(fromHeader, accountEmail) {
  const accountDomain = domainOf(accountEmail);
  if (!accountDomain || PUBLIC_MAIL_DOMAINS.has(accountDomain)) return false;
  return domainOf(extractEmailAddresses(fromHeader)[0]) === accountDomain;
}

// Waiting inquiries that are not inquiries after all (coworkers, chat and
// other notifications, logged before these rules existed) are set aside as
// rejected, so the queue only holds carriers.
async function setAsideNonInquiries(pool, account, wsHub) {
  const [waiting] = await pool.query(
    "SELECT id, from_address, subject FROM email_inquiries WHERE email_account_id = ? AND reply_status = 'pending_review'",
    [account.id]
  );
  const notInquiries = waiting.filter(
    (row) => isFromColleague(row.from_address, account.gmail_address) || looksLikeAutomatedNotification({ from: row.from_address, subject: row.subject })
  );
  if (notInquiries.length === 0) return 0;
  const ids = notInquiries.map((row) => row.id);
  await pool.query(`UPDATE email_inquiries SET reply_status = 'rejected' WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (wsHub) for (const id of ids) wsHub.emitToUser(account.user_id, 'inquiry:updated', { id, reply_status: 'rejected' });
  return ids.length;
}

function isFromAccount(message, accountEmail) {
  const sender = extractEmailAddresses(message.from)[0] || '';
  return sender !== '' && sender === String(accountEmail || '').toLowerCase();
}

// Newsletters and mailing lists mark themselves with List-Id or a bulk
// Precedence header.
function isListMail(message) {
  return Boolean(message.listId) || /^(bulk|list|junk)$/i.test(String(message.precedence || '').trim());
}

// Words a carrier uses when asking about freight. Mail that matched no load
// and has none of these is not an inquiry.
const LOAD_QUESTION = /\b(loads?|rate|rates|available|avail|truck|trucks|pay|pays|lane|still|book|cover|covered|pick ?up|pu|delivery|del|ref|reference|mc|equipment|reefer|van|flatbed|interested|dispatch|miles?|mi|lbs|weight)\b|\$\s?\d/i;

function looksLikeLoadQuestion(message) {
  return LOAD_QUESTION.test(`${message.subject || ''} ${message.body || ''}`);
}

const CHECK_BATCH = 40;

// Inquiries you answered straight from Gmail leave the Waiting list: each
// poll looks at the waiting inquiries checked longest ago and closes any
// whose thread already has a reply from you to that sender.
async function closeAnsweredInquiries(pool, account, accessToken, wsHub) {
  const [waiting] = await pool.query(
    `SELECT id, from_address, gmail_thread_id FROM email_inquiries
     WHERE email_account_id = ? AND reply_status = 'pending_review' AND gmail_thread_id IS NOT NULL
     ORDER BY gmail_checked_at IS NOT NULL, gmail_checked_at ASC, received_at DESC
     LIMIT ?`,
    [account.id, CHECK_BATCH]
  );
  for (const inquiry of waiting) {
    const sender = extractEmailAddresses(inquiry.from_address)[0] || '';
    const answered = sender ? await threadHasSentMessage(accessToken, inquiry.gmail_thread_id, sender) : false;
    if (answered) {
      await pool.query(
        "UPDATE email_inquiries SET reply_status = 'sent', reply_body = 'Answered in Gmail.', gmail_checked_at = NOW() WHERE id = ?",
        [inquiry.id]
      );
      if (wsHub) wsHub.emitToUser(account.user_id, 'inquiry:updated', { id: inquiry.id, reply_status: 'sent', reply_body: 'Answered in Gmail.' });
    } else {
      await pool.query('UPDATE email_inquiries SET gmail_checked_at = NOW() WHERE id = ?', [inquiry.id]);
    }
  }
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

    // Your own messages are never an inquiry, and neither are a coworker's.
    if (isFromAccount(message, account.gmail_address)) continue;
    if (isFromColleague(message.from, account.gmail_address)) continue;

    // matchInquiry is cheap (local regex against the already-fetched active
    // loads, no network) but its result is only needed early when there's
    // prior same-sender history in this thread to compare against below --
    // memoized so it's computed at most once per message either way.
    let cachedMatchResult = null;
    function getMatchResult() {
      if (!cachedMatchResult) {
        cachedMatchResult = matchInquiry(`${message.subject} ${message.body}`, loads);
      }
      return cachedMatchResult;
    }

    // A thread already logged once for THIS sender about the SAME load is a
    // followup in an ongoing conversation (carrier confirming, asking for a
    // BOL, tracking/check-call chatter, etc.), not a new inquiry -- without
    // this, every reply in a back-and-forth thread re-matches and queues a
    // duplicate review-queue entry for what is really one inquiry.
    //
    // Scoped to the SAME load (not just thread+sender): carriers commonly
    // keep hitting "reply" on an old blast-email thread to ask about a
    // brand-new, different load. Treating any prior message from that
    // sender in that thread as "already handled" silently dropped that
    // second, genuinely new inquiry -- it never even got logged, anywhere.
    // An unmatched message is still deduped against another unmatched prior
    // message from the same sender/thread (generic chatter with no load
    // reference at all shouldn't re-queue on every reply either).
    //
    // Scoped by sender, not just threadId: Gmail can assign the SAME
    // threadId to multiple carriers' replies to one BCC'd Blast Email (they
    // share the References chain back to that one sent message), so two
    // different carriers replying "at the same time" can land in what looks
    // like one thread -- treating that as one inquiry would silently drop
    // every carrier after the first.
    if (message.threadId) {
      const senderAddress = extractEmailAddresses(message.from)[0] || '';
      const [existingThreadRows] = await pool.query(
        'SELECT from_address, matched_load_id FROM email_inquiries WHERE email_account_id = ? AND gmail_thread_id = ?',
        [account.id, message.threadId]
      );
      const priorFromSameSender = existingThreadRows.filter(
        (row) => extractEmailAddresses(row.from_address)[0] === senderAddress
      );
      if (priorFromSameSender.length > 0) {
        const { matchedLoad: earlyMatchedLoad } = getMatchResult();
        const sameSenderSameLoadAlreadyLogged = priorFromSameSender.some(
          (row) => row.matched_load_id === (earlyMatchedLoad ? earlyMatchedLoad.id : null)
        );
        if (sameSenderSameLoadAlreadyLogged) continue;
      }

      // A never-before-seen (thread, sender) pair might still already be
      // handled -- the user may have replied to this specific carrier
      // directly in Gmail without ever going through this app. Only a SENT
      // message actually addressed to this sender counts (see
      // threadHasSentMessage) -- otherwise the shared-thread blast quirk
      // above would make every carrier's message look pre-answered the
      // moment the account replies to just one of them.
      // Any reply you have sent this sender in the thread counts, before or
      // after this message: a conversation you are already in is not a new
      // inquiry.
      const alreadyAnswered = await threadHasSentMessage(accessToken, message.threadId, senderAddress);
      if (alreadyAnswered) continue;
    }

    const { matchedLoad, tier, refMismatch } = getMatchResult();

    // Mail that matched no load is kept only when it reads like a question
    // about freight; list mail only when it names one of your loads.
    if (!matchedLoad && !looksLikeLoadQuestion(message)) continue;
    if (isListMail(message) && tier !== 'load_number') continue;

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
      // A user-written custom reply (set via the load's edit modal -- see
      // "Custom load replies" in the README) always wins over the
      // auto-composed one, regardless of match tier: it's deliberately
      // authored content, not a guess, and is exactly how a multi-pick/
      // multi-drop load gets its extra stop info included in the reply.
      if (matchedLoad.custom_reply_body) {
        replyBody = matchedLoad.custom_reply_body;
      } else {
        replyBody = composeReply(matchedLoad);
      }
      // A matched load with no PU/DEL/weight/rate data yet (composeReply
      // returned null -- e.g. a load added via the quick-entry Add Load
      // form, matched before anyone filled in its details) has nothing
      // worth auto-sending; fall through to pending_review so a human
      // fills in a reply instead of a carrier getting a blank email.
      if (tier === 'load_number' && account.auto_send_enabled && replyBody) {
        // The signature is added at send time, not baked into the drafted
        // reply_body used for a pending-review draft -- but once this
        // actually goes out, reply_body is updated to the signed version so
        // it reflects exactly what the carrier received.
        const signed = await signedReplyFor(account, accessToken, replyBody);
        const sentBody = signed.text;
        try {
          await sendReply(accessToken, {
            to: message.from,
            subject: replySubject(message.subject),
            body: sentBody,
            html: signed.html,
            threadId: message.threadId,
            inReplyToMessageId: message.messageIdHeader,
          });
          replyStatus = 'auto_sent';
          replyBody = sentBody;
          replySentAt = new Date();
          // Best-effort -- the reply itself already went out, so a failure
          // here shouldn't affect reply_status. It just means the inbox
          // keeps showing this message as unread.
          try {
            await markMessageRead(accessToken, messageId);
          } catch (readErr) {
            console.error(`Failed to mark message ${messageId} as read:`, readErr);
          }
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
      // Joined the same way GET /api/inquiries joins its rows (matched
      // load's comment/extra_stops/etc, plus live_reply_body) -- without
      // this, an inquiry pushed live over the socket while the review queue
      // is open would be missing that data entirely (undefined, not just
      // stale), so e.g. the multi-stop badge silently wouldn't show for an
      // inquiry that arrived while the page was open, even though the exact
      // same load's other, page-load-fetched inquiries show it correctly.
      const inquiryWithLoad = await fetchInquiryWithLoad(pool, insertResult.insertId);
      wsHub.emitToUser(account.user_id, 'inquiry:new', inquiryWithLoad);
    }
  }

  await pool.query('UPDATE email_accounts SET last_polled_at = NOW() WHERE id = ?', [account.id]);

  try {
    await setAsideNonInquiries(pool, account, wsHub);
    await closeAnsweredInquiries(pool, account, accessToken, wsHub);
  } catch (err) {
    console.error(`Failed to check answered inquiries for account ${account.id}:`, err);
  }
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

module.exports = { pollAccount, pollAllAccounts, closeAnsweredInquiries, setAsideNonInquiries, isFromColleague, looksLikeLoadQuestion, isListMail };
