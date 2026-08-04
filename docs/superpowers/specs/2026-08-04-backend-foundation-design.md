# Backend Foundation — Design Spec

Date: 2026-08-04
Status: Approved for planning (sub-project 1 of 4)

## Background

The current app (`IGT_DAT_Processor.html`) is a single self-contained static HTML file with vanilla JavaScript, no backend, and no database. Loads are parsed from an uploaded McLeod CSV export into an in-memory array (`rows`) that is lost on page refresh. Email ("blast") functionality is limited to generating a Gmail compose-link — nothing is sent or received programmatically.

## Overall Feature Vision

The long-term goal is an auto-reply system for load-inquiry emails: a persistent load database, an email inbox integration (Gmail) that reads incoming inquiries, a matching engine that identifies which load an inquiry refers to, automatic (or queued) replies, and a live internal dashboard showing this activity.

This is too large to design and build as one project. It is broken into four sub-projects, each independently designed, planned, and built:

1. **Backend foundation** (this spec) — MySQL database, Node/Express API, and a rebuilt (React) frontend for the *existing* features (CSV upload, DAT export, lookup, rate editing, blast), now running on persistent, shared, multi-user data instead of in-page memory.
2. **Email integration + matching engine** — Gmail API read access; a rule-based matching pipeline (load number → city+state → city → state, with date-based tie-break, falling back to earliest pickup) to identify which load an inquiry refers to.
3. **Auto-send + review queue** — high-confidence matches (exact load #, unambiguous single match) send automatically via Gmail API; ambiguous or unmatched inquiries queue for manual review/approval.
4. **Live internal dashboard** — an activity feed showing incoming inquiries, their matched load, confidence, and reply status, for internal monitoring only (not a public load board).

An AI-based (Claude API) fallback for matching was considered and deliberately deferred: the rule-based pipeline covers the patterns the business actually sees (load #, city, state, city+state combinations), is free, instant, and fully traceable. The design leaves a clean seam — a final pipeline stage — where an AI fallback can be added later for cases where rules find zero or too many candidates, without restructuring the matching engine.

This spec covers **sub-project 1 only.**

## Architecture & Tech Stack

- **Frontend:** React app built with Vite. Visual redesign — modern/clean aesthetic — while retaining the existing company logo and brand identity. Served as static files, calls the backend via `fetch`.
- **Backend:** Node.js + Express, REST API (e.g. `/api/loads`, `/api/auth`).
- **Database:** MySQL. Single source of truth for load data — no more in-page-memory-only state.
- **Auth:** Login via username + password (bcrypt-hashed), authorizing subsequent requests with a server-side session cookie. Small team of users, flat permissions (no roles) for this phase.
- **Local development:** Runs entirely on the developer's machine — MySQL locally (native or Docker), Express backend on a local port, Vite dev server proxying API calls to it. A seed/setup script creates the schema and an initial admin user.
- **Deployment:** Deferred. The current free static host cannot run a Node backend or MySQL; a host supporting both (VPS, or a bundled platform like Railway/Render) will be chosen once this phase works locally. Nothing in this design is host-specific.

## Database Schema

### `loads`

| Column | Notes |
|---|---|
| `id` | primary key |
| `load_number` | unique, from McLeod `order`; used for exact-match logic in sub-project 2 |
| `origin_city`, `origin_state`, `origin_zip` | |
| `dest_city`, `dest_state`, `dest_zip` | |
| `equipment` | |
| `weight` | |
| `target_pay` | editable via the rate modal |
| `early_pu`, `late_pu`, `late_del` | datetime windows |
| `stops` | |
| `commodity`, `temperature` | derived from the planning comment via the existing regex-based extraction logic |
| `comment` | raw planning comment, retained for reference/re-parsing |
| `status` | `active` / `booked` / `expired`. Changed **only** via explicit manual action in the UI — never inferred automatically from CSV upload contents (a load absent from a re-upload is left as-is, not auto-expired) |
| `created_at`, `updated_at` | |

### `users`

`id`, `username`, `password_hash`, `created_at`. Flat — no role differentiation in this phase.

### Upload behavior

Re-uploading a McLeod CSV **upserts** rows by `load_number`: existing loads have their fields updated from the new CSV data (rate, dates, etc.), new `load_number`s are inserted. Loads not present in a given upload are left untouched — status changes are a deliberate, manual action only.

## Feature Mapping

Every existing feature is ported like-for-like onto the new stack, with a fresh visual design layered on top — no functionality is removed:

- **CSV upload & McLeod parsing** — same PapaParse-based parsing, column mapping, and anomaly detection; parsed rows now POST to `/api/loads/upload`, which upserts into MySQL instead of populating a JS array.
- **DAT bulk-upload export** — reads active loads from the database via the API, builds the same DAT CSV format, downloads it.
- **Load lookup/search** — queries the database instead of an in-memory array; retains the existing relevance-based sort (origin matches before destination).
- **Rate modal** — edits `target_pay` via `PATCH /api/loads/:id`, persisted immediately to MySQL.
- **Blast modal** (Konami-code trigger, carrier-email drag-and-drop, editable email body) — unchanged client-side behavior; message text is built from the DB-backed load record instead of the session array. Still hands off to Gmail via a compose-link (no programmatic sending in this phase).
- **Auth** — a login page gates the app; a server-side session cookie authorizes subsequent API calls; logged-out users see only the login screen.

## Testing Approach

Given this tool handles real rates and load data, testing focuses on the areas most likely to silently cause costly mistakes:

- CSV parsing/upsert logic — correct updates vs. duplicate loads on re-upload.
- API layer — auth gating, CRUD correctness for loads.
- Manual click-through testing for the React UI itself (no automated UI test suite in this phase).

## Out of Scope (this sub-project)

- Gmail API integration (read or send) — sub-project 2.
- Load-matching engine — sub-project 2.
- Auto-reply sending and review queue — sub-project 3.
- Live internal activity dashboard — sub-project 4.
- Role-based permissions (flat user model for now).
- Choice of production hosting provider.
