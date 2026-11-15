const { google } = require('googleapis');
const { createOAuthClient } = require('./googleOAuth');

function buildGmailClient(accessToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function listNewMessageIds(accessToken, sinceDate) {
  const gmail = buildGmailClient(accessToken);
  const query = sinceDate ? `after:${Math.floor(sinceDate.getTime() / 1000)}` : '';
  const res = await gmail.users.messages.list({ userId: 'me', q: query, labelIds: ['INBOX'], maxResults: 50 });
  if (res.data.nextPageToken) {
    console.warn('Gmail listNewMessageIds: more than 50 messages matched in one poll window; some may be missed until the next poll.');
  }
  return (res.data.messages || []).map((m) => m.id);
}

function decodeBase64Url(data) {
  return Buffer.from(data, 'base64url').toString('utf8');
}

// Parses a To/Cc header ("Name <a@x.com>, b@y.com") into lowercased bare
// addresses, for comparing against a connected account's own address.
function extractEmailAddresses(headerValue) {
  if (!headerValue) return [];
  return headerValue
    .split(',')
    .map((part) => {
      const angleMatch = part.match(/<([^>]+)>/);
      const address = angleMatch ? angleMatch[1] : part.trim();
      return address.trim().toLowerCase();
    })
    .filter(Boolean);
}

function extractPlainTextBody(payload) {
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainTextBody(part);
      if (text) return text;
    }
  }
  return '';
}

async function getMessage(accessToken, messageId) {
  const gmail = buildGmailClient(accessToken);
  const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const headers = res.data.payload.headers || [];
  const getHeader = (name) => (headers.find((h) => h.name && h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
  return {
    id: res.data.id,
    threadId: res.data.threadId,
    messageIdHeader: getHeader('Message-ID') || null,
    from: getHeader('From'),
    to: getHeader('To'),
    cc: getHeader('Cc'),
    subject: getHeader('Subject'),
    // Mailing-list markers: newsletters and bulk mail carry these.
    listId: getHeader('List-Id'),
    precedence: getHeader('Precedence'),
    body: extractPlainTextBody(res.data.payload),
    receivedAt: new Date(Number(res.data.internalDate)),
  };
}

// Checks whether the connected account has already sent a message in this
// thread -- i.e. a human already replied to this carrier directly in Gmail,
// outside the app entirely. Used to avoid surfacing a thread as a fresh,
// unanswered inquiry when it's actually already been handled.
//
// When recipientAddress is given, only a SENT message actually addressed to
// that recipient counts. This matters because Gmail can assign the SAME
// threadId to multiple carriers' replies to one BCC'd Blast Email (they all
// share the References chain back to that one sent message) -- without the
// recipient check, the blast itself (or a reply already sent to a different
// carrier) would make every other carrier's fresh reply in that thread look
// pre-answered.
//
// When sinceDate is given, only a SENT message that went out AFTER sinceDate
// counts. Without this, a thread with any sent reply anywhere in its history
// -- even one that long predates a brand new question from the carrier --
// would look permanently "already answered", silently hiding every message
// that comes in afterward. Callers pass the specific inbound message's own
// received time here, so only a reply that actually answers THIS message
// (sent later than it) counts as having already handled it.
async function threadHasSentMessage(accessToken, threadId, recipientAddress, sinceDate) {
  const gmail = buildGmailClient(accessToken);
  const wantedAddress = String(recipientAddress || '').toLowerCase();
  const sinceMs = sinceDate ? new Date(sinceDate).getTime() : null;
  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'metadata',
    ...(wantedAddress ? { metadataHeaders: ['To'] } : {}),
  });
  const messages = res.data.messages || [];
  return messages.some((m) => {
    if (!(m.labelIds || []).includes('SENT')) return false;
    if (sinceMs !== null) {
      const sentMs = Number(m.internalDate);
      if (!Number.isNaN(sentMs) && sentMs <= sinceMs) return false;
    }
    if (!wantedAddress) return true;
    const headers = (m.payload && m.payload.headers) || [];
    const toHeader = (headers.find((h) => h.name && h.name.toLowerCase() === 'to') || {}).value || '';
    return extractEmailAddresses(toHeader).includes(wantedAddress);
  });
}

// A reply as a raw email. With html it goes out as multipart/alternative
// (the HTML part for mail apps that show formatting, such as a Gmail
// signature with a logo, and the plain part for the rest); without, as
// plain text. Parts are base64 so any characters survive.
// A header value with characters outside plain ASCII (→, ·, accents) must be
// encoded, or mail programs show it garbled ("â†’"). Split into short
// pieces so no encoded word runs past the line limit.
function encodeHeader(value) {
  const text = String(value ?? '');
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  const pieces = [];
  let piece = '';
  for (const char of text) {
    if (Buffer.byteLength(piece + char, 'utf8') > 42) {
      pieces.push(piece);
      piece = '';
    }
    piece += char;
  }
  if (piece) pieces.push(piece);
  return pieces.map((p) => `=?UTF-8?B?${Buffer.from(p, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function buildRawMessage({ to, bcc, subject, body, html, inReplyToMessageId }) {
  const headers = [`To: ${to}`];
  if (bcc && bcc.length) headers.push(`Bcc: ${[].concat(bcc).join(', ')}`);
  headers.push(`Subject: ${encodeHeader(subject)}`, 'MIME-Version: 1.0');
  if (inReplyToMessageId) {
    headers.push(`In-Reply-To: ${inReplyToMessageId}`);
    headers.push(`References: ${inReplyToMessageId}`);
  }
  const CRLF = String.fromCharCode(13, 10);
  const base64Lines = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}(?=.)/g, (chunk) => chunk + CRLF);
  let message;
  if (html) {
    const boundary = `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    message = [
      headers.join(CRLF),
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(body),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(html),
      `--${boundary}--`,
      '',
    ].join(CRLF);
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    message = headers.join(CRLF) + CRLF + CRLF + body;
  }
  return Buffer.from(message).toString('base64url');
}

async function sendReply(accessToken, { to, bcc, subject, body, html, threadId, inReplyToMessageId }) {
  const gmail = buildGmailClient(accessToken);
  const requestBody = { raw: buildRawMessage({ to, bcc, subject, body, html, inReplyToMessageId }) };
  if (threadId) {
    requestBody.threadId = threadId;
  }
  const res = await gmail.users.messages.send({ userId: 'me', requestBody });
  return res.data;
}

// The signature set in Gmail's settings for this address (HTML), or '' when
// there is none.
async function getGmailSignature(accessToken, address) {
  const gmail = buildGmailClient(accessToken);
  const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
  const identities = res.data.sendAs || [];
  const wanted = String(address || '').toLowerCase();
  const identity =
    identities.find((item) => String(item.sendAsEmail || '').toLowerCase() === wanted) ||
    identities.find((item) => item.isDefault) ||
    identities.find((item) => item.isPrimary);
  return (identity && identity.signature) || '';
}

// Clears the UNREAD label on the original inquiry message once a reply has
// gone out for it -- otherwise the thread stays sitting in the inbox marked
// unread even though it's been answered.
async function markMessageRead(accessToken, messageId) {
  const gmail = buildGmailClient(accessToken);
  const res = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
  return res.data;
}

module.exports = {
  listNewMessageIds,
  getMessage,
  extractPlainTextBody,
  extractEmailAddresses,
  threadHasSentMessage,
  sendReply,
  markMessageRead,
  getGmailSignature,
  buildRawMessage,
};
