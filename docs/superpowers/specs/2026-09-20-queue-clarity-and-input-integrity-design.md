# Queue Clarity & Input Integrity — Design Spec

Date: 2026-09-20
Status: Approved for planning (sub-project 1 of 8 — see
`2026-09-20-broker-tool-roadmap.md`)

## Background

The first sub-project of the broker tool overhaul. It covers the five
items the user reported directly, plus five defects found in the same
files during the source read.

Two themes, hence the name:

**Queue clarity.** The review queue renders a draft reply above a Send
button while showing neither the email being answered nor the load that
was matched. `email_inquiries.body_snippet` is stored on every inquiry and
never displayed anywhere in the app. The user is approving outbound mail
on the basis of a sender address and a subject line. When the match is
wrong — which it frequently is, for reasons fixed in sub-project 2 — the
only available actions are to send it anyway or discard the inquiry
entirely.

**Input integrity.** Every place in the app that accepts a US state accepts
arbitrary text. A typo produces a `carrier_lane_history` or `loads` row
that never geocodes, therefore never matches anything, and looks
completely normal in every list. Nothing reports it, at any point. This is
the root cause of the user's first reported item (F1) and recurs in four
other components.

## Scope

`F1 F2 F3 F4 F5 B20 B21 B23 B24 B25`

One schema change (an ENUM widening), applied in the existing
`scripts/setup-db.js` conditional style. Versioned migrations (P1) land at
the head of sub-project 2; this is the last change made the old way.

## Architecture

Four new shared pieces, each replacing a pattern currently duplicated or
absent across several components.

**`StateSelect`** — a constrained combobox for US state codes, following
the same structure as the existing `EquipmentPicker` (typeable input,
filtered dropdown, `onMouseDown` preventDefault to dodge the blur race).
Accepts typing for speed, uppercases as you go, filters on both code and
full state name, and validates on blur. An invalid value marks the field
and blocks save rather than silently persisting. `US_STATES` already
exists in `lib/usStates.js` and is currently only used for parsing, never
for input — this gives it the second job.

Replaces raw `<input>` state fields in `AddLoadModal`, `RateModal`,
`CarrierSheet` (lane draft), `CarrierMapPage` (lane search), and
`ExtraStopsEditor`.

**`useDirtyGuard`** — takes a snapshot of form values on mount, exposes
`isDirty` and a `requestClose` that intercepts a close attempt when dirty.
Confirmation is inline — the footer swaps to *"Discard changes?
[Discard] [Keep editing]"* — matching the existing inline confirm/cancel
pattern used for row deletes in `LoadsTable`, rather than a browser
`confirm()`. Intercepts the Cancel button, the backdrop click, and Escape.

Applied to `CarrierSheet`, `RateModal`, `AddLoadModal` and `BlastModal`.
`CarrierSheet` has two independent dirty scopes — the carrier fields and
an open lane draft — and is dirty if either is.

**`RelativeTime`** — renders a live-ticking relative age with a severity
ramp. One module-level ticker shared by every mounted instance, firing
every 30 seconds; not one interval per row, which would not survive a busy
inquiry log.

| Age | Treatment |
|---|---|
| under 15 min | muted |
| 15–30 min | normal text |
| 30–60 min | amber |
| over 60 min | red |

**`LoadPicker`** — a searchable dropdown over the current user's active
loads, matching on load number, origin and destination. Used by B25 to
re-assign an inquiry, and by F4 to resolve a load number on the lane form.

## Data model

One change:

```
email_inquiries.match_tier
  ENUM('load_number','city_state','city','state','none')
  → ENUM('load_number','city_state','city','state','manual','none')
```

`manual` records that a human chose this load, which must be
distinguishable from every heuristic tier: it is the only tier that is
known-correct, and sub-project 5's outcome calibration (M18) will treat
these as labelled ground truth.

No other schema changes. `carrier_lane_history.load_id` already exists and
is populated by the booking flow — F4 simply starts populating it from the
manual path too.

## API surface

Two additions, one modification. All under `requireAuth`, scoped to the
session user.

**`GET /api/loads/lookup?load_number=…`** — returns the matching load or
`null`. Must be registered before `GET /:id` so `lookup` isn't parsed as
an id, exactly as `GET /api/carriers/lookup` and `GET /api/loads/stats`
already are.

