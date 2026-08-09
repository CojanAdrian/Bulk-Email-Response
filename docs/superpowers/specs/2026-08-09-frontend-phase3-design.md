# Frontend Phase 3 — DAT Export, Lookup, Blast, Anomaly Detection

Date: 2026-08-09
Status: Approved for planning (final piece of the original full-rewrite scope, deferred since the 2026-08-04 backend foundation spec)

## Background

The original single-file tool (`IGT_DAT_Processor.html`, 1888 lines) did five
things in one pass over a freshly-uploaded McLeod CSV: (1) parsed/mapped
columns into normalized load rows — **already ported** to
`frontend/src/lib/mcleodParser.js` in an earlier phase; (2) ran anomaly
detection and cross-post expansion over those rows; (3) built a DAT-formatted
CSV for bulk upload to DAT's loadboard; (4) a load lookup/search panel that
generates a copy-pasteable "email-ready" load description; (5) a "blast"
modal that sends that same description to a list of carrier emails via a
Gmail compose link.

This spec covers porting (2)-(5). It's read directly from the original
file's logic (`runPipeline`, `detectCrossPosts`, `buildDatRow`,
`computeLength`, `buildComment`, `renderAnomalyReport`, `buildLookupMessage`,
`runLookupSearch`, the blast-modal IIFE) — every rule below is transcribed
from working code, not reconstructed from memory.

## Architectural decision: operates on persisted loads, not a fresh CSV

The original tool ran its whole pipeline once, synchronously, on the CSV
just parsed in-browser — there was no persistence. This app now persists
loads in MySQL (Phase 2), and CSV upload is an **upsert**, not a one-shot
snapshot. Anomaly detection, cross-post expansion, and dedup are pure
functions of a *set of load rows* — nothing about them requires "freshly
uploaded" specifically. So: **DAT export in this app runs the same pipeline
against the user's current `active` loads (`GET /api/loads?status=active`,
already fetched for the Loads tab), not a new CSV upload.** A "Generate DAT
Export" action on the Loads tab triggers it. This is a deliberate,
reasoned deviation from the original's exact flow (upload → immediately
export) in favor of what the new architecture actually supports (loads
persist across sessions, so export should work on demand, not only
immediately post-upload) — flagging it explicitly since it's a real
behavior change, not just a UI reskin.

Consequence: the whole pipeline (cross-post detection, dedup, rate/contact
prompts, `buildDatRow`) runs **client-side**, in a new pure-function module
alongside `mcleodParser.js` — no backend changes needed. It's a derived
report + a client-generated CSV download, not data that needs to be
stored.

One gap this creates: `loads.comment` in the DB currently stores the *raw*
McLeod planning comment untouched (`mcleodParser.js`'s `mapRowToLoad` just
does `comment: rawComment`) — the original tool's `buildComment` (drop-trailer
detection + appending a contact line) ran at export time, not parse time, so
this still works: the export pipeline reads `load.comment` as the *raw*
comment (renaming the DB column's semantic meaning slightly — it was always
"the raw planning comment," never mutated since Phase 2 didn't call
`buildComment`) and derives the DAT comment same as the original tool did.

## Second deviation: the blast modal becomes a real button, not a Konami code

The original tool's blast modal was only reachable via a hidden
`↑↑↓↓←→←→BA` keyboard sequence (an Easter egg, not a discoverable feature —
see the `KONAMI` array in the source). That made sense for a single
scrappy internal HTML file; it doesn't make sense for a real product
surface with proper navigation. **The blast modal opens from a visible
"Blast email" button** next to the load lookup panel's detail view (enabled
once a load is selected, same precondition the original enforced — `if
(!_lookupActiveRow) return`). No keyboard easter egg is ported.

## Scope: what's ported, faithfully, rule-for-rule

**Pre-export modal** (`showContactModal` in the original): before running
the pipeline, ask three questions, exactly as the original did:
1. DAT contact method: phone or email (`GLOBAL_CONTACT_METHOD`).
2. Whether to append a contact line to the DAT Comment field, and if so,
   what text (`GLOBAL_COMMENT_CONTACT`) — a free-text field, default empty/none.
3. Rate handling on the DAT Loadboard Rate column: include for **all**
   loads, **some** (pick per-row in a follow-up table), or **none**
   (`GLOBAL_RATE_CHOICE`).

