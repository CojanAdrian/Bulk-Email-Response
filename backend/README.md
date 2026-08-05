# BulkPosting Backend

A Node.js/Express/MySQL API for persistent freight load data. It replaces the
old in-page-memory data model (a JS array parsed from a CSV upload, lost on
page refresh) with a shared, multi-user MySQL database.

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
   `ADMIN_USERNAME`/`ADMIN_PASSWORD`) into the dev database if one with that
   username doesn't already exist. It's idempotent — safe to re-run any
   time (e.g. after pulling a schema change); it will not duplicate the
   admin user or error on tables that already exist.

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

There are 24 tests across 3 suites: `tests/health.test.js`,
`tests/auth.test.js`, `tests/loads.test.js`.

## Manual smoke test (curl)

With the server running (`npm start`) and `.env`'s `ADMIN_USERNAME` /
`ADMIN_PASSWORD` seeded via `npm run setup-db`:

```bash
# 1. Log in — saves the session cookie to cookies.txt
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}'
# -> {"username":"admin"}

# 2. Upload a batch of loads (upserted by load_number)
curl -b cookies.txt -X POST http://localhost:4000/api/loads/upload \
  -H "Content-Type: application/json" \
  -d '{"loads":[{"load_number":"TEST-001","origin_city":"Chicago","origin_state":"IL","dest_city":"Dallas","dest_state":"TX","target_pay":1500.00}]}'
# -> {"inserted":1,"updated":0}

# 3. List active loads
curl -b cookies.txt "http://localhost:4000/api/loads?status=active"
# -> [{"id":1,"load_number":"TEST-001","origin_city":"Chicago", ... "status":"active", ...}]
```

All `/api/loads/*` routes require an authenticated session — an unauthenticated
request to any of them returns `401 {"error":"Unauthorized"}`.

## API reference

### Health

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/health` | none | `200 {"ok": true}` |

### Auth (`/api/auth`)

| Method | Path | Auth | Request body | Response |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | `{"username": string, "password": string}` | `200 {"username": string}` on success; `401 {"error": "Invalid credentials"}` if the username doesn't exist or the password is wrong |
| POST | `/api/auth/logout` | none | — | `200 {"ok": true}` (destroys the session) |
| GET | `/api/auth/me` | session | — | `200 {"username": string}`; `401 {"error": "Unauthorized"}` if not logged in |

A successful login sets an `httpOnly`, `sameSite=lax` session cookie. All
`/api/loads/*` routes require this cookie (enforced by
`src/middleware/requireAuth.js`).

### Loads (`/api/loads`) — all routes require an authenticated session

| Method | Path | Request body | Response |
|---|---|---|---|
| GET | `/api/loads` | — (optional query `?status=active\|booked\|expired`) | `200` array of load rows, newest (`created_at`) first |
| GET | `/api/loads/:id` | — | `200` load row; `404 {"error": "Load not found"}` if no such id |
| PATCH | `/api/loads/:id` | `{"target_pay"?: number, "status"?: "active"\|"booked"\|"expired"}` (at least one) | `200` updated load row; `400 {"error": "No valid fields to update"}` if neither field is present; `404 {"error": "Load not found"}` if no such id |
| POST | `/api/loads/upload` | `{"loads": [{ "load_number": string, ... other load fields }]}` | `200 {"inserted": number, "updated": number}`; `400 {"error": "loads must be an array"}` if `loads` isn't an array |

A load row has this shape (from `sql/schema.sql`):

```json
{
  "id": 1,
  "load_number": "TEST-001",
  "origin_city": "Chicago", "origin_state": "IL", "origin_zip": null,
  "dest_city": "Dallas", "dest_state": "TX", "dest_zip": null,
  "equipment": null, "weight": null,
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

Any unhandled error in a route (e.g. a dropped DB connection) is caught by
a shared error handler and returned as `500 {"error": "Internal server error"}`
instead of crashing the server — see "Behavior notes" below.

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
`src/server.js` (checks `SESSION_SECRET`, `DB_HOST`, `DB_USER`, `DB_NAME`)
and `scripts/setup-db.js` (checks `DB_HOST`, `DB_USER`, `DB_NAME`,
`DB_NAME_TEST`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`). Both fail fast with a
`Missing required environment variable(s): ...` error rather than
attempting to run with undefined values. If you hit this, check that
`.env` exists and is filled in — `dotenv` won't error on a missing `.env`
file, so an absent file looks the same as an incomplete one.
