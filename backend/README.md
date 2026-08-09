# BulkPosting Backend

A Node.js/Express/MySQL API for persistent freight load data. It replaces the
old in-page-memory data model (a JS array parsed from a CSV upload, lost on
page refresh) with a MySQL database. Each user has their own account and
their own set of loads — see "Accounts and roles" below.

This is a backend only — there is no bundled frontend here. The React UI
that will consume this API (CSV upload, DAT export, load lookup, rate
editing, blast/email) is a separate, future piece of work. See
`docs/superpowers/specs/2026-08-04-backend-foundation-design.md` in the repo
root for the full design spec this backend implements.

## Prerequisites

- Node.js (v18+ recommended)
- A running MySQL 8.0+ server, reachable with a user that can create
  databases. Local development on this project has been using a MySQL 8.0
  Docker container:
  ```bash
  docker run --name bulkposting-mysql -e MYSQL_ROOT_PASSWORD=<pw> -p 3306:3306 -d mysql:8.0
  ```
  but any local MySQL 8.0+ install works the same way.

## Setup

From the `backend/` directory:

1. **Copy the env file and fill in real values:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env`:

   | Var | Meaning |
   |---|---|
   | `PORT` | Port the API listens on (default `4000`) |
   | `DB_HOST`, `DB_PORT` | MySQL host/port |
   | `DB_USER`, `DB_PASSWORD` | MySQL credentials — must be able to `CREATE DATABASE` |
   | `DB_NAME` | Dev database name |
   | `DB_NAME_TEST` | Test database name (used by `npm test`, kept separate from dev data) |
   | `SESSION_SECRET` | Secret used to sign the session cookie — change from the placeholder |
   | `FRONTEND_ORIGIN` | Origin allowed by CORS (the future React dev server, e.g. `http://localhost:5173`) |
   | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Credentials for the admin user the setup script creates |

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up the databases:**

   ```bash
   npm run setup-db
   ```

   This creates both `DB_NAME` and `DB_NAME_TEST` if they don't exist,
   applies `sql/schema.sql` to each, and seeds an admin user (from
   `ADMIN_USERNAME`/`ADMIN_PASSWORD`, with `role: 'admin'`) into the dev
   database if one with that username doesn't already exist. It's
   idempotent — safe to re-run any time (e.g. after pulling a schema
   change); it will not duplicate the admin user or error on tables that
   already exist. See "Accounts and roles" below for how this account
   relates to self-registered users.

   It also runs a schema migration (idempotent, same safe-to-re-run
   guarantee): adds the `role` column to `users` and the `user_id` column
   to `loads` if they're missing, switches `load_number` uniqueness from
   global to per-user, backfills any pre-existing ownerless loads to the
   `ADMIN_USERNAME` account, and promotes that account to `role: 'admin'`.
   If any load still has no owner after this (e.g. `ADMIN_USERNAME` didn't
   match an existing user), it prints a warning to the console — that load
   would otherwise be invisible to every non-admin user.

4. **Run the server:**

   ```bash
   npm start
   ```

   You should see `Backend listening on port 4000` (or whatever `PORT` is
   set to).

Both `npm run setup-db` and `npm start` validate required environment
variables before doing anything else, and fail fast with a message like
`Missing required environment variable(s): DB_HOST, DB_NAME` rather than
attempting to connect with `undefined` values. If you see that error,
check `.env`.

## Running tests

```bash
npm test
```

This runs `jest --runInBand`. The `--runInBand` flag is intentional and
required, not optional — the test suites all share one real MySQL test
database (`DB_NAME_TEST`) and reset its tables between tests, so running
suites in parallel worker processes causes cross-suite races and flaky
failures. Don't run `npx jest` directly; use `npm test`.

There are 146 tests across 13 suites: `tests/health.test.js`,
`tests/auth.test.js`, `tests/loads.test.js`, `tests/gmail.test.js`,
`tests/inquiries.test.js`, `tests/createHttpServer.test.js`,
`tests/lib/googleOAuth.test.js`, `tests/lib/gmailClient.test.js`,
`tests/lib/matchingEngine.test.js`, `tests/lib/replyComposer.test.js`,
`tests/lib/emailPoller.test.js`, `tests/lib/wsHub.test.js`,
`tests/lib/wsAuth.test.js`. All Gmail API calls are mocked — no real
Google credentials are needed to run the suite.

