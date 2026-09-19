# Broker Tool Overhaul — Roadmap & Scope

Date: 2026-09-20
Status: Scope locked, decomposed into 8 sub-projects. Sub-project 1 specced
separately; 2–8 to be specced as each is reached.

## Background

After a week of real daily use, the app does what it was built to do but
isn't yet worth reaching for. A full read of the source (10,515 lines,
every backend and frontend file) produced 100 findings, published as a
teardown document. The user selected 64 of them; seven further items were
folded in as dependencies of picked work, and one (G1) was added.

**The root diagnosis:** the app has no model of time and no model of a
truck. `carrier_lane_history` stores a single `ran_at` date and nothing
else temporal, so nothing can know a truck is mid-load.
`equipmentMismatch` is computed in `carrierMatching.js` and then discarded
as a UI badge, so nothing can know a box truck can't take 44,000 lbs.
Both of the user's original complaints, and a large share of the findings,
descend from those two gaps.

## Scope decisions

Four decisions were taken before decomposition. They apply across every
sub-project.

**The AI layer is deferred, not cancelled.** All 14 AI items were dropped
from this round deliberately: a model sitting on top of a matching engine
that suggests committed trucks produces confident wrong answers faster.
The foundation gets built first. Two consequences bind every sub-project:

- E1 (replacing the substring email matcher) is built as a rules-based
  extractor — a US city gazetteer with state disambiguation, reference
  number patterns, and confidence scoring — behind an interface a
  model-backed implementation can later satisfy without a rework.
- M12 (truck availability) is built as manual entry, with the record
  shape it would need if an extractor were populating it automatically.

**The organization layer (P2) is deferred but designed for.** Teams,
permissions and the shared carrier database are not built in this round.
But **every new table created in any sub-project carries an `org_id`
column from the day it is created**, nullable, with all existing rows
belonging to a single implicit organization. This buys the expensive half
of the eventual retrofit at no cost now. No sub-project may add a table
without it.

**M3 is out, B27 is in.** Weight becomes a real numeric column (B27), used
for display, filtering and upload-time sanity checks. Carrier weight
capability and weight-based exclusion (M3) waits — it becomes a small
addition later precisely because B27 landed first.

**G1 is in, the rest of the fraud section is out.** M22 (FMCSA authority
and insurance) and E3 (linking email senders to carrier records) are both
in scope, and together they are most of what G1 needs. G1 cross-checks a
claimed MC against the sending domain and FMCSA's registered contact, and
blocks before a rate confirmation on mismatch.

## Standing rules

These apply to every sub-project and are not restated in each spec.

1. **Every new table gets `org_id`.** See above.
2. **Nothing is dropped silently.** Where the current code discards data
   without a trace — filtered emails (B13), skipped CSV rows (B7),
   unparseable dates (B6) — the replacement records what was discarded and
   why, and surfaces it. A thing that leaves no record cannot be debugged.
3. **Schema changes go through versioned migrations** once P1 lands at the
   head of sub-project 2. No new conditional-ALTER blocks in
   `scripts/setup-db.js` after that point.
4. **Times are stored UTC** once B28 lands, with conversion at the edges
   only.
5. **Existing test discipline continues.** The repo has 103 test files and
   a TDD history; every sub-project follows it.

## Sub-projects

Ordered by dependency. Each is independently shippable and leaves the app
better than it found it.

### 1 — Queue clarity and input integrity · ~3 days

`F1 F2 F3 F4 F5 B20 B21 B23 B24 B25`

The user's five reported items, plus the defects sitting in the same
files. One small schema change (widening the `match_tier` ENUM to record a
human-chosen match), applied in the existing `scripts/setup-db.js`
conditional style — the last change made that way before P1 lands.

The centrepiece is B23/B24: the review queue currently renders a draft
reply showing a sender address and a subject line, but never the email
being answered nor the load that was matched. `body_snippet` is stored and
never displayed. Making both visible, plus B25 (re-assign a wrong match),
is the largest daily improvement available for the effort.

### 2 — Inbox correctness · ~1 week

`P1 B1 B2 B3 B4 B5 B6 B8 B9 B11 B12 B13 B14 B15 B16 B17 B18 P9`

Silent data loss, everywhere it occurs. P1 (versioned migrations) leads,
because this is the first sub-project that changes schema.

The two that matter most: B1 — `extractPlainTextBody` returns an empty
string for HTML-only email, so a large share of inbound mail is matched on
its subject line alone; and B2 — quoted reply text is never stripped, so a
carrier replying to an old blast is matched against the load quoted
beneath their question. Together these are most of the app's current
matching error, and both are invisible because the inquiry still appears
and still looks matched.

