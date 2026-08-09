# Real-Time Infrastructure — Design Spec

Date: 2026-08-09
Status: Approved for planning (phase 2 of 3 in the redesign — after the design
system, before live animations)

## Background

Every panel in this app currently self-fetches once on mount (and on a
manual "Refresh" button, or after the component that triggered a change
bumps a `refreshKey`). The user wants genuinely live updates: when the
backend's email poller inserts a new inquiry, or any other user-visible
piece of data changes, every open browser tab for that user should reflect
it immediately, with no polling delay and no manual action. This phase
builds the push mechanism; phase 3 layers the actual "pop in" animations
on top of the events this phase delivers.

**Chosen mechanism: WebSockets** (over Server-Sent Events, which was also
considered and would have been simpler — one-directional push is all this
app needs today. The user explicitly chose WebSockets, accepting the
added complexity for the flexibility it leaves open.)

**Important scope note on "live":** this makes the *frontend* reflect
*backend/database* state changes instantly (zero added latency once the
backend has processed something). It does **not** shrink the existing
2-minute Gmail polling interval — an email still takes up to 2 minutes to
be *detected* by the backend poller (unchanged from the original email
sub-project's design, which deliberately chose polling over Gmail
push/Pub/Sub to avoid extra Google Cloud infrastructure). Once the poller
*has* processed a message, the resulting `email_inquiries` row now reaches
the browser instantly instead of waiting for a refetch.

## Architecture

### Backend

**`backend/src/lib/wsHub.js`** — in-process connection registry, no
external dependency (no Redis, no message broker — a single Node process
is this app's whole backend, matching every other architectural choice in
this project):

```js
function createWsHub() {
  const connectionsByUser = new Map(); // userId -> Set<WebSocket>

  function registerConnection(userId, ws) {
    if (!connectionsByUser.has(userId)) connectionsByUser.set(userId, new Set());
    connectionsByUser.get(userId).add(ws);
  }

  function unregisterConnection(userId, ws) {
    const set = connectionsByUser.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) connectionsByUser.delete(userId);
  }

  function emitToUser(userId, event, payload) {
    const set = connectionsByUser.get(userId);
    if (!set) return;
    const message = JSON.stringify({ event, payload });
    set.forEach((ws) => {
      if (ws.readyState === ws.OPEN) ws.send(message);
    });
  }

  return { registerConnection, unregisterConnection, emitToUser };
}

module.exports = { createWsHub };
```

A user with multiple open tabs gets multiple sockets registered under the
same `userId` — `emitToUser` fans out to all of them, so every open tab
updates.

**Authentication on the WebSocket upgrade.** Regular HTTP routes get
`req.session` for free from `express-session` middleware; a raw WebSocket
upgrade request happens before Express's normal middleware chain runs, so
the session cookie has to be verified manually:

- `backend/src/lib/sessionStore.js` — extracts the `MemoryStore` instance
  express-session already uses (currently constructed inline inside
  `app.js`'s `session({...})` call) into its own module, so both the
  Express session middleware and the WebSocket upgrade handler share the
  exact same store:
  ```js
  const session = require('express-session');
  const store = new session.MemoryStore();
  module.exports = { store };
  ```
  `app.js` changes to `session({ store, secret: ..., ... })` (passing the
  shared store in) instead of letting `express-session` create its own
  implicit store.
- `backend/src/lib/wsAuth.js` — parses the `connect.sid` cookie from the
  upgrade request's raw `Cookie` header, unsigns it with `SESSION_SECRET`
  (same signing express-session itself uses), and looks up the session in
  the shared store to recover `userId`:
  ```js
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
  ```
  (`cookie` and `cookie-signature` are added as explicit dependencies —
  they're already transitively present via `express-session`, but this
  module uses them directly, so they belong in `package.json` rather than
  relying on an undeclared transitive install.)
- **`backend/src/server.js`** changes from `app.listen(port, ...)` to
  building an explicit `http.createServer(app)`, attaching a
  `WebSocketServer({ noServer: true })` from the `ws` package, and
  handling the `'upgrade'` event manually: reject anything not at
  `/ws` or that fails `authenticateUpgrade`, otherwise complete the
  handshake and call `wsHub.registerConnection(userId, ws)` /
  `unregisterConnection` on close.

**Wiring emits into existing routes/poller.** Route factories currently
take `(pool)`; they gain a second parameter `(pool, wsHub)`, threaded
through from `server.js`/`app.js`'s composition root:
- `loads.js`: after a successful `upload` or `PATCH /:id`, emit
  `load:changed` to `req.session.userId` (payload: `{ loadId }` for a
  patch, or nothing but a signal for upload — the frontend just refetches
  either way, so the payload only needs to be enough to decide *whose*
  data changed, not the full row).
- `gmail.js`: after `oauth/callback` succeeds or `disconnect` succeeds,
  emit `gmail:status` to `req.session.userId` (payload: the same shape
  `GET /api/gmail/status` already returns, so the frontend can apply it
  directly with no extra fetch).
- `inquiries.js`: after `/:id/send` or `/:id/reject` succeeds, emit
  `inquiry:updated` to `req.session.userId` (payload: the updated inquiry
  row — already have it in hand from the existing `SELECT` after the
  `UPDATE`).
- `emailPoller.js`'s `pollAccount`: after inserting a new
  `email_inquiries` row, emit `inquiry:new` to `account.user_id` (payload:
  the freshly-inserted row, re-selected the same way the route handlers
  already do, or constructed from the known insert values plus the new
  row's id from `result.insertId`).

### Frontend

**`frontend/src/lib/liveSocket.js`** — a single reconnecting WebSocket
client (not a new npm dependency — the native `WebSocket` browser API is
enough for a client; only the backend needs the `ws` package since Node
has no built-in WebSocket server):
- Connects to `{WS_URL}/ws` (derived from `API_URL`, swapping
  `http(s)` for `ws(s)`) — cookies ride along automatically since it's
  same-origin-credentialed by the browser for `ws://`/`wss://` just like
  `fetch` with `credentials: 'include'`.
- On close (including the initial-connect-fails case), reconnects with
  exponential backoff: 1s, 2s, 4s, 8s, capped at 30s, resetting to 1s
  after any successful connection that stays open >5s.
- Exposes `subscribe(eventName, handler)` returning an unsubscribe
  function, and `getStatus()` / a small status-change subscription
  (`'connecting' | 'open' | 'closed'`) for the connection-health indicator
  below.
- Only connects once the user is actually logged in (started from
  `App.jsx` on transition to `loggedIn`, torn down on logout) — no point
  holding a socket open on the login screen.

**Connection-health indicator.** A small dot next to the username in the
header: green (connected), amber (reconnecting), gray (not connected /
logged out). This isn't decorative — per the UX principle that a
background feature the user is relying on ("things update live") should
never silently stop working without any visible sign. Detailed in the
design system's `Badge`-adjacent small-indicator pattern; wired up in this
phase since it needs the real connection status, styled to match phase 1's
tokens.

**Per-component subscriptions** (added to existing components, additive —
none of the existing self-fetch-on-mount logic is removed, it's still the
correct behavior for the *first* load of a page/tab):
- `ReviewQueue`: `inquiry:new` — if the payload's `reply_status` is
  `pending_review`, prepend it to the list. `inquiry:updated` — if the
  updated row is no longer `pending_review`, remove it from the list (this
  also covers the case where *this same user*, in a second tab, sent/
  rejected an inquiry — both tabs stay in sync).
- `InquiriesLog`: `inquiry:new` — prepend. `inquiry:updated` — replace the
  matching row in place.
- `GmailConnectionPanel`: `gmail:status` — replace the current status with
  the pushed payload directly (no refetch needed, payload is already the
  right shape).
- `LoadsTable` and `DatExportSection`: `load:changed` — refetch (a full
  reload of the loads list is simplest and safest here, since a load
  mutation payload doesn't carry the info needed to patch a single row
  in-place without duplicating the backend's status-filtering logic
  client-side).

## Testing approach

- `wsHub.js` and `wsAuth.js` are pure/near-pure functions — unit tested
  directly (fake `ws`-shaped objects with a `send` jest mock and
  `readyState` for `wsHub`; a real `MemoryStore` with seeded sessions and
  real `cookie-signature` signing for `wsAuth`, so the signing/unsigning
  round-trip is genuinely exercised, not assumed).
- One integration-level test spins up the real HTTP server with a real
  `ws` client (the `ws` package works as both server and client), logs in
  via a normal HTTP request to get a real session cookie, connects with
  that cookie, and verifies: an authenticated connection succeeds, an
  unauthenticated one is rejected, and a message emitted via
  `wsHub.emitToUser` for that user's id is actually received by the
  connected client.
- Frontend: `liveSocket.js` tested against a mock `WebSocket` global
  (reconnect backoff timing, subscribe/unsubscribe, message dispatch to
  the right handler by event name). Each component's new subscription
  behavior tested the same way existing tests already mock `vi.mock`'d API
  modules — mock `liveSocket`, fire a simulated event, assert the
  component updates (prepends/removes/replaces) without an extra fetch
  call where one isn't needed.

## Out of scope (later phase / not planned)

- Any animation on arrival — phase 3's job entirely. This phase's
  observable effect is "the list updates instantly, no fade-in, no
  fanfare." That's deliberate: it keeps this phase's testing surface to
  data correctness, not motion.
- Scaling beyond a single Node process (no Redis pub/sub, no sticky
  sessions across multiple server instances) — this app has always run as
  one process; multi-instance horizontal scaling isn't part of this
  project's scope.
- Reducing the 2-minute Gmail poll interval, or switching to Gmail
  push/Pub/Sub — unchanged, out of scope, as noted above.
