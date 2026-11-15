// The BulkPosting address the app opens, as an origin ("https://host"), and
// whether a link belongs to it. Plain functions, tested in test/address.test.js.

function normalizeAddress(input) {
  let text = String(input || '').trim();
  if (!text) return null;
  // Only "host" or "host/path" get https:// added; a typed scheme is kept.
  // Local servers (localhost, 127.0.0.1) speak plain http.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `${/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(text) ? 'http' : 'https'}://${text}`;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isInsideApp(link, origin) {
  try {
    return new URL(link).origin === origin;
  } catch {
    return false;
  }
}

module.exports = { normalizeAddress, isInsideApp };
