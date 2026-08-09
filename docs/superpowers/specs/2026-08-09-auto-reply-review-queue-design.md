# Auto-Send Replies & Review Queue — Design Spec

Date: 2026-08-09
Status: Approved for planning (sub-project 3 of 4 in the email auto-reply roadmap)

## Background

Sub-project 2 (email integration + matching engine) is done: each user can
connect their own Gmail inbox, a poller checks it every 2 minutes, and every
inquiry is matched against that user's own loads and logged to
`email_inquiries` with a `match_tier` and `status` (`matched`/`needs_review`).
Nothing is sent back to the carrier yet — this sub-project adds that.

The auto-send/queue split was decided at the very start of this project's
planning: **auto-send confident matches, queue the rest for a human.** This
spec defines exactly what "confident" means, what the auto-reply says, and
what the review queue lets a user do with everything else.

## Confidence policy

Only an exact **load number** match (`match_tier = 'load_number'`) is
confident enough to auto-send without a human looking at it — the carrier
gave a unique, unambiguous identifier, so there's no risk of replying about
the wrong load. Every other outcome is queued for review:

| `match_tier` | Outcome |
|---|---|
| `load_number` | Auto-send immediately |
| `city_state`, `city`, `state` | Queued — matched to a load, but ambiguous enough (multiple candidate loads existed, tie-broken by heuristics) that a human should confirm before a reply goes out |
| `none` | Queued — no load matched at all; a human decides how (or whether) to respond |

This mirrors how the matching engine already reports its own confidence —
no new scoring logic is needed, just a policy on top of the existing tiers.

## Reply content

A fixed, simple template — no AI generation (consistent with the
rule-based-only approach decided for matching; template-based replies avoid
the same "what if it says something wrong" risk for the auto-send path):

```
Hi,

Yes, load #{load_number} is still available:

  {origin_city}, {origin_state} -> {dest_city}, {dest_state}
  Pickup: {early_pu}
  Rate: {target_pay}

Let me know if you'd like to book it.
```

Fields that are `null` on the load (e.g. no `target_pay` set yet) are
omitted from their line entirely, not rendered as `"null"` or `"$null"`.
Replies are sent as an actual Gmail reply (same thread, `In-Reply-To`/
`References` headers set, `Re:` subject) so it appears correctly threaded
in the carrier's inbox — not a disconnected new email.

## Data model

Extend `email_inquiries` with reply tracking (no new table — a reply is a
property of an inquiry, one-to-one):

| Column | Notes |
|---|---|
| `reply_status` | `none` (default — `status = 'needs_review'` inquiries with no load match get no reply at all until a human acts) \| `pending_review` \| `auto_sent` \| `sent` (human-approved and sent) \| `rejected` (human dismissed, no reply sent) |
| `reply_body` | the composed reply text (rendered at match time for `pending_review`/`auto_sent`, so a reviewer sees exactly what would be/was sent; editable before a `pending_review` reply is sent) |
| `reply_sent_at` | when a reply was actually sent (`auto_sent` or `sent`), null otherwise |

## Behavior

**At poll time** (extends the existing poller from sub-project 2): after
`matchInquiry` runs, if a load matched at all, compose the reply body from
the matched load's fields immediately (regardless of tier) and store it in
`reply_body`. If `match_tier = 'load_number'`, send it right away via the
Gmail API and set `reply_status = 'auto_sent'`, `reply_sent_at = NOW()`. For
every other matched tier, set `reply_status = 'pending_review'` and stop —
the composed reply is ready, but waits for a human. Unmatched inquiries
(`match_tier = 'none'`) get no composed reply and `reply_status` stays
`none`.

**Review queue** (new API surface, no UI yet — same "endpoint now, dashboard
UI later" pattern sub-project 2 used for `GET /api/inquiries`, since
sub-project 4 is the actual dashboard):

- `GET /api/inquiries?reply_status=pending_review` — the existing list
  endpoint gains an optional filter (reuses the query param style already
  used by `GET /api/loads?status=...`).
- `POST /api/inquiries/:id/send` — sends `reply_body` (or a body edited by
  the caller and passed in the request, overriding the stored draft) via
  Gmail, sets `reply_status = 'sent'`, `reply_sent_at = NOW()`. Only valid
  from `pending_review`.
- `POST /api/inquiries/:id/reject` — sets `reply_status = 'rejected'`. No
  email sent. Only valid from `pending_review`.

Both actions are ownership-scoped like every other route in this backend
(`req.session.userId`, 404 if the inquiry belongs to someone else or
doesn't exist) and only operate on the caller's own connected Gmail
account's refresh token.

## Out of scope (this sub-project)

- Any UI for the review queue (sub-project 4 — the dashboard)
- AI-generated or customizable reply templates (fixed template only, as
  decided)
- Editing the auto-send confidence policy per-user (it's global: load
  number only, for everyone)
- Retrying a failed send automatically (a send failure just leaves
  `reply_status` unchanged and logs the error — same resilience pattern as
  the poller's per-account try/catch from sub-project 2)

## Testing approach

`composeReply` (the template-rendering function) is a pure function, tested
the same branch-by-branch way as `matchingEngine.js` — every field-present/
field-null combination. Gmail's send call is mocked at the same
`gmailClient.js` boundary already established in sub-project 2 (a new
`sendReply` export, mocked in tests exactly like `listNewMessageIds`/
`getMessage` are).
