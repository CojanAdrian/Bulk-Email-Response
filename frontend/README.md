# BulkPosting Frontend

A React/Vite frontend for the BulkPosting backend — the tool freight brokers
use to bulk-manage loads (CSV upload, a loads table, rate editing, DAT
export, and a "blast" email/notification flow).

**This is the complete rebuild of the original `IGT_DAT_Processor.html`
tool, plus the full email auto-reply dashboard.** It implements
session-based login and self-service registration, uploading a McLeod CSV
export, viewing/filtering the resulting loads table, editing a load's
target pay and status, generating a DAT bulk-upload CSV (with the same
anomaly detection, cross-post expansion, and dedup rules as the original
tool), searching/looking up a load and getting an email-ready description,
blasting that description to a list of carrier emails via Gmail, connecting
a Gmail account for inbound carrier inquiries, reviewing/editing/sending or
rejecting queued auto-reply drafts, and a log of every processed inquiry.
See `docs/superpowers/specs/2026-08-04-backend-foundation-design.md`,
`docs/superpowers/specs/2026-08-08-email-matching-engine-design.md`,
`docs/superpowers/specs/2026-08-09-auto-reply-review-queue-design.md`,
`docs/superpowers/specs/2026-08-09-live-dashboard-design.md`,
`docs/superpowers/specs/2026-08-09-frontend-phase3-design.md`, and
`docs/superpowers/specs/2026-08-09-design-system-design.md` in the repo
root for the full design history.

## Design system

The UI is a dark-mode-first "shell and cards" layout: a near-black (light
mode: pale sage) shell holds an icon-based sidebar, and every panel of
actual content floats on top of it as a white, heavily-rounded card. The
accent is a single vibrant lime (`#d7ff3d`), used for the active nav item,
primary buttons, and focus rings — never as body text, since a lime this
bright fails WCAG contrast as a foreground color and is restricted to
fills-with-dark-text or backgrounds-with-dark-text-on-top. A light/dark
toggle lives in the sidebar (defaults to the visitor's OS preference, then
persisted to `localStorage`).

Two token families live in `src/styles/tokens.css`: `shell-*` tokens
(`shell-bg`, `shell-surface`, `shell-text`, `shell-text-muted`,
`shell-border`) theme the outer app frame and swap between light/dark;
`surface`/`text`/`border`/status-color tokens theme the content cards and
stay constant across both themes, since cards are always white/light
regardless of shell theme. Both families are mapped into Tailwind via
`tailwind.config.js`'s `colors` extension, so components never hardcode a
raw hex or a light/dark-specific class.

Shared building blocks carry the look consistently: `Card.jsx`
(`rounded-3xl` white card, soft shadow), `PrimaryButton.jsx` (lime
`rounded-full` pill), `SecondaryButton.jsx` (outlined `rounded-full`
pill), `Badge.jsx` (pastel `rounded-full` status/tag pills), and
`Sidebar.jsx` (icon + label nav, lime pill on the active tab). The rest of
the UI follows a consistent radius scale on top of these — `rounded-lg`
for inputs and small inline buttons, `rounded-xl` for nested panels inside
a card, `rounded-2xl` for the logo mark and sidebar nav buttons,
`rounded-3xl` for cards, `rounded-full` for pills/badges/primary actions
— rather than mixing arbitrary corner radii per component.

## Live updates

The app holds one WebSocket connection open (`src/lib/liveSocket.js`) so
changes made anywhere — this tab, another tab, another device, or the
backend's own Gmail poller — show up immediately, with no manual refresh
and no polling delay. The connection starts once a session is confirmed
active and closes on logout; a small status dot next to the username in
the sidebar (green/amber/gray, `ConnectionIndicator.jsx`) shows whether
it's currently connected, reconnecting, or offline, so a background
feature the user is relying on never silently stops working with no
visible sign. If the connection drops, it reconnects automatically with
exponential backoff (1s, 2s, 4s, 8s, capped at 30s), resetting back to 1s
once a connection has stayed open more than 5 seconds.

