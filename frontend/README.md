# BulkPosting Frontend

A React/Vite frontend for the BulkPosting backend — the tool freight brokers
use to bulk-manage loads (CSV upload, a loads table, rate editing, DAT
export, and a "blast" email/notification flow).

**This is Phase 1: the auth shell only.** It implements session-based login,
a logged-in/logged-out state machine, and a stub main page shown after
login. CSV upload, the loads table, rate editing, DAT export, and the blast
modal are **not implemented yet** — those land in follow-up phases that
build on top of this shell. See
`docs/superpowers/specs/2026-08-04-backend-foundation-design.md` in the repo
root for the full design.

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

Runs the Vitest suite (`vitest run`) — 20 tests across 4 suites
(`src/App.jsx`, `src/api/client.js`, `src/api/auth.js`,
`src/pages/LoginPage.jsx`). All API calls are mocked, so **no backend is
required** to run tests.

## Manual end-to-end verification walkthrough

This proves the login flow works against the real backend (not mocks).

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
   logged in yet.

4. **Log in** with the admin credentials from `backend/.env`
   (`ADMIN_USERNAME` / `ADMIN_PASSWORD`, e.g. `admin` / `changeme123` in a
   default local setup). You should land on the main shell: a header with
   the username and a "Log out" button, and "Load management tools coming
   soon." as the body.

5. **Refresh the page.** You should stay logged in and land directly back
   on the shell (no flash back to the login form) — this confirms the
   session cookie is being sent and honored on the `GET /api/auth/me`
   check that runs on mount.

6. **Click "Log out."** You should return to the login form. Refreshing
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