**`PATCH /api/inquiries/:id/match`** — body `{ matched_load_id }`. Sets
the matched load, sets `match_tier` to `manual`, sets `status` to
`matched`, and emits `inquiry:updated`. Accepts `null` to detach. Rejects
an inquiry that is not `pending_review`, and a load the user doesn't own.

`reply_body` is deliberately **not** rewritten. `live_reply_body` is
recomposed from the joined load on every read (see
`lib/inquiryQueries.js`), so a re-assignment produces a correct draft
automatically — the same mechanism that already keeps drafts fresh when a
load is edited after an inquiry arrives.

**`INQUIRY_JOIN_FIELDS`** gains `l.load_number` and `l.equipment`, aliased
as `matched_load_load_number` and `matched_load_equipment`. Query-only; no
schema impact. B24 needs both and neither is currently joined.

## UI changes

### Review queue (B23, B24, B25, F5)

Each card gains three things above the existing draft textarea:

1. **A load header** — load number, lane, pickup window, equipment, target
   pay, and the match tier that produced it. Rendered as a distinct
   strip, not more body text, so it reads as *what the app decided*
   rather than *what the carrier wrote*.
2. **The carrier's message** — `body_snippet`, in a bordered block
   visually separated from the reply draft. It is capped at 500
   characters at write time and will contain quoted reply text until B2
   lands in sub-project 2; both are noted in the UI when the snippet is
   at its cap.
3. **A re-assign control** — opens `LoadPicker`. On selection, calls the
   new PATCH, then **resets that inquiry's entry in the `drafts` state
   map** from the returned `live_reply_body`. Without that reset the card
   would show the previous load's draft against the new load's header,
   which is a worse failure than the one being fixed.

The queue's sort order changes from newest-first to **oldest-first**. It
is a work queue, and the oldest item is the most urgent; the inquiry log
keeps newest-first, because it is a log.

### Lane form, `CarrierSheet` (F1, F3, F4)

City fields become `CityStateAutocomplete` (already used in `AddLoadModal`
and `CarrierMapPage`, never wired here), which fills the paired state on
selection. State fields become `StateSelect`.

The saved-lane list item gets its missing `text-text` class (F3). The
omission renders correctly in light mode and invisibly in dark, which is
why it reads as a save failure and prompts a re-add.

A **load number** field is added at the top of the lane draft. Entering a
number resolves it via the new lookup route and fills origin, destination,
rate and date, following the same "don't fight what they typed" rule
`BookingCarrierFields` already applies to its MC lookup — only blank
fields are filled, and lookup state is reported inline (*checking…* /
*found* / *no match*). The field stays optional: lanes predating the app
have no load to point at.

### Blast and lookup message (B20)

`buildLookupMessage` guards every interpolation, and `BlastModal` refuses
to open for a load with no origin or destination, showing what's missing
instead. Today a quick-added load produces a body reading
`PU: undefined, undefined` and a subject containing `undefined undefined`,
ready to send to the whole list.

## Testing

Follows the repo's existing TDD discipline. Notable cases:

- `StateSelect` rejects `Texs`, accepts `tx`, normalizes to `TX`.
- `useDirtyGuard` does not prompt when a field is edited and restored.
- `RelativeTime` crosses each severity boundary; one ticker regardless of
  instance count.
- Re-assigning an inquiry resets its draft, not just its header.
- `PATCH /api/inquiries/:id/match` rejects another user's load id.
- `GET /api/loads/lookup` is not shadowed by `GET /:id`.
- `buildLookupMessage` on a load with only a load number produces no
  literal `undefined`.

## Out of scope

- **Quoted-text stripping (B2)** and **HTML body extraction (B1)** —
  sub-project 2. Until then the review queue displays whatever
  `body_snippet` holds, including quoted history.
- **Widening `body_snippet`** beyond 500 characters. Revisit in
  sub-project 2 once quote stripping makes the stored text worth more.
- **Carrier-side state validation for `operating_states`** — already
  filtered against `US_STATES` by `parseStates` in `CarrierSheet`, which
  silently drops invalid codes rather than reporting them. Made visible in
  sub-project 3 alongside the other silent-discard fixes.