Each panel that shows server-owned data subscribes to the specific events
that affect it: the loads table and DAT export section refetch on
`load:changed` (a PATCH, an upload, from any tab); the Gmail connection
panel applies a pushed `gmail:status` directly; the review queue and
inquiry log both react to `inquiry:new`/`inquiry:updated` — a message the
backend's poller just processed appears in the log (and, if it needs a
human, the review queue) the instant it's stored, and sending or
rejecting an inquiry in one tab removes it from every other open tab's
queue too. This does **not** shrink the backend's Gmail polling interval
(still up to 2 minutes to *detect* a new email) — it only removes the
delay between the backend having processed something and the browser
reflecting it. See
`docs/superpowers/specs/2026-08-09-realtime-infrastructure-design.md` for
the full design.

## Animations

Every live event above now has motion behind it, via Framer Motion.
`src/lib/motionConfig.js`'s `useMotionPreset()` is the single source every
animated component pulls its transition/spring/stagger values from — when
the visitor's OS has `prefers-reduced-motion` enabled, it swaps every
animation to a near-instant duration-only transition (no spring bounce, no
stagger) in one place, rather than each component handling that itself.

- **New inquiries pop in live** — the headline "I want to see it pop up
  live" feature. `ReviewQueue`'s rows enter with a spring pop
  (`AnimatePresence` + `motion.li`), staggered ~40ms apart if several
  arrive in a burst; `InquiriesLog`'s rows fade in (table rows don't
  reliably support the `transform` a full pop-in needs). A toast
  (`Toast.jsx` / `useToast()`) surfaces `"New inquiry from {address}"` for
  ~4s, click it to jump straight to the Inquiries tab.
- **Modals** (`RateModal`, `ContactMethodModal`, `RateSelectionModal`,
  `BlastModal`) animate open and closed instead of appearing/vanishing
  instantly — backdrop fade, card scale-in-from-0.95-with-upward-motion.
  Escape and backdrop-click-to-close are unchanged, only how the close
  looks. (`Card.jsx` gained a `forwardRef` so `motion(Card)` can drive it
  directly.)
- **Tab switching** (Loads ↔ Inquiries) crossfades instead of swapping
  instantly.
- **The connection-health dot** (`ConnectionIndicator.jsx`) pulses only
  while `'connecting'`/reconnecting and goes static once `'open'` — the
  pulse itself means "still trying," which stops being true once
  connected, so no motion plays on a settled connection.
- **Loading states**: `Skeleton.jsx` (a small pulsing placeholder block)
  replaces plain "Loading..." text in `LoadsTable`, `ReviewQueue`,
  `InquiriesLog`, and `DatExportSection`'s loads fetch.

See `docs/superpowers/specs/2026-08-09-live-animations-design.md` for the
full design, including which `ui-ux-pro-max` guidance each choice is
sourced from.

## Prerequisites

- Node.js (v18+ recommended)
- The BulkPosting backend running and reachable — see
  [`../backend/README.md`](../backend/README.md) for how to set it up
  (MySQL, `.env`, `npm run setup-db`, `npm start`). This frontend has
  nothing to render without it: on load it calls the backend to check for
  an existing session, and the login form posts credentials to it.

## Setup

From the `frontend/` directory:

1. **Copy the env file:**

   ```bash
   cp .env.example .env
   ```

   The only variable is `VITE_API_URL`, the backend's base URL. The
   default (`http://localhost:4000`) matches the backend's default `PORT`
   — leave it as-is unless you've changed the backend's port.

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Run the dev server:**

   ```bash
   npm run dev
   ```

   Vite serves this on **`http://localhost:5173`** by default (no custom
   `server.port` is set in `vite.config.js`). This matters: the backend's
   `FRONTEND_ORIGIN` env var (in `backend/.env`) must match this exactly
   (`http://localhost:5173`) for CORS and the session cookie to work — the
   backend allows credentialed cross-origin requests only from that one
   configured origin. If you run the frontend on a different port, update
   `backend/.env`'s `FRONTEND_ORIGIN` to match and restart the backend.

## Running tests

```bash
npm test
```