## Manual smoke test (curl)

With the server running (`npm start`) and `.env`'s `ADMIN_USERNAME` /
`ADMIN_PASSWORD` seeded via `npm run setup-db`:

```bash
# 1. Log in — saves the session cookie to cookies.txt
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}'
# -> {"username":"admin","role":"admin"}

# 2. Upload a batch of loads (upserted by load_number)
curl -b cookies.txt -X POST http://localhost:4000/api/loads/upload \
  -H "Content-Type: application/json" \
  -d '{"loads":[{"load_number":"TEST-001","origin_city":"Chicago","origin_state":"IL","dest_city":"Dallas","dest_state":"TX","target_pay":1500.00}]}'
# -> {"inserted":1,"updated":0}

# 3. List active loads
curl -b cookies.txt "http://localhost:4000/api/loads?status=active"
# -> [{"id":1,"load_number":"TEST-001","origin_city":"Chicago", ... "status":"active", ...}]
```

**Multi-user isolation** — the walkthrough above only exercises the seeded
admin. To see the actual point of this plan (private, per-user loads),
register two separate users and confirm neither sees the other's data,
while the admin sees both:

```bash
# Register two users (each auto-logs-in; save separate cookie jars)
curl -c cookies_a.txt -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" -d '{"username":"alice","password":"alicepassword"}'
curl -c cookies_b.txt -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" -d '{"username":"bob","password":"bobpassword123"}'

# Each uploads a load with the SAME load_number — no collision, since
# load_number is unique per-user, not globally
curl -b cookies_a.txt -X POST http://localhost:4000/api/loads/upload \
  -H "Content-Type: application/json" -d '{"loads":[{"load_number":"SAME1","origin_city":"Dallas"}]}'
curl -b cookies_b.txt -X POST http://localhost:4000/api/loads/upload \
  -H "Content-Type: application/json" -d '{"loads":[{"load_number":"SAME1","origin_city":"Houston"}]}'

# Alice sees only her own load; Bob sees only his
curl -b cookies_a.txt http://localhost:4000/api/loads   # -> just the Dallas load
curl -b cookies_b.txt http://localhost:4000/api/loads   # -> just the Houston load

# The admin (cookies.txt from step 1 above) sees both
curl -b cookies.txt http://localhost:4000/api/loads     # -> both loads, plus admin's own
```

All `/api/loads/*` routes require an authenticated session — an unauthenticated
request to any of them returns `401 {"error":"Unauthorized"}`.

## Live updates (WebSocket)

`src/server.js` builds an `http.Server` (`src/createHttpServer.js`) around
the Express app and handles the `'upgrade'` event manually, since a raw
WebSocket upgrade happens before Express's middleware chain runs and so
never gets a `req.session` for free. Connecting to `ws://<host>/ws` is
authenticated by parsing and unsigning the `connect.sid` cookie off the
raw upgrade request (`src/lib/wsAuth.js`) and looking up the session in a
`MemoryStore` now shared between `express-session` and the upgrade
handler (`src/lib/sessionStore.js` — previously constructed inline inside
`app.js` and inaccessible outside it). A connection with no cookie, or one
that doesn't resolve to a session with a `userId`, gets a `401` and the
socket is closed; anything not at the `/ws` path is rejected outright.

`src/lib/wsHub.js` is an in-process registry (`userId -> Set<WebSocket>`,
no Redis or external broker — this app has always run as a single Node
process) that route handlers and the email poller push events through via
`wsHub.emitToUser(userId, event, payload)`. A user with multiple open tabs
gets every socket registered under their `userId`, so a push fans out to
all of them. Every route factory (`createLoadsRouter`, `createGmailRouter`,
`createInquiriesRouter`) and `pollAccount`/`pollAllAccounts` now take an
optional `wsHub` as an extra parameter — emits are guarded (`if (wsHub)`)
so tests and other callers that don't pass one are unaffected. Events
emitted:

| Event | Emitted after | Payload |
|---|---|---|
| `load:changed` | `PATCH /api/loads/:id`, `POST /api/loads/upload` | `{ loadId }` for a PATCH, `{}` for an upload (frontend just refetches either way) |
| `gmail:status` | OAuth callback succeeds, `POST /api/gmail/disconnect` | same shape as `GET /api/gmail/status` |
| `inquiry:updated` | `POST /api/inquiries/:id/send`, `POST /api/inquiries/:id/reject` | the full updated `email_inquiries` row |
| `inquiry:new` | the poller stores a newly-detected message | the full inserted `email_inquiries` row |

This makes the *frontend* reflect *backend/database* state changes
instantly — it does **not** shrink the 2-minute Gmail polling interval
described below; an email still takes up to 2 minutes to be *detected*.
Once the poller has processed a message, though, the resulting row now
reaches every open browser tab the instant it's stored, instead of
waiting for a manual refresh. See
`docs/superpowers/specs/2026-08-09-realtime-infrastructure-design.md` for
the full design.

## API reference

### Health

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/health` | none | `200 {"ok": true}` |

### Auth (`/api/auth`)

| Method | Path | Auth | Request body | Response |
|---|---|---|---|---|
| POST | `/api/auth/register` | none | `{"username": string, "password": string}` | `200 {"username": string, "role": "user"}` on success (also logs the new user in); `400 {"error": "Password must be at least 8 characters"}` if the password is too short; `400 {"error": "Username already taken"}` if the username already exists |
| POST | `/api/auth/login` | none | `{"username": string, "password": string}` | `200 {"username": string, "role": "admin"\|"user"}` on success; `401 {"error": "Invalid credentials"}` if the username doesn't exist or the password is wrong |
| POST | `/api/auth/logout` | none | — | `200 {"ok": true}` (destroys the session) |
| GET | `/api/auth/me` | session | — | `200 {"username": string, "role": "admin"\|"user"}`; `401 {"error": "Unauthorized"}` if not logged in |
| GET | `/api/auth/google` | none | — | `302` redirect to Google's OAuth consent screen (identity + Gmail scopes together) |
| GET | `/api/auth/google/callback` | none (Google redirects here with a `code`) | — | `302` redirect to `FRONTEND_ORIGIN/` on success (session cookie set); `302` redirect to `FRONTEND_ORIGIN/?authError=<code>` on failure — see below |

A successful login or registration sets an `httpOnly`, `sameSite=lax`
session cookie. All `/api/loads/*` routes require this cookie (enforced by
`src/middleware/requireAuth.js`). See "Accounts and roles" below for what
`role` means and how it's assigned.

**Sign in / sign up with Google** (`GET /api/auth/google` → Google consent →
`GET /api/auth/google/callback`) is a single OAuth flow that requests
identity scopes (`openid`, `email`, `profile`) *and* the same Gmail scopes
as the standalone "Connect Gmail" flow, together in one consent screen.
The callback:
1. Exchanges the code for tokens and resolves the identity via Google's
   userinfo endpoint (`src/lib/googleOAuth.js`'s `getGoogleIdentity`).
2. Rejects (redirects with `?authError=email_not_verified`) if Google
   reports the email as unverified.
3. Looks up a user by `google_id`. If none exists, creates one —
   `username` defaults to the full Gmail address (the `users.username`
   column is `VARCHAR(255)` specifically to hold this), `password_hash`
   is `NULL` (a Google-only account has no password — the `/login` route
   rejects password attempts against a `NULL` hash with a clean `401`
   instead of crashing), `role` is `'user'`.
4. **Auto-connects Gmail** — the same token pair that authenticated the
   sign-in is upserted into `email_accounts` for that user (the same
   `ON DUPLICATE KEY UPDATE` upsert the standalone Gmail-connect flow
   uses), so a brand-new Google sign-up never needs a separate "Connect
   Gmail" step.
5. Sets the session and redirects to the frontend.

Existing manual (username/password) accounts are **not** auto-linked to a
Google identity that happens to share a username — a collision (e.g.
someone already registered with a username identical to their own Gmail
address) redirects with `?authError=account_exists` rather than silently
merging accounts. The frontend's `LoginPage`/`RegisterPage` read that
`authError` query param once on mount, show a human-readable message, and
strip it from the URL (`frontend/src/lib/useGoogleAuthError.js`).

### Loads (`/api/loads`) — all routes require an authenticated session

`GET /api/loads`, `GET /api/loads/:id`, and `PATCH /api/loads/:id` are
scoped to the caller's own loads (matched by the `user_id` recorded on each
load), **except** for users with `role: 'admin'`, who can see and edit
every user's loads on those three routes, not just their own. See
"Accounts and roles" below for who has the admin role.

**`POST /api/loads/upload` is the one exception — it is NOT admin-bypassed.**
Every upload, admin or not, always upserts under the *caller's own*
`user_id`. Because `load_number` uniqueness is per-user (see below), an
admin re-uploading a `load_number` that belongs to a different user does
not edit that user's row — it inserts a brand-new row owned by the admin.
There is currently no route for editing another user's load by re-upload;
`PATCH /api/loads/:id` (admin-bypassed) is the only way to edit a load you
don't own.

| Method | Path | Request body | Response |
|---|---|---|---|
| GET | `/api/loads` | — (optional query `?status=active\|booked\|expired`) | `200` array of load rows the caller owns (all users' rows if admin), newest (`created_at`) first |
| GET | `/api/loads/:id` | — | `200` load row, if it belongs to the caller (or the caller is admin); `404 {"error": "Load not found"}` if no such id, or it exists but belongs to a different, non-admin caller |
| PATCH | `/api/loads/:id` | `{"target_pay"?: number, "status"?: "active"\|"booked"\|"expired"}` (at least one) | `200` updated load row; `400 {"error": "No valid fields to update"}` if neither field is present; `404 {"error": "Load not found"}` if no such id, or it belongs to a different, non-admin caller |
| POST | `/api/loads/upload` | `{"loads": [{ "load_number": string, ... other load fields }]}` | `200 {"inserted": number, "updated": number}`; `400 {"error": "loads must be an array"}` if `loads` isn't an array. Always upserted into the **uploader's own** set, regardless of role — see above and below for details |

`load_number` uniqueness is per-user, not global: two different users can
each upload a load numbered, say, `"TEST-001"`, and they'll be stored as
two separate rows, each owned by its uploader. A re-upload of the same
`load_number` by the *same* user updates that user's existing row; it has
no effect on any other user's load with the same number.

A load row has this shape (the `role`/`user_id`/`raw_equipment` columns and
the per-user unique key come from `npm run setup-db`'s migration step, not
from `sql/schema.sql` alone — see "Setup" above):

```json
{
  "id": 1,
  "user_id": 2,
  "load_number": "TEST-001",
  "origin_city": "Chicago", "origin_state": "IL", "origin_zip": null,
  "dest_city": "Dallas", "dest_state": "TX", "dest_zip": null,
  "equipment": null, "raw_equipment": null, "weight": null,
  "target_pay": "1500.00",
  "early_pu": null, "late_pu": null, "late_del": null,
  "stops": null,
  "commodity": null, "temperature": null, "comment": null,
  "status": "active",
  "created_at": "2026-08-05T06:40:21.000Z",
  "updated_at": "2026-08-05T06:40:21.000Z"
}
```

(`target_pay` is returned as a string because it's a MySQL `DECIMAL`
column serialized via `mysql2`.)

`raw_equipment` holds the *pre-mapping* equipment code exactly as it
appeared in the uploaded CSV (e.g. `"POTM"`), while `equipment` holds the
value after `EQUIPMENT_MAP` normalization (e.g. `"PO"`) that the rest of
the app uses for matching/filtering. They're the same value for codes that
map to themselves. The frontend's DAT export pipeline needs the raw code
to detect team loads (`POTM` specifically) since that distinction is lost
once mapping collapses several raw codes onto the same normalized value.

Any unhandled error in a route (e.g. a dropped DB connection) is caught by
a shared error handler and returned as `500 {"error": "Internal server error"}`
instead of crashing the server — see "Behavior notes" below.

### Gmail (`/api/gmail`) — all routes require an authenticated session

Lets a user connect their own Gmail inbox so incoming carrier emails can be
matched against their own loads. See "Gmail integration" below for the full
picture (background poller, matching pipeline, how to set up real Google
credentials). Each user can connect at most one Gmail account.

| Method | Path | Response |
|---|---|---|
| GET | `/api/gmail/status` | `200 {"connected": false}`, or `200 {"connected": true, "gmailAddress": string, "connectedAt": string}` if the caller has a connected account |
| GET | `/api/gmail/connect` | `302` redirect to Google's OAuth consent screen |
| GET | `/api/gmail/oauth/callback` | Google redirects here after consent (`?code=...`). Exchanges the code for tokens, stores them against the caller's account, then `302` redirects to `{FRONTEND_ORIGIN}/?gmail=connected`. `400 {"error": "Missing authorization code"}` if `code` is absent. Reconnecting replaces the caller's existing stored tokens rather than creating a second row (`email_accounts.user_id` is unique) |
| POST | `/api/gmail/disconnect` | `200 {"ok": true}` — deletes the caller's stored connection. Past `email_inquiries` rows are kept, not deleted |

### Inquiries (`/api/inquiries`)

Lists the caller's own processed email inquiries — the output of the
background poller described below — and lets the caller act on the ones
waiting in the review queue. Not yet surfaced in any UI; these endpoints
exist so the poller's work is inspectable/actionable now, ahead of a future
dashboard (sub-project 4).

| Method | Path | Request body | Response |
|---|---|---|---|
| GET | `/api/inquiries` | — (optional query `?reply_status=none\|pending_review\|auto_sent\|sent\|rejected`) | `200` array of the caller's own `email_inquiries` rows, newest (`received_at`) first |
| POST | `/api/inquiries/:id/send` | `{"body"?: string}` (optional — overrides the stored draft) | `200` updated inquiry row, reply sent via Gmail as a threaded reply; `404` if not found/not the caller's; `400 {"error": "Inquiry is not pending review"}` unless `reply_status` is currently `pending_review`; `400 {"error": "Gmail account is no longer connected"}` if the connected account was disconnected since the inquiry was logged |
| POST | `/api/inquiries/:id/reject` | — | `200` updated inquiry row (`reply_status: "rejected"`), no email sent; same `404`/`400` conditions as `/send` |

An inquiry row has this shape:

```json
{
  "id": 1,
  "user_id": 2,
  "email_account_id": 1,
  "gmail_message_id": "18abc...",
  "from_address": "dispatch@carrierco.com",
  "subject": "Load #TEST-001 availability",
  "body_snippet": "Hi, is load TEST-001 still available for pickup...",
  "received_at": "2026-08-08T14:02:00.000Z",
  "matched_load_id": 1,
  "match_tier": "load_number",
  "status": "matched",
  "gmail_thread_id": "18abc...",
  "gmail_in_reply_to": "<CAF...@mail.gmail.com>",
  "reply_status": "auto_sent",
  "reply_body": "Hi,\n\nYes, load #TEST-001 is still available:\n...",
  "reply_sent_at": "2026-08-08T14:04:02.000Z",
  "created_at": "2026-08-08T14:04:00.000Z"
}
```

`match_tier` is one of `load_number`, `city_state`, `city`, `state`, `none`;
`status` is `matched` or `needs_review`; `matched_load_id` is `null` when
`status` is `needs_review`. `reply_status` is one of `none` (no load
matched, nothing to reply with), `pending_review` (a reply was composed but
is waiting for a human, via `/send` or `/reject`), `auto_sent` (sent
automatically at poll time), `sent` (a human approved it via `/send`), or
`rejected` (a human dismissed it via `/reject`, no email sent). See "Gmail
integration" below for the full policy on which tier gets auto-sent versus
queued.

## Accounts and roles

Anyone can self-register an account via `POST /api/auth/register` (see
"API reference" above) — no invite or existing session is required. A
self-registered account always gets `role: 'user'`, which can see and edit
only the loads it owns.

The single account seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD` (created by
`npm run setup-db`, see "Setup" above) is the only account with
`role: 'admin'`. Admins see and can edit every user's loads via
`GET /api/loads`, `GET /api/loads/:id`, and `PATCH /api/loads/:id` — not
just their own. `POST /api/loads/upload` is the one exception: it always
upserts under the uploader's own account, admin or not (see "Loads" above).

There is currently no way to promote an existing `role: 'user'` account to
`role: 'admin'` short of direct database access, e.g.:

```sql
UPDATE users SET role = 'admin' WHERE username = 'someuser';
```

This is a known, deliberate limitation for now — there's no
admin-management UI or API endpoint yet.

Role changes made this way are not instantaneous for a user who's already
logged in: `role` is read from the session (set at login/registration),
not re-checked against the database on every request. Demoting an admin
via direct SQL doesn't revoke their access until they log out, their
session expires, or the session store is cleared — there's currently no
way to forcibly terminate a specific user's active session.

## Gmail integration

Each user can connect their own Gmail account (`GET /api/gmail/connect`,
see "Gmail" in the API reference above). Once connected, a background
poller (started in `src/server.js`, running `pollAllAccounts` on a
`setInterval` every 2 minutes) checks that inbox for new messages and tries
to match each one against **that same user's own active loads** — the same
per-user data isolation enforced everywhere else in this backend. Every
processed message is logged to `email_inquiries` (see "Inquiries" above)
whether or not it matched anything, so nothing is silently dropped.

**The first poll after connecting never processes anything — it only
establishes a "from now on" baseline.** `email_accounts.last_polled_at`
starts `NULL` on connect; `pollAccount` checks for that specifically and,
if so, just stamps `last_polled_at = NOW()` and returns, without calling
Gmail at all. This matters because `listNewMessageIds(token, null)` (a
`null` since-date) queries Gmail with no date filter, returning up to the
50 most recent inbox messages regardless of age — treating a newly
connected account's entire recent inbox history (old carrier threads,
internal team mail, anything) as fresh inquiries needing a reply. Only
messages that arrive *after* that first poll are ever processed.

**Auto-send and review queue.** Only an exact **load number** match
(`match_tier: 'load_number'`) is confident enough to reply without a human
looking at it — the carrier gave a unique, unambiguous identifier, so
there's no risk of answering about the wrong load. When that happens, the
poller composes a reply from the matched load's fields (see
`src/lib/replyComposer.js`) and sends it immediately via Gmail, as a proper
threaded reply (`In-Reply-To`/`References` headers, same `threadId`, `Re:`
subject) — `reply_status` becomes `auto_sent`. Every other matched tier
(`city_state`, `city`, `state` — ambiguous enough that multiple candidate
loads existed and were tie-broken by heuristics) still gets a reply
composed and ready, but waits as `reply_status: 'pending_review'` for a
human to approve (`POST /api/inquiries/:id/send`, optionally editing the
body first) or dismiss (`POST /api/inquiries/:id/reject`) — see
"Inquiries" above. Unmatched inquiries (`match_tier: 'none'`) get no
composed reply at all (`reply_status` stays `none`); nothing to send until
a human works out what to do the old-fashioned way. If an auto-send
attempt itself fails (e.g. a transient Gmail API error), the inquiry
degrades gracefully to `pending_review` rather than being lost or crashing
the poller — the same per-item resilience pattern used everywhere else in
the poller. Reply content is a fixed template, not AI-generated — see the
design spec for why (`docs/superpowers/specs/2026-08-09-auto-reply-review-queue-design.md`).

**Matching pipeline** (`src/lib/matchingEngine.js`), tried in this order,
first match wins:

1. **Load number** — the email mentions a load number that matches one of
   the user's own loads exactly. Unambiguous; always wins outright even if
   city/state text is also present.
2. **City + state** — a city and its matching state (either the origin or
   destination of a load) are both mentioned, e.g. "Dallas, TX" or "a load
   from Dallas going to Texas."
3. **City alone** — just a city name, no state.
4. **State alone** — just a state, matched by 2-letter abbreviation
   (**must be written in capitals**, e.g. "TX" — lowercase abbreviations
   are deliberately not matched, since abbreviations like `hi`/`in`/`or`/
   `me`/`ok` collide with common English words and would otherwise produce
   false matches on ordinary sentences) or by full state name in any case
   (e.g. "Texas" or "texas").

If a tier matches more than one load, a date mentioned in the email (e.g.
"picking up 8/12") narrows the field to loads whose pickup date matches; if
that's still ambiguous, or no date was mentioned, the load with the
earliest pickup wins — on the assumption that a carrier asking generically
about, say, "a Dallas load" most likely wants whichever one is leaving
soonest.

An AI-based fallback for genuinely ambiguous emails (nothing above
matches, or a human should double-check a low-confidence match) is
deliberately out of scope for this phase — the `email_inquiries` schema
(`match_tier`, `status`) leaves room for it to be added later without a
rework.

### Setting up real Gmail access

Everything above is built and tested against mocked Gmail API responses —
no real Google credentials are needed to develop against or run the test
suite. Connecting a *real* Gmail inbox, however, requires OAuth credentials
from a Google Cloud project, which only the app owner can create (it's
tied to a Google account):

The same credentials also power **Sign in / sign up with Google**
(`GET /api/auth/google`), since both flows share `createOAuthClient()` in
`src/lib/googleOAuth.js` — there's only one Google Cloud project and one
OAuth client to set up, not two.

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Gmail API** for that project.
3. Configure the **OAuth consent screen** (app name, and scopes
   `openid`, `userinfo.email`, `userinfo.profile`, `gmail.readonly`, and
   `gmail.send` — the sign-in flow requests all five together; the
   standalone Gmail-connect flow requests just the last two). While the
   consent screen is in **Testing** publishing status (the default),
   every Google account that needs to sign in or connect Gmail —
   including your own — must be added under **Test users**, or the OAuth
   flow will fail for them.
4. Create an **OAuth 2.0 Client ID** (application type: **Web
   application**), with **both** callback URLs as authorized redirect
   URIs: `http://localhost:4000/api/gmail/oauth/callback` and
   `http://localhost:4000/api/auth/google/callback` (or your production
   equivalents).
5. Put the resulting values into `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:4000/api/gmail/oauth/callback
   GOOGLE_SIGN_IN_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
   ```
   Both default to the `localhost:4000` values shown above if unset, so
   only override them for a production deployment. They're deliberately
   two separate variables — an OAuth2 client's redirect URI is fixed at
   construction and must exactly match whichever endpoint the
   authorization request was actually sent to, so the Gmail-connect flow
   and the sign-in flow each need their own.

Without these three variables set, `GET /api/gmail/connect` and
`GET /api/auth/google` will redirect to an invalid Google URL (Google will
show its own error page) — everything else in the app, including
`GET /api/gmail/status` for a never-connected user, works fine either way.
The server does not fail to start if these are unset; they're only read
lazily when a Google/Gmail route or the poller actually needs them.

## Behavior notes

**`status` can only change via `PATCH /api/loads/:id`.** The upload
endpoint (`POST /api/loads/upload`) upserts loads from a CSV re-upload, but
its column allowlist (`LOAD_COLUMNS` in `src/routes/loads.js`) deliberately
excludes `status` — even if an uploaded row includes a `status` field, it
is silently ignored and the existing status is left untouched. This is a
structural guarantee, not just a documented convention: there's no code
path in the upload handler that can write to that column. Per the design
spec, load status is a manual, explicit action, not something inferred
from CSV contents (e.g. a load missing from a re-upload is *not*
auto-expired).

**The upload endpoint is transactional.** All loads in a single
`POST /api/loads/upload` request are upserted inside one MySQL transaction.
If any row in the batch fails (e.g. a DB constraint violation), the whole
transaction is rolled back and none of the batch's changes are persisted —
no partial writes. The `{"inserted", "updated"}` counts in the response are
only returned after a successful commit.

**Required environment variables are validated at startup**, in both
`src/server.js` (checks `SESSION_SECRET`, `DB_HOST`, `DB_USER`, `DB_NAME`,
`FRONTEND_ORIGIN`)
and `scripts/setup-db.js` (checks `DB_HOST`, `DB_USER`, `DB_NAME`,
`DB_NAME_TEST`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`). Both fail fast with a
`Missing required environment variable(s): ...` error rather than
attempting to run with undefined values. If you hit this, check that
`.env` exists and is filled in — `dotenv` won't error on a missing `.env`
file, so an absent file looks the same as an incomplete one.
