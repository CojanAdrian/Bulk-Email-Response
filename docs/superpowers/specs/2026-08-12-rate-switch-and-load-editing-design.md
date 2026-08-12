# Per-Load Rate Switch, Manual Load Entry & Structured Stops — Design Spec

Date: 2026-08-12
Status: Approved for planning

## Background

Two gaps in the loads workflow:

1. Whether a load's `Rate:` line goes out in an auto-reply is currently an
   all-or-nothing function of whether `target_pay` is set — there's no way
   to keep the rate on file but stop quoting it, short of deleting the
   number. The DAT CSV export has its own separate, session-only rate
   choice (`ContactMethodModal` + `RateSelectionModal`) that has to be
   re-decided on every export.
2. The only way to get a load into the system is a full CSV upload — adding
   or fixing one load means either re-uploading a whole file or, for
   details like pickup/delivery dates and multi-stop info, there's no edit
   path at all today (`RateModal` doesn't expose dates, and multi-stop
   info can only be added as an opaque free-text override).

This spec covers three connected changes: a persistent per-load rate
switch, a manual add/edit path covering every field a CSV row carries, and
structured extra-stop entry that flows automatically into replies.

## Data model

Two new columns on `loads`:

| Column | Type | Notes |
|---|---|---|
| `include_rate` | `TINYINT(1) NOT NULL DEFAULT 1` | Whether the auto-composed reply includes the `Rate:` line. Never affects `target_pay` itself — turning it off hides the number from output, it doesn't clear it. |
| `extra_stops` | `JSON NULL` | Ordered list of additional pickup/delivery stops beyond the load's primary origin/destination. Each entry: `{ type: 'pickup'|'delivery', city, state, datetime }`. `null`/`[]` means no extra stops. |

Both are added the same way every other column has been added to this
table: an `ALTER TABLE ... ADD COLUMN` guarded by an
`information_schema.COLUMNS` check in `migrateSchema()`
(`backend/scripts/setup-db.js`), plus the column in `schema.sql` for fresh
installs. Neither column is part of `LOAD_COLUMNS` (the CSV-upload column
list) — a CSV re-upload never touches either, same as `status` and
`custom_reply_body` today.

## Rate switch

**Reply composer** (`backend/src/lib/replyComposer.js`): the `Rate:` line
is now gated on `load.include_rate` as well as `target_pay` being present.
Custom-reply-body loads are unaffected either way — a custom reply already
fully controls its own output regardless of any switch.

**Loads board** (`LoadsTable.jsx`): each row gets a toggle next to Target
Pay, PATCHing `include_rate` immediately on flip (same pattern as the
existing per-row status `<select>`). The existing multi-select toolbar
(individual checkboxes + "select all" in the header, both already built)
gains a second bulk-action control alongside "Mark as...": a "Rate..."
`<select>` with "Include rate" / "Exclude rate", posting to a new
`POST /api/loads/bulk-include-rate { ids, includeRate }` endpoint —
mirrors `POST /api/loads/bulk-status` exactly (ownership-scoped, 400 on
missing/empty `ids`, emits `load:changed`).

**Review Queue** (`ReviewQueue.jsx`): a pending reply whose matched load
has a non-null `target_pay` gets a checkbox, "Include rate in this reply,"
defaulted to the load's current `include_rate`. Toggling it edits only the
in-progress draft text in `drafts[id]` (adds/strips the `Rate: $X` line via
a small client-side helper) — it does **not** PATCH the load. This is a
one-time override for that single send, confirmed explicitly: the persistent
switch on the board is the only thing that changes future behavior.

**DAT export**: the old per-export "include rate for all / choose per load
/ none" question is removed — `ContactMethodModal` drops its "DAT
Loadboard Rate" fieldset, `RateSelectionModal` and the `rateSelection` step
in `DatExportSection` are deleted, and `processLoadsForExport` reads
`Boolean(load.include_rate)` directly instead of the `rateChoice`/
`rateOverrides` options. Clicking "Generate DAT Export" now goes straight
from the (rate-question-free) contact-method popup to a downloaded CSV
reflecting each load's current switch — re-downloadable anytime after
tweaking switches on the board, no re-picking required.

## Manual load entry

**New "+ Add Load" popup** (`AddLoadModal.jsx`), opened from a button next
to the CSV upload panel on the Loads tab. Every field a CSV row can carry
is an input: load #, origin city/state/zip, dest city/state/zip, equipment,
weight, target pay, early/late pickup date-time, late delivery date-time,
stop count, commodity, temperature, comment, status, plus the rate switch
(defaults on) and the extra-stops editor (below). **Load # is the only
required field** — it's the unique key the matching engine and re-uploads
key off of; everything else, including target pay and comment, can be left
blank and filled in later.