### 3 — Data foundation · ~1 week

`B7 B19 B22 B26 B27 B28 P10`

The groundwork the matching engine needs: load coordinates actually
persisted (B22, which also resolves most of B19), carrier records
de-duplicated with a merge tool for existing splits (B26), weight as a
number (B27), a timezone contract (B28), and a real CSV import flow with
preview, column mapping and per-row error reporting (P10, subsuming B7).

B26 matters more than its size suggests: duplicate carrier records split
lane history, and sub-project 4 weights by frequency and sub-project 5
learns from outcomes. Both train on corrupted counts if duplicates remain.

### 4 — Matching engine · ~2 weeks

`M1 M2 M4 M5 M6 M7 M8 M9 M10 M11 M20`

The phase that earns trust. Time and capability become real (M1, M2),
backhaul and corridor matching arrive (M4, M5), and the three coarse tiers
become one explained 0–100 score (M11).

M1 is the answer to the user's first complaint: from a carrier's last
known delivery point and time, compute road drive time to the new pickup
and decide whether they can make `late_pu`. Committed carriers move to a
collapsed section rather than disappearing — sometimes the right move is
to ask about their next truck.

M2 is the answer to the second: an asymmetric equipment compatibility
matrix (reefer satisfies van, step deck satisfies flatbed, box truck
satisfies only box truck) replacing string equality, applied as an
exclusion rather than a badge.

### 5 — Capacity and the call surface · ~2 weeks

`M12 M14 M15 M17 M18 M19 M21`

M12 (the truck availability board) and M19 (a ranked call sheet replacing
the map as the primary surface) are the two that change how the app is
used day to day. M21 adds reliability history; M17 and M18 let the score
move down as well as up, and calibrate against real outcomes.

M14 and M15 (round-trip pairing and continuous-move chains) are the
hardest items in the whole roadmap and the most likely to overrun. They
are sequenced last within this sub-project so the rest ships regardless.

### 6 — Carrier identity and inbox intelligence · ~1.5 weeks

`M22 G1 E1 E3 E7 E12 E13`

FMCSA authority and insurance (M22), sender-to-carrier linking (E3), and
the MC/domain fraud check those two enable (G1). E1 replaces substring
matching with real extraction; E13 replaces polling with Gmail push; E12
allows more than one inbox — which requires B15 from sub-project 2, since
inboxes are currently polled strictly in series.

### 7 — App surface · ~2 weeks

`N1 N7 N9 N12 N13 N14 N15 N16`

N1 (a real load detail page) is the keystone — almost everything built in
sub-projects 4–6 currently has nowhere to live except a modal over a
table. N9 adds a customer dimension, which is what finally makes N16's
profitability reporting possible. N13 adds soft delete with undo and a
change log.

### 8 — Platform · ~2 weeks

`P2 P3 P4 P5 P6`

P2 in full (teams, permissions, shared carrier database) on top of the
`org_id` columns every prior sub-project will have been writing. Plus
encrypted Gmail refresh tokens (P3), CSRF/rate limiting/security headers
(P4), structured logging with error tracking (P5), and a real job queue
with retry and a dead-letter view (P6).

## Timeline

Roughly 10–12 weeks of focused work for all eight. M14/M15 in sub-project
5 are the main overrun risk.

Sub-projects 1–3 are pure correctness and ship in about three weeks
combined; the app stops losing data and stops lying about what it has.
Sub-project 4 is where it starts being genuinely useful.

## Out of scope for this round

Recorded so the reasoning isn't lost:

- **All 14 AI items.** Deferred by decision, seams reserved. Highest-value
  when revisited: AI1 (structured inquiry understanding), AI2 (truck
  availability extracted from email — the item that would make M12's board
  populate itself), AI3 (replies that answer the question asked).
- **Fraud scoring beyond G1** (G2–G7).
- **M3** (weight capability), **M13** (rate tolerance profile), **M16**
  (inquiries as matching signal), **M23** (day-of-week patterns).
- **Outbound email** — E2, E4, E5, E6, E8, E9, E10, E11, E14. Notably E8
  (re-pitching a carrier when their load is already covered) and E14 (an
  offer log) were assessed as high-return and remain available.
- **N2** (command palette), **N3** (rate confirmations), **N4** (carrier
  onboarding), **N5** (check calls), **N6** (margin guardrails), **N8**
  (auto-escalation), **N10** (load claiming), **N11** (carrier portal).
- **B10** (Google/password account linking), **P7** (the AI reliability
  contract — irrelevant until AI returns), **P8** (backups and a rehearsed
  restore).

The full teardown with all 100 findings, each carrying a plain-English
explanation and an impact assessment, is the source document for this
roadmap.
