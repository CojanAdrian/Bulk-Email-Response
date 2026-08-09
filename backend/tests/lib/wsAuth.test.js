const cookieSignature = require('cookie-signature');
const { store } = require('../../src/lib/sessionStore');
const { authenticateUpgrade, extractSessionId } = require('../../src/lib/wsAuth');

const SECRET = 'test-secret';

function seedSession(sessionId, sessionData) {
  return new Promise((resolve, reject) => {
    store.set(sessionId, sessionData, (err) => (err ? reject(err) : resolve()));
  });
}

function signedCookieHeader(sessionId) {
  const signed = 's:' + cookieSignature.sign(sessionId, SECRET);
  return `connect.sid=${encodeURIComponent(signed)}`;
}

describe('wsAuth', () => {
  describe('extractSessionId', () => {
    test('extracts and unsigns a validly-signed connect.sid cookie', () => {
      const sessionId = extractSessionId(signedCookieHeader('abc123'), SECRET);
      expect(sessionId).toBe('abc123');
    });

    test('returns null when there is no cookie header', () => {
      expect(extractSessionId(undefined, SECRET)).toBeNull();
    });

    test('returns null when connect.sid is missing from the cookie header', () => {
      expect(extractSessionId('other=value', SECRET)).toBeNull();
    });

    test('returns null when the signature does not verify against the given secret', () => {
      const sessionId = extractSessionId(signedCookieHeader('abc123'), 'wrong-secret');
      expect(sessionId).toBeNull();
    });

    test('returns null when the cookie value is not signed (missing s: prefix)', () => {
      expect(extractSessionId('connect.sid=unsigned-value', SECRET)).toBeNull();
    });
  });

  describe('authenticateUpgrade', () => {
    test('resolves the userId for a request with a valid session cookie', async () => {
      await seedSession('session-1', { userId: 42 });
      const req = { headers: { cookie: signedCookieHeader('session-1') } };

      const userId = await authenticateUpgrade(req, SECRET);

      expect(userId).toBe(42);
    });

    test('resolves null when there is no cookie header', async () => {
      const req = { headers: {} };
      const userId = await authenticateUpgrade(req, SECRET);
      expect(userId).toBeNull();
    });

    test('resolves null when the session does not exist in the store', async () => {
      const req = { headers: { cookie: signedCookieHeader('nonexistent-session') } };
      const userId = await authenticateUpgrade(req, SECRET);
      expect(userId).toBeNull();
    });

    test('resolves null when the session exists but has no userId', async () => {
      await seedSession('session-2', {});
      const req = { headers: { cookie: signedCookieHeader('session-2') } };

      const userId = await authenticateUpgrade(req, SECRET);

      expect(userId).toBeNull();
    });

    test('resolves null when the cookie signature is invalid', async () => {
      await seedSession('session-3', { userId: 7 });
      const req = { headers: { cookie: signedCookieHeader('session-3') } };

      const userId = await authenticateUpgrade(req, 'wrong-secret');

      expect(userId).toBeNull();
    });
  });
});