**Pipeline** (`runPipeline`/`detectCrossPosts`/dedup, faithfully transcribed):
- Skip (exclude, don't error) any load with blank equipment.
- Flag (but still include) same-city loads (`origin_city === dest_city`,
  case-insensitive) as "same city" anomalies — round-trip/dedicated lanes.
- Equipment already mapped via `EQUIPMENT_MAP` at parse time
  (`mcleodParser.js`) — no remapping needed here, but flag any load whose
  stored `equipment` isn't a value that appears in `EQUIPMENT_MAP` as
  "unknown equipment" (best-effort re-check, since the map could have
  changed or the value could be raw passthrough from an unrecognized code).
- Rate anomalies: `target_pay > 10000` ("exceeds $10,000 — verify for
  misplaced decimal") or `target_pay === 0` ("zero-rate load").
- City override: if the raw comment matches
  `/post\s+as\s+([a-z .'-]+?),\s*([a-z]{2})\s+to\s+([a-z .'-]+?),\s*([a-z]{2})/i`,
  substitute the parsed cities/states for export (title-cased). Separately,
  if the comment matches `/don'?t\s*post\s*actual\s*cities/i`, flag it —
  this needs a human to manually substitute cities; the tool doesn't guess.
- Location flags: origin or destination state is a Canadian province
  (`AB,BC,MB,NB,NL,NS,NT,NU,ON,PE,QC,SK,YT`); or city/state is literally
  "Birmingham"/"MO" (a known historically-mistyped combination in this
  business's data) on either end.
- Comment building (`buildComment`): detect drop-trailer language in the
  raw comment (`24hr drop both sides` pattern > generic `drop trailer`/`hook
  and drop` pattern > nothing), producing a label prepended to the DAT
  comment; append the contact-line text from the pre-export modal if given.
- Cross-post detection (`detectCrossPosts`, regex-for-regex faithful,
  including the exact ambiguity/false-positive guards the original had —
  e.g. `FT` must be measurement-free AND either paired with CN/SD/RGN or
  comma-listed, else it's flagged as ambiguous instead of triggering; `R`
  cross-post is suppressed if "R off"/"reefer off" is mentioned, and a
  `V or R` / `V/R` phrasing is flagged for manual verification even though
  it still triggers the R cross-post): produces zero or more additional
  equipment codes to also post the same lane under. Each triggers a cloned
  export row with that equipment substituted (skip if identical to the
  original, mapped equipment) and a `crossPostFlags` anomaly entry.
- Dedup: group all rows (including cross-post clones) by
  `origin_city|dest_city|equipment|pickup_earliest` (case-insensitive).
  Within a group of 2+, keep the highest weight; ties broken by highest
  target pay; further ties broken by earliest load number
  (`orderCompare` — numeric-aware, so `"9"` sorts before `"10"`). Every
  dropped row logs a `dedupDecisions` anomaly with the reason.
- DAT row building (`buildDatRow`, all 24 `DAT_HEADERS` columns, exact
  column order): `Length (ft)` from `computeLength` (26 for
  SB/BR/BZ "straight box" equipment; else scan the raw comment for an
  explicit `NN ft/NN' + van/reefer/trailer/flatbed/vr/v/r` mention in the
  20-60 range; else 48 for flatbed/open-deck-family equipment
  `FT,F,SD,SP,RGN,RZ,RM,CN`, 53 otherwise). `Contact Method*` is always
  `"email"` for straight-box equipment regardless of the modal's choice,
  else whatever the modal chose. `DAT Loadboard Rate` only populated when
  `includeRate` is true for that row (from the rate-choice modal / per-row
  table) AND `target_pay > 0`. `Comment` is `"TEAM | " + comment` when the
  original raw equipment code was `POTM` (team loads), else just the
  built comment. `Reference ID` is the load number.
- CSV built with `Papa.unparse` (already a frontend dependency via
  `mcleodParser`'s CSV upload flow) using the exact `DAT_HEADERS` field
  order, downloaded as `DAT_Bulk_Upload_YYYY-MM-DD.csv` via a client-side
  Blob download (no backend endpoint — nothing to persist).

**Rate-selection follow-up table** (`showRateModal`, only when the
pre-export modal's rate choice is "some"): a checkbox-per-row table
(default all checked) with an editable numeric override per row, a
select-all checkbox, and click-to-sort columns (order #, cities, states) —
confirming proceeds to the CSV build using each row's checkbox state as
`includeRate` and the (possibly-edited) numeric value as the exported rate.

**Anomaly report**: one collapsible section per category (same-city,
blank-equipment-excluded, unknown-equipment, dedup-decisions,
rate-anomalies, cross-post-flags, city-override-flags,
ambiguous-cross-post, "V or R" flags, location-flags), each showing a
count and a table of the flagged loads — exactly the original's
`renderAnomalyReport`/`section()` structure, restyled to match this app's
dark theme (matching `LoadsTable`'s existing card/table conventions, not
the original's light theme). The original's one-off "known issue" banner
for a specific historical order number is **not ported** — it was a
one-time operational note about a single past incident, not a general
rule, and doesn't belong in reusable product code.

**Load lookup/search** (`runLookupSearch`/`renderLookupDetail`/
`buildLookupMessage`): a search box over the same active-loads set,
scored (not just filtered) by: order/load-number substring match (60),
exact origin-state match (50), origin-city substring match (35), exact
dest-state match (15), dest-city substring match (8) — summed, so an
order-number hit always outranks a city/state hit, and results are sorted
by score descending. Selecting a result renders an editable, copy-pastable
"email-ready" message built from the load's fields: PU line (city/state/zip
+ a schedule string built from raw pickup datetime columns, falling back to
date-range + comment-scanned schedule text via `extractSched`), DEL line
(same idea from the late-delivery datetime/comment), commodity (reusing
`parseLookupCommodity`, already in `mcleodParser.js`), weight, temperature
(reusing `parseTemp`, already in `mcleodParser.js`, reefer-equipment-only),
and either the rate (if a "show rate" toggle is on) or a fallback line
asking the carrier to name their rate. A multi-stop warning
(`detectMultiStop`: comment-scanned multi-pick/multi-drop language, or a
nonzero `stops` count) is shown above the message when applicable, since
multi-stop details need manual addition. A "Copy to clipboard" button
copies the current message text.

**Blast modal**: opened via the new visible button (see above) once a load
is selected in lookup. Pre-fills a subject line
(`"Load Available | {origin_city} {origin_state} → {dest_city}
{dest_state} | {equipment}"`) and the same email-ready message body as
lookup (with its own independent rate-visibility toggle, defaulting to
whatever lookup's toggle was set to). A textarea accepts carrier emails,
one per line or comma-separated, live-validated and counted
(`^[^\s@]+@[^\s@]+\.[^\s@]+$`); a drop zone also accepts a dropped
`.csv`/`.txt` file and extracts every email-shaped substring from its text
content (`.xlsx`/`.xls` explicitly rejected with a message to export CSV
first — no spreadsheet-parsing library for this). "Open in Gmail" builds
`https://mail.google.com/mail/?view=cm&bcc=...&su=...&body=...` (all
values URL-encoded) and opens it in a new tab — this is a **compose-link
handoff**, not sending through this app's own connected Gmail account (the
OAuth-connected account from sub-projects 2/3 is for *receiving and
auto-replying to* inquiries, a completely different concern from *blasting
a load to a carrier list*, which was always a manual Gmail-compose
handoff in the original tool and stays that way here).

## Out of scope

- Any backend change — this is 100% client-side computation over data the
  Loads tab already fetches.
- Excel (`.xlsx`/`.xls`) parsing for blast email import (same limitation
  the original had).
- The Konami-code trigger (see above — replaced with a real button).
- The original's one-off known-issue banner for a specific historical
  order (see above — not a general rule).
- Changing anything about the existing CSV-upload column-mapping pipeline
  (`mcleodParser.js`) — this phase only adds new pure functions alongside
  it and reuses `parseLookupCommodity`/`parseTemp` from it rather than
  duplicating them.

## Testing approach

Same rigor as `mcleodParser.js` and the matching engine from the email
sub-projects: every regex-driven rule (cross-post triggers and their
ambiguity guards, dedup tie-breaks, DAT row field values per equipment
class, lookup scoring, schedule extraction) gets its own branch-by-branch
test case, not just a couple of happy-path examples — this is the same
"highest-stakes, most novel logic gets the most thorough tests" principle
applied throughout this project.
