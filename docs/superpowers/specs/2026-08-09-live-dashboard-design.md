# Live Internal Dashboard — Design Spec

Date: 2026-08-09
Status: Approved for planning (sub-project 4 of 4 in the email auto-reply roadmap)

## Background

Sub-projects 2 and 3 are done: the backend can connect a user's Gmail,
poll it, match inquiries against that user's loads, auto-send confident
replies, and hold everything else in a review queue
(`reply_status: 'pending_review'`), all reachable via
`/api/gmail/*` and `/api/inquiries*`. None of it has a UI yet — this
sub-project is that UI: "an internal dashboard for you," the option chosen
at the very start of this project's planning.

## Scope

A new tab on the existing `MainToolPage` (not a separate route — this app
has no router; navigation is plain component-swap state, matching how
`App.jsx` already switches between login/register/main), alongside the
existing "Loads" tab:

1. **Gmail connection status** — connected address or a "Connect Gmail"
   button; a "Disconnect" option once connected.
2. **Review queue** — every inquiry with `reply_status: 'pending_review'`,
   showing who asked, what they asked, and the composed reply (editable),
   with **Send** and **Reject** actions.
3. **Inquiry log** — a read-only list of everything the poller has ever
   processed (auto-sent, sent, rejected, and unmatched), for visibility
   into what's happening without digging through logs.

## Out of scope

- Any change to backend behavior — this consumes the existing
  `/api/gmail/*` and `/api/inquiries*` endpoints exactly as they are.
- Real-time updates (websockets/polling-from-the-browser) — a manual
  refresh button is enough for an internal tool used by a small team.
- Frontend Phase 3 (DAT export, lookup/search, blast modal, anomaly
  detection) — unrelated, separate scope, ported from the original tool.

## UI

**Tab switcher** in `MainToolPage`'s header area: "Loads" (existing,
default-selected — preserves all current behavior/tests unchanged) and
"Inquiries" (new).

**Inquiries tab**, top to bottom:
- `GmailConnectionPanel` — fetches `GET /api/gmail/status` on mount. If
  not connected: a "Connect Gmail" button that navigates the browser (full
  page load, not a fetch — `GET /api/gmail/connect` is a 302 redirect to
  Google) to `{API_URL}/api/gmail/connect`. If connected: shows the
  connected address and a "Disconnect" button (`POST
  /api/gmail/disconnect`), with a confirm-before-disconnect step since it's
  a destructive-ish action (stops replies going out until reconnected).
- `ReviewQueue` — fetches `GET /api/inquiries?reply_status=pending_review`.
  Each row: from address, subject, an editable `<textarea>` pre-filled with
  `reply_body`, a **Send** button (`POST /api/inquiries/:id/send` with the
  current textarea content as `{body}`) and a **Reject** button (`POST
  /api/inquiries/:id/reject`). A sent/rejected row disappears from the list
  after its action succeeds (removed from local state, not a full refetch,
  for responsiveness — matches no existing precedent either way, simplest
  correct choice).
- `InquiriesLog` — fetches `GET /api/inquiries` (unfiltered), renders a
  compact table: received time, from, subject, match tier, reply status
  (as a colored badge). Read-only.

All three panels independently loading/error-state themselves (`'loading'
| 'ready' | 'error'`), matching `LoadsTable`'s existing pattern — one
panel's fetch failure doesn't block the others from rendering.

## Testing approach

Same as every existing frontend component: Vitest + React Testing Library,
API modules mocked with `vi.mock`, `waitFor`/`fireEvent` for async
interactions, `role="alert"` for error states — matching `LoadsTable.jsx`,
`RateModal.jsx`, `UploadPanel.jsx`'s existing test suites exactly.
