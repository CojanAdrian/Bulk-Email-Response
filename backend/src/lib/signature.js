const { getGmailSignature } = require('./gmailClient');
const { appendSignature } = require('./replyComposer');

// Every reply ends with the signature you set in Gmail itself (with its
// logo, links and formatting). When Gmail has none, or cannot be reached,
// the plain signature typed in the app's settings is used instead.

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // account id -> { html, at }

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Plain reply text as HTML, line for line.
function textToHtml(text) {
  return `<div dir="ltr">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>`;
}

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

// A Gmail signature's HTML as plain text, for the plain copy of the email.
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<a\s[^>]*href="mailto:[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (entity) => ENTITIES[entity] || entity)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function gmailSignatureFor(account, accessToken, { fresh = false } = {}) {
  const cached = cache.get(account.id);
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.html;
  try {
    const html = String((await getGmailSignature(accessToken, account.gmail_address)) || '').trim();
    cache.set(account.id, { html, at: Date.now() });
    return html;
  } catch (err) {
    console.error(`Could not read the Gmail signature for account ${account.id}:`, err.message || err);
    return cached ? cached.html : '';
  }
}

// { text, html } for a reply: text is what is stored and the plain copy;
// html is set only when the Gmail signature is used.
function signReply(body, { gmailSignatureHtml = '', typedSignature = '' } = {}) {
  if (gmailSignatureHtml) {
    const signatureText = htmlToText(gmailSignatureHtml);
    return {
      text: signatureText ? `${body}\n\n${signatureText}` : body,
      html: `${textToHtml(body)}<br><div dir="ltr" class="gmail_signature">${gmailSignatureHtml}</div>`,
    };
  }
  return { text: appendSignature(body, typedSignature), html: null };
}

async function signedReplyFor(account, accessToken, body) {
  const gmailSignatureHtml = await gmailSignatureFor(account, accessToken);
  return signReply(body, { gmailSignatureHtml, typedSignature: account.signature });
}

function clearSignatureCache() {
  cache.clear();
}

module.exports = { signReply, signedReplyFor, gmailSignatureFor, htmlToText, textToHtml, clearSignatureCache };