Runs the Vitest suite (`vitest run`) — 357 tests across 38 suites, covering
every API module, page, and component, including the two pure-function
pipelines (`src/lib/mcleodParser.js` for CSV column mapping,
`src/lib/datExport.js` for the DAT export pipeline, and
`src/lib/lookupMessage.js` for search/message-building), every component
(upload, loads table, rate modal, Gmail connection, review queue, inquiry
log, DAT export section, the two pre-export modals, the anomaly report,
the load lookup panel, and the blast modal), and the design system's
shared building blocks (`Card`, `PrimaryButton`, `SecondaryButton`,
`Badge`, `ThemeToggle`). All API calls are mocked, so **no backend is
required** to run tests.

## Uploading loads

On the main screen, use "Upload loads CSV" to upload a McLeod export.
The file is parsed entirely in the browser (column names are matched
flexibly, e.g. "Dest City" or "Destination City" both work) and the
resulting loads are upserted into the database by load number — a
re-upload with the same load numbers updates rates/details rather than
creating duplicates, and never changes a load's `active`/`booked`/`expired`
status (that's manual-only, via "Edit rate" on the loads table).

Known limitation: if you have "Edit rate" open for a load and someone
re-uploads a CSV that updates that same load in the background, saving
your edit will overwrite the freshly-uploaded data with whatever you
had open in the modal — there's no conflict detection yet. Close and
reopen "Edit rate" if you know a re-upload just happened.

## DAT export, load lookup, and blast email

Below the loads table, the "DAT Export" section works entirely on your
**currently active loads** (whatever `GET /api/loads?status=active` returns
right now) — not on a fresh CSV, and not tied to when you last uploaded.
This is a deliberate difference from the original tool, which ran its
whole pipeline once, immediately after a CSV upload; since loads now
persist, export works on-demand instead. See
`docs/superpowers/specs/2026-08-09-frontend-phase3-design.md` for the full
reasoning and every business rule transcribed from the original tool.

**Generating a DAT export:**
1. Click **Generate DAT Export**. A modal asks for the DAT contact method
   (phone or email — straight-box equipment like `SB`/`BR`/`BZ` always
   uses email, overriding this choice), whether to append a contact line
   to every load's DAT comment, and whether to include the DAT Loadboard
   Rate for all loads, none, or a per-load choice.
2. If you chose "per load," a follow-up table lets you check/uncheck each
   load and edit its rate before continuing.
3. A CSV downloads immediately (`DAT_Bulk_Upload_YYYY-MM-DD.csv`), and an
   **Anomaly Report** appears below — one section per category (same-city
   loads, excluded blank-equipment loads, unrecognized equipment codes,
   duplicate lanes that got collapsed, rate anomalies over $10,000 or
   exactly $0, cross-posted equipment that got added automatically, city
   overrides parsed from a `"post as X, ST to Y, ST"` comment, ambiguous
   cases that need a human to verify, and Canadian-province/atypical-city
   location flags). Nothing in this report blocks the export — it's there
   so you can double-check the CSV before actually uploading it to DAT.

**Load Detail Lookup:** search by order number, city, or state (order
number and an exact state match rank highest) to pull up a load and get a
ready-to-paste email description — pickup/delivery lines built from the
load's schedule, commodity, weight, and temperature (for reefer loads),
plus either the rate or a "how much would you need for this?" fallback
depending on a rate-visibility toggle. A multi-stop warning appears when
the load's comment mentions a second pickup/delivery, or it has a nonzero
stop count, since those details need to be added manually. "Copy to
clipboard" copies the current message text.

**Blast email:** once a load is selected in lookup, click **Blast email**
to open a modal pre-filled with a subject line and the same message body.
Paste carrier emails (one per line or comma-separated) or drop a `.csv`/
`.txt` file to extract every email-shaped substring from it (`.xlsx`/`.xls`
aren't supported — export to CSV first). **Open in Gmail** builds a Gmail
compose link (`bcc` set to every valid email, prefilled subject/body) and
opens it in a new tab — this is a manual compose handoff, separate from
the OAuth-connected Gmail account used for auto-replying to inbound
inquiries (see "Gmail integration" in the backend README); nothing is sent
through this app's own connected account.

## Registration

The login screen has a "Don't have an account? Sign up" link that switches
to a registration form (username, password, confirm password). On success,
the new account is created and you're **auto-logged-in** immediately —
landing directly on the main tool shell, same as after a login. The
registration form also has an "Already have an account? Log in" link back
to the login screen.

A self-registered account always gets `role: 'user'`, which — per the
backend's own per-user load isolation — starts with an empty loads table
and can only see/edit loads it uploads itself. There's no way to
self-register as `role: 'admin'`; see the backend README's "Accounts and
roles" section for how the one admin account is seeded and what admins can
see that regular users can't.

**Continue with Google** — both the login and register screens also have
a "Continue with Google" / "Sign up with Google" button (`GoogleSignInButton.jsx`)
above the username/password form. This is a real page navigation to
`GET /api/auth/google`, not a fetch, since it has to land on Google's own
consent screen. A first-time Google sign-in creates the account (username
defaults to the Gmail address) **and connects that same Gmail account
automatically** — no separate "Connect Gmail" step needed, since the one
OAuth consent grants both identity and Gmail access together. A returning
Google user just logs in. If the flow fails or hits an edge case (email
not verified with Google, or the resolved username collides with an
existing manual account), the backend redirects back with a
`?authError=<code>` the page reads once on mount, shows as a normal error
message, and strips from the URL (`src/lib/useGoogleAuthError.js`) — see
the backend README's "Sign in / sign up with Google" section for the full
flow and every error code.

## Inquiries tab

The sidebar has two nav items: **Loads** (the default, everything above)
and **Inquiries** — the email auto-reply dashboard. Switching to it renders
three independent panels, each with its own loading/error state (one
panel's failure doesn't block the others):

- **Gmail connection** — shows whether the logged-in user has connected a
  Gmail account. If not, a "Connect Gmail" button navigates the browser
  (a real page load, not a fetch — `GET /api/gmail/connect` is a redirect
  to Google's consent screen, so it can't go through the JSON API client)
  to start the OAuth flow. If connected, shows the address and a
  "Disconnect" button, which requires an explicit confirm step first since
  disconnecting stops auto-replies going out until reconnected. Below that,
  an **"Auto-send confident matches"** toggle (off by default on every
  account, including a brand-new connection) controls whether an inquiry
  that mentions an exact load number gets replied to immediately
  (`PATCH /api/gmail/auto-send`) — every other match always waits in the
  review queue regardless of this setting.
- **Review queue** — every inquiry waiting on a human
  (`reply_status: 'pending_review'`): who asked, what they asked, and an
  editable textarea pre-filled with the composed reply. **Send** posts the
  (possibly-edited) textarea content and removes the row from the queue on
  success; **Reject** dismisses it (no email sent) and does the same. See
  `backend/README.md`'s "Gmail integration" section for exactly which
  inquiries land here versus getting auto-sent without review.
- **Inquiry log** — a read-only table of every inquiry the backend poller
  has ever processed, with a colored status badge (Auto-sent / Sent /
  Pending review / Rejected / No match).

A "Refresh" button above the panels manually re-fetches the review queue
and inquiry log — redundant now that both panels also update live (see
"Live updates" below), but harmless to keep pressing if you want to force
a fresh fetch. The Gmail connection panel re-checks on every tab switch
since it remounts each time.

**None of this works meaningfully without real Google OAuth credentials
configured on the backend** (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
`GOOGLE_REDIRECT_URI` in `backend/.env` — see `backend/README.md`'s
"Setting up real Gmail access"). Without them, "Connect Gmail" will
redirect to a Google error page instead of a real consent screen. The
panels themselves (status/queue/log) work and render correctly either
way — they just show "not connected" and empty lists until a real
connection exists.

## Manual end-to-end verification walkthrough

This proves the login/registration flow, CSV upload, loads table, and rate
editing all work against the real backend (not mocks).

1. **Start the backend** (from `backend/`, with MySQL reachable and `.env`
   filled in — see its README):

   ```bash
   npm run setup-db   # idempotent; seeds the admin user from ADMIN_USERNAME/ADMIN_PASSWORD
   npm start          # listens on PORT (default 4000)
   ```

2. **Start this frontend** (from `frontend/`):

   ```bash
   npm run dev        # listens on 5173
   ```

3. **Open `http://localhost:5173`** in a browser. You should briefly see
   "Loading..." (the app calling `GET /api/auth/me` to check for an
   existing session) and then land on the login form, since you're not
   logged in yet. It has a "Don't have an account? Sign up" link.

4. **Click "Sign up."** You should see the registration form (username,
   password, confirm password) with an "Already have an account? Log in"
   link back to the login form.

5. **Register a brand-new account** — a username you haven't used before, a
   password at least 8 characters, and a matching confirm-password. You
   should land directly on the main shell, logged in as the new user (no
   separate login step needed). The loads table should be empty — a fresh
   account has no loads of its own yet, which is expected given per-user
   load isolation (see the backend README's "Accounts and roles" section).

6. **Log out**, click "Sign up" again, and try registering that **same
   username** a second time. You should see a "Username already taken"
   error and stay on the registration form (the account is not
   re-created or logged into).

7. **Log in** as the account you just registered, to confirm the
   credentials actually persisted server-side. You should land back on the
   main shell. (You can also log in with the seeded admin credentials from
   `backend/.env` — `ADMIN_USERNAME` / `ADMIN_PASSWORD`, e.g.
   `admin` / `changeme123` in a default local setup — to exercise the
   `role: 'admin'` account instead.)

8. **Refresh the page.** You should stay logged in and land directly back
   on the shell (no flash back to the login form) — this confirms the
   session cookie is being sent and honored on the `GET /api/auth/me`
   check that runs on mount.

9. **Upload a McLeod CSV** (e.g. `test_loads_mockup.csv` in the repo root)
   via the "Upload loads CSV" control. You should see a success message
   with a nonzero "inserted" count, and the loads table below should
   populate.

10. **Click "Edit rate"** on a row, change the target pay or status, and
    save. The table should reflect the change immediately.

11. **Re-upload the same CSV.** The success message should now show
    "updated" loads instead of "inserted", and the table's row count
    should not change.

12. **Click "Log out."** You should return to the login form. Refreshing
    again should keep you on the login form (the session was destroyed
    server-side).

If any step fails, the most likely causes are:

- **CORS error in the browser console** — `backend/.env`'s
  `FRONTEND_ORIGIN` doesn't match the frontend's actual origin
  (`http://localhost:5173`).
- **Network error immediately on load** — `frontend/.env`'s
  `VITE_API_URL` doesn't match where the backend is actually listening, or
  the backend isn't running.
- **401 on login with correct-looking credentials** — `backend/.env`'s
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` don't match what you're typing, or
  `npm run setup-db` hasn't been run against that database yet.
- **Session doesn't persist across refresh** — check that cookies aren't
  being blocked (e.g. browser privacy settings) and that both servers are
  on `localhost` (not `127.0.0.1` vs `localhost` mismatches, which count as
  different origins for cookie purposes).
- **Request hangs for ~10 seconds, then shows "Request timed out"** — the
  backend process is reachable but not responding (e.g. its MySQL
  connection is stuck or the database container isn't running). Every
  request from `frontend/src/api/client.js` aborts after 10 seconds
  rather than hanging indefinitely; check the backend's own logs and that
  `bulkposting-mysql` (or your local MySQL server) is actually up.

**Verification status for the Inquiries tab specifically:** every
component's behavior is covered by the Vitest suite above (loading/error
states, the confirm-before-disconnect step, editable reply drafts,
send/reject removing a row, the refresh button). The exact JSON shapes
these components expect were also verified against a real running backend
and MySQL database (not mocks) — registering a user, checking
`GET /api/gmail/status` returns `{"connected": false}`, seeding a real
`pending_review` row and confirming `GET /api/inquiries?reply_status=...`
returns it with every field these components read, and confirming
`POST /api/inquiries/:id/reject` actually updates the row and removes it
from that filtered list. What was **not** done: an actual browser
click-through of the rendered UI — no browser automation tool was
available in the environment this was built in. If you're picking this up
next, a manual click-through (steps 1-2 above to start both servers, then
log in and click the Inquiries tab) is the one verification step still
worth doing before considering this fully done.
