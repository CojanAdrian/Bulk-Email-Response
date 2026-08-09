const cookie = require('cookie');
const cookieSignature = require('cookie-signature');
const { store } = require('./sessionStore');

function extractSessionId(cookieHeader, secret) {
  if (!cookieHeader) return null;
  const parsed = cookie.parse(cookieHeader);
  const raw = parsed['connect.sid'];
  if (!raw || !raw.startsWith('s:')) return null;
  const unsigned = cookieSignature.unsign(raw.slice(2), secret);
  return unsigned || null;
}

function authenticateUpgrade(req, secret) {
  return new Promise((resolve) => {
    const sessionId = extractSessionId(req.headers.cookie, secret);
    if (!sessionId) return resolve(null);
    store.get(sessionId, (err, session) => {
      if (err || !session || !session.userId) return resolve(null);
      resolve(session.userId);
    });
  });
}

module.exports = { authenticateUpgrade, extractSessionId };