Submits to a new `POST /api/loads` (single-load create): validates
`load_number` is present and non-blank, inserts scoped to
`req.session.userId`, returns the created row, emits `load:changed`. A
duplicate `load_number` for the same user (the existing
`uniq_user_load_number` constraint) returns 409 with a clear error — same
uniqueness rule uploads already follow, just surfaced synchronously instead
of silently upserting.

**Edit popup** (`RateModal.jsx`) gets parity: adds the early/late pickup
and late-delivery date-time fields (not editable today — the only way to
set them has been CSV upload) and the extra-stops editor, so any load,
uploaded or manually added, can be fully completed or corrected after the
fact. `load_number` remains non-editable, unchanged from today.

## Structured extra stops

A shared `ExtraStopsEditor` component used by both `AddLoadModal` and
`RateModal`: a list of stop rows (type: pickup/delivery, city, state, and a
date-time — no zip, per what was confirmed), a "Remove" button per row, and
an "Add a stop" button that
appends a blank row. Backed by the `extra_stops` JSON column — read back
already parsed (mysql2 parses JSON columns on read), written via
`JSON.stringify()` in the loads route before the query (JSON columns are
not auto-serialized on write).

**Reply composition**: `composeReply` inserts extra stops in sequence,
matching the ordering convention already established in this codebase
(see the existing `custom_reply_body` test fixture
`"PU: DALLAS, TX\n2nd PU: FORT WORTH, TX\nDEL: CHICAGO, IL\nRate: $1,500"`):
extra pickups are listed right after the primary `PU:` line (in entry
order, labeled `2nd PU:`, `3rd PU:`, ...), extra deliveries right after the
primary `DEL:` line (`2nd DEL:`, `3rd DEL:`, ...), then `Weight:` and
`Rate:` as today. A load with extra stops but no custom reply body now
gets this fuller auto-composed reply automatically — no free-text override
needed for the common multi-stop case (the override is still available for
anything structured fields can't express).

## The multi-stop tag

`detectMultiStop()` (`frontend/src/lib/lookupMessage.js`) already flags a
load from its comment text/stop count; it's currently only surfaced in
`ReviewQueue` as a red warning badge. This extends to the loads board and
adds a resolved state:

| Condition | Tag |
|---|---|
| `detectMultiStop(load)` truthy, `extra_stops` empty | Red — "needs stops added" |
| `extra_stops` has at least one entry | Blue — "stops added" (regardless of whether `detectMultiStop` would also trigger; once real stops exist, that's the definitive state) |
| Neither | No tag |

`LoadsTable.jsx` renders this next to the existing "Modified" badge
(`custom_reply_body`-based, unrelated and unchanged). `ReviewQueue.jsx`'s
existing red "add extra stops manually" badge is updated to the same
red/blue logic using the matched load's `extra_stops` (added to the
existing `l.stops`/`l.comment` join in `GET /api/inquiries`) — so a
pending reply for a load that already has structured stops no longer
shows a stale warning.

`Badge.jsx` gains an `info` variant (blue) alongside the existing
`default`/`success`/`error`/`warning`, backed by new `--color-info`/
`--color-info-bg` tokens in `tokens.css` and the matching
`tailwind.config.js` color entries — same pattern as every existing badge
color.

## Out of scope

- Editing `load_number` after creation (unchanged — still the
  upload/matching key, deliberately locked)
- Any change to the matching engine's confidence tiers or auto-send policy
- Per-user default for the rate switch (new loads always default to on,
  for everyone)
- Reordering existing extra stops via drag-and-drop (remove and re-add in
  the right order if the sequence needs to change)

## Testing approach

- `replyComposer.test.js`: extend with `include_rate` true/false cases
  (rate present but switch off; rate absent; both) and `extra_stops`
  cases (pickup-only, delivery-only, multiple of each, empty/null),
  following the existing field-present/field-null branch coverage style.
- `loads.test.js`: new tests for `POST /api/loads` (create, duplicate
  `load_number` conflict, ownership scoping), `POST /api/loads/bulk-include-rate`
  (mirrors the existing `bulk-status` test block), and PATCH accepting
  `include_rate`/`extra_stops`/the new date fields.
- `inquiries.test.js`: `GET /api/inquiries` returns the matched load's
  `extra_stops` in the join.
- Frontend: no existing frontend test suite beyond backend Jest tests
  (confirmed by the file listing — `frontend/` has no `tests/` directory);
  manual verification via the running app per this project's usual
  practice, covering: toggling the board switch and confirming a
  subsequent preview-reply reflects it, adding a load through the new
  popup end-to-end, adding extra stops and confirming they appear in the
  composed reply, and the red→blue tag transition.
