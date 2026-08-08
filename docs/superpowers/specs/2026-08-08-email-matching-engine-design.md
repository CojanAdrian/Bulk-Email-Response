# Email Integration & Load-Matching Engine — Design Spec

Date: 2026-08-08
Status: Approved for planning (sub-project 2 of 4 in the email auto-reply roadmap)

## Background

The original project goal (from the very first design session,
`docs/superpowers/specs/2026-08-04-backend-foundation-design.md`) is to
auto-reply to carrier emails asking about load availability. Sub-project 1
(backend + frontend foundation, persistent loads, multi-user accounts) is
done. This sub-project is the first piece of the actual auto-reply
feature: connect a user's real Gmail inbox, detect load-inquiry emails,
and figure out which of that user's loads each one is asking about.

**Revision from the original design:** the original spec assumed one
shared inbox. Since then, the app moved to a private-per-user loads model
(each broker only sees their own loads). This sub-project follows that
model: each user connects **their own** Gmail account, and inquiries in
that inbox are matched only against **that same user's** own loads —
consistent with the isolation already enforced everywhere else in the
backend.

This sub-project covers detection and matching only. It deliberately does
**not** send replies (sub-project 3) or provide a review UI (sub-project
4) — those build on top of what's here.

## Architecture

**Per-user Gmail OAuth.** Each user connects their own Gmail account via
Google's standard OAuth2 consent flow. On success, we store a refresh
token (server-side, tied to that user's account) and use it to mint
short-lived access tokens on demand — the user never has to re-authorize
unless they explicitly disconnect.

**Polling, not push.** A background poller checks each connected user's
inbox on a fixed interval (every 2 minutes) for new messages, rather than
using Gmail's push-notification system (which requires a Google Cloud
Pub/Sub topic and a publicly-reachable webhook endpoint — real
infrastructure this local-dev-first project doesn't have yet). Polling is
simpler, requires no additional Google Cloud setup, and is fast enough
for a low-volume freight-inquiry inbox.

**Rule-based matching, no AI (unchanged from the original design).** Each
new email is matched against the user's own loads using the same tiered
pipeline decided at the start of this project: an exact load number
mentioned in the email wins outright; otherwise a city+state pair, then
city alone, then state alone; if a tier produces multiple candidates, a
date mentioned in the email narrows it down, and if that's still
ambiguous, the load with the earliest pickup wins. Every inquiry — matched
or not — is logged with its match tier and confidence, so nothing is
silently dropped. An AI-based fallback for genuinely ambiguous emails was
explicitly deferred in the original design and remains deferred here; this
sub-project's logging schema is built so that fallback can be added later
without a rework.

## Data Model

**`email_accounts`** — one row per connected Gmail inbox:

| Column | Notes |
|---|---|
| `id` | primary key |
| `user_id` | owner — FK-by-convention to `users.id`, matching this codebase's existing no-DB-FK style |
| `gmail_address` | the connected inbox's email address |
| `refresh_token` | Gmail OAuth refresh token (long-lived) |
| `history_id` | Gmail's cursor for "what have we already seen" — avoids re-scanning the whole inbox every poll |
| `connected_at`, `last_polled_at` | |

Only one Gmail account per user for this phase (no multi-inbox support) —
enforced by a unique key on `user_id`.

**`email_inquiries`** — one row per email the poller has processed:

| Column | Notes |
|---|---|
| `id` | primary key |
| `user_id` | owner (redundant with `email_account_id`, kept for simpler queries) |
| `email_account_id` | which connected inbox this came from |
| `gmail_message_id` | Gmail's own message id — unique per account, prevents reprocessing the same email twice |
| `from_address`, `subject`, `body_snippet` | just enough of the email to display later; not the full raw MIME |
| `received_at` | when the email arrived, per Gmail |
| `matched_load_id` | nullable — which load (if any) this was matched to |
| `match_tier` | `load_number` \| `city_state` \| `city` \| `state` \| `none` |
| `status` | `matched` \| `needs_review` (ambiguous or no match) |
| `created_at` | when our poller processed it |

## API Surface (all under `requireAuth`, scoped to the logged-in user)

- `GET /api/gmail/status` — is Gmail connected for this user, and which address
- `GET /api/gmail/connect` — redirects to Google's OAuth consent screen
- `GET /api/gmail/oauth/callback` — Google redirects here after consent; exchanges the code for tokens, stores them
- `POST /api/gmail/disconnect` — removes the stored connection (does not delete past `email_inquiries`)
- `GET /api/inquiries` — lists this user's processed inquiries (for future dashboard use in sub-project 4; not built as a UI in this sub-project, but the endpoint exists so the poller's work is inspectable/testable now)

## Prerequisite — action required from you, not buildable by me

Connecting a real Gmail account requires OAuth credentials from a Google
Cloud project, which only you can create (it's tied to your Google
account):

1. Create a project at console.cloud.google.com
2. Enable the "Gmail API" for it
3. Configure the OAuth consent screen (app name, scopes: `gmail.readonly` and `gmail.send`)
4. Create an OAuth 2.0 Client ID (type: Web application), with `http://localhost:4000/api/gmail/oauth/callback` as an authorized redirect URI
5. Put the resulting Client ID and Client Secret into `backend/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

Everything in this sub-project will be built and unit/integration-tested
against mocked Gmail API responses regardless of whether these credentials
exist yet — that part doesn't block progress. Only the final real-world
manual verification (actually connecting `kenny@igtfreight.com` and
seeing a real email get matched) needs these credentials in place.

## Testing Approach

The Gmail API client and OAuth token exchange are the only parts that
talk to the outside world — those get mocked in tests (matching this
project's established pattern for `client.js`-style boundaries elsewhere).
The matching engine itself is a pure function (input: email text + a
user's load list; output: a match result) and gets the same
thorough branch-by-branch unit testing `mcleodParser.js` got, since it's
the highest-stakes, most novel logic in this sub-project.

## Out of Scope (this sub-project)

- Sending replies (sub-project 3)
- A review queue or dashboard UI for inquiries (sub-project 4)
- AI-based matching fallback (deferred since the original design; the schema leaves room for it)
- Multiple Gmail accounts per user
- Gmail push notifications / Pub/Sub (polling only, for now)
