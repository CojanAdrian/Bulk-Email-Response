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
    body: extractPlainTextBody(res.data.payload),
    receivedAt: new Date(Number(res.data.internalDate)),
  };
}

// Checks whether the connected account has already sent a message in this
// thread -- i.e. a human already replied to this carrier directly in Gmail,
// outside the app entirely. Used to avoid surfacing a thread as a fresh,
// unanswered inquiry when it's actually already been handled.
async function threadHasSentMessage(accessToken, threadId) {
  const gmail = buildGmailClient(accessToken);
  const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata' });
  const messages = res.data.messages || [];
  return messages.some((m) => (m.labelIds || []).includes('SENT'));
}

function buildRawMessage({ to, subject, body, inReplyToMessageId }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  if (inReplyToMessageId) {
    headers.push(`In-Reply-To: ${inReplyToMessageId}`);
    headers.push(`References: ${inReplyToMessageId}`);
  }
  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return Buffer.from(message).toString('base64url');
}

async function sendReply(accessToken, { to, subject, body, threadId, inReplyToMessageId }) {
  const gmail = buildGmailClient(accessToken);
  const requestBody = { raw: buildRawMessage({ to, subject, body, inReplyToMessageId }) };
  if (threadId) {
    requestBody.threadId = threadId;
  }
  const res = await gmail.users.messages.send({ userId: 'me', requestBody });
  return res.data;
}

module.exports = { listNewMessageIds, getMessage, extractPlainTextBody, extractEmailAddresses, threadHasSentMessage, sendReply };
