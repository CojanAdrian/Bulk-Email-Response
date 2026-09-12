# Carrier Database, Lane Matching & Apple-Inspired Design System — Design Spec

Date: 2026-09-12
Status: Draft — pending user review

## Background

Two goals, deliberately combined into one spec because the second depends on
the first for its component vocabulary:

1. **Carrier database.** The app currently has no memory of carriers at all
   — `email_inquiries.from_address` is the only carrier-identifying data
   anywhere, and it dies with the inquiry. The user wants to build a
   database of carriers (MC #, company, dispatcher, equipment, notes) and
   the specific lanes/loads each one has run (rate, driver, date), captured
   both standalone (a dedicated Carriers tab) and automatically when a load
   is marked Booked. Once that history exists, a matching engine should
   surface "carriers you can call right now" for any load — as a colored
   badge on the loads table, and in a dedicated visual "Carrier Map" — a
   3D globe (Genlogs-style) showing historical lanes as arcs, the current
   load's lane bolded, and carriers with no booked history highlighted by
   their noted operating states instead.
2. **Apple/iOS-inspired redesign.** Triggered by the user disliking the
   plain HTML checkbox bulk-select just added to the Review queue ("looks
   cheap"). Wanted app-wide, not just for new screens: iOS-style selection
   mode (a "Select" button revealing tap-to-check circles with spring
   animation, not raw checkboxes), translucent blurred action bars/sheets,
   and a general feel — not just look — of a polished native app. This
   becomes the foundation Phase 3's Carrier Map and cards are built with,
   and is carried across the rest of the app afterward.

This repo already has one prior design-system pass
(`2026-08-09-design-system-design.md`, a navy+gold reskin). The tokens it
describes have since evolved — the live `frontend/src/styles/tokens.css` now
uses a white-card / lime-accent (`#d7ff3d`) look with `.dark` overrides
scoped to the outer shell only (cards stay white in both themes). That
**current, live token file is the source of truth** this spec builds on;
the navy/gold spec is superseded.

## Sequencing

Four phases, each its own implementation plan:

1. **Design system foundation** — Apple/iOS visual language + core reusable
   components (selection mode, bottom sheet, translucent action bar),
   proven out on the Review queue (replacing today's checkbox bulk-select).
2. **Carrier database** — schema, geocoding, standalone Carriers tab CRUD,
   booking-flow capture hook.
3. **Matching engine & Carrier Map** — the globe visualization, per-load
   badge, deep-link, manual lane search.
4. **Remaining restyle** — carry Phase 1's language to whatever Phases 2-3
   didn't already touch (Loads table, Add/Edit Load modals, etc.).

Phases 2 and 3 could theoretically run in parallel once Phase 1 lands
(2 is mostly backend + simple forms; 3 depends on 2's data existing), but
are written here in dependency order.

---

## Phase 1 — Apple-Inspired Design System Foundation

### Visual language

Extends, does not replace, the current token system in
`frontend/src/styles/tokens.css`. No existing token values change in this
phase (that would ripple into every screen unreviewed) — this phase adds
new tokens/components for the *interaction patterns* Apple's HIG is known
for: translucency, spring motion, and sheet-based navigation.

- **Typography**: declare an explicit font stack instead of relying on
  Tailwind's default (`ui-sans-serif, system-ui, ...`, which happens to
  already resolve to San Francisco on Apple devices but is undeclared/
  accidental). Add to `tailwind.config.js` `theme.extend.fontFamily.sans`:
  `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", sans-serif`,
  with **Inter** self-hosted or loaded once as the deliberate cross-platform
  fallback (so Windows users get a refined typeface instead of Segoe UI).
- **Motion**: extend `frontend/src/lib/motionConfig.js` with two presets,
  following the existing spring-physics convention (`stiffness`/`damping`,
  gated by `useReducedMotion()` the same way every other preset already is):
  - `sheet` — bottom-sheet entrance: `y: '100%' → 0`, spring
    `{ stiffness: 350, damping: 35 }`, backdrop fades in parallel (reuses
    `modal.backdrop`'s timing).
  - `selectionPop` — the checkmark circle's fill animation:
    `scale: 0 → 1.15 → 1`, spring `{ stiffness: 500, damping: 22 }` (a
    slight overshoot — the "bounce" that reads as native iOS, not a linear
    checkbox tick).
- **Translucency**: the pattern already exists (`TopNav`'s
  `bg-shell-surface/80 backdrop-blur-xl`) — reused, not invented, for the
  new bottom action bar and sheet backdrops (`bg-surface/85 backdrop-blur-xl`
  for light surfaces).
- **Elevation**: keep the existing soft-shadow language (`Card`'s
  `shadow-[0_8px_30px_rgba(10,11,16,0.08)]`) for sheets and floating bars,
  scaled up slightly for anything that visually "floats" above content
  (`shadow-[0_12px_40px_rgba(10,11,16,0.18)]`).

### New shared components

1. **`useSelectionMode()`** (`frontend/src/lib/useSelectionMode.js`) — a
   hook, not tied to any one list: `{ active, selectedIds, enter, exit,
   toggle(id), selectAll(ids), isSelected(id) }`. `enter()`/`exit()` flip
   `active`; `exit()` also clears `selectedIds`.
2. **`SelectionCircle.jsx`** — the leading tap target replacing a
   checkbox: an empty ring (`h-6 w-6 rounded-full border-2 border-border`)
   that becomes a filled `bg-accent` circle with a white checkmark icon on
   select, animated via the new `selectionPop` preset. Takes `selected`,
   `onToggle`, `ariaLabel` props — same interface surface a checkbox
   `<input>` had, so swapping it into `ReviewQueue`/`LoadsTable` is a
   drop-in replacement, not a rewrite of surrounding logic.
3. **`BottomActionBar.jsx`** — replaces the current plain-bordered
   `<div>` bulk-action bars in `LoadsTable`/`ReviewQueue`. Fixed near the
   bottom of its scroll container, translucent + blurred, slides up via
   spring (`preset.sheet`-style motion) when `selectedIds.size > 0`, away
   when empty. Renders a count label + a `children` slot for the specific
   action buttons each screen needs (kept screen-specific, not
   over-abstracted).
4. **`BottomSheet.jsx`** — a sibling to the existing modal pattern
   (`Card` + `preset.modal`), for content that should slide up from the
   bottom instead of popping in centered: rounded top corners
   (`rounded-t-4xl`, reusing the existing `4xl` Tailwind radius extension),
   a drag-handle bar (`h-1 w-10 rounded-full bg-border mx-auto`, decorative
   only — no drag-to-dismiss gesture in v1, click-outside/close-button
   dismiss same as existing modals), backdrop blur. Used by Phase 3's
   carrier detail sheet; available for any future bottom-sheet need.

### Applied first to: Review queue

`ReviewQueue.jsx`'s just-added checkbox bulk-select (per-row `<input
type="checkbox">`, header select-all checkbox, plain bordered action bar)
gets replaced end-to-end with the components above:

- A "Select" text button (top-right of the queue header) calls
  `enter()`. While inactive, rows render exactly as today (no leading
  circle at all — matches the iOS Mail pattern of selection UI only
  appearing once requested, keeping the default view uncluttered).
- Once active, each row shows a `SelectionCircle`; the header shows
  "Select All" / "Cancel" text buttons instead of a checkbox.
- The bulk bar becomes a `BottomActionBar` with the same Send/Reject
  actions and confirm-before-reject step already built.
- Underlying bulk-send/bulk-reject API calls and state logic (added in the
  prior bug-fix pass) are unchanged — this phase only swaps presentation.

### Testing

Each new shared piece gets a focused test suite in the existing style
(`useSelectionMode` hook behavior, `SelectionCircle` renders + calls
`onToggle`, `BottomActionBar` shows/hides based on a count prop,
`BottomSheet` renders children + backdrop click closes). `ReviewQueue`'s
existing test suite (written in the prior bug-fix pass) gets updated to
query the new `SelectionCircle`/`BottomActionBar` roles instead of raw
checkboxes — behavior assertions (what gets sent to which API) stay the
same, since this phase is presentation-only for that screen.

---

## Phase 2 — Carrier Database

### Data model

Two new tables plus a small geocoding cache, following the existing
raw-SQL-via-`mysql2`/idempotent-migration convention in
`backend/scripts/setup-db.js`:

```sql
CREATE TABLE carriers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  mc_number VARCHAR(20) NULL,
  company_name VARCHAR(255) NOT NULL,
  dispatcher_name VARCHAR(255) NULL,
  dispatcher_phone VARCHAR(30) NULL,
  equipment_types JSON NULL,       -- structured, e.g. ["V","R","SD"] — same vocabulary as loads.equipment
  equipment_notes TEXT NULL,       -- freeform, e.g. "mostly dry van, has one reefer"
  operating_states JSON NULL,      -- structured, e.g. ["TX","OK","AR"] — drives Phase 3's globe state-highlight
  operating_notes TEXT NULL,       -- freeform, e.g. "runs the southeast a lot"
  comment TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE carrier_lane_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  carrier_id INT NOT NULL,
  user_id INT NOT NULL,
  load_id INT NULL,                -- set automatically when logged via the booking flow; NULL for standalone entries
  origin_city VARCHAR(255) NOT NULL,
  origin_state VARCHAR(2) NOT NULL,
  origin_lat DECIMAL(9,6) NULL,    -- cached geocode, see Geocoding below
  origin_lng DECIMAL(9,6) NULL,
  dest_city VARCHAR(255) NOT NULL,
  dest_state VARCHAR(2) NOT NULL,
  dest_lat DECIMAL(9,6) NULL,
  dest_lng DECIMAL(9,6) NULL,
  rate DECIMAL(10,2) NULL,
  driver_name VARCHAR(255) NULL,
  driver_phone VARCHAR(30) NULL,
  comment TEXT NULL,
  ran_at DATE NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE CASCADE
);

CREATE TABLE geocode_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city_state_key VARCHAR(255) NOT NULL UNIQUE,  -- normalized "city|state", lowercase
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Plus a migration adding nullable `origin_lat`/`origin_lng`/`dest_lat`/
`dest_lng` to the existing `loads` table (so a load's own coordinates are
cached the same way, needed by Phase 3's matching without a live API call
per match check).

Indexes: `(user_id, mc_number)` and `(user_id, company_name)` on
`carriers` for dedup lookups; `(user_id)` and `(carrier_id)` on
`carrier_lane_history`.

### Carrier identity / dedup

When a carrier gets logged (standalone or via booking), the backend
finds-or-creates rather than always inserting:

1. If `mc_number` is provided, match an existing carrier by
   `(user_id, mc_number)` (case/whitespace-normalized).
2. Otherwise, fall back to a case-insensitive `(user_id, company_name)`
   match.
3. No match on either → insert a new carrier row.

This means a carrier can accumulate many `carrier_lane_history` rows over
time (different lanes, different rates, different loads) under one stable
identity, which is what Phase 3's matching groups/ranks by.

### Geocoding

The user chose a live geocoding API (Google Maps Geocoding API) over a
bundled static dataset. To keep that affordable and fast:

- `backend/src/lib/geocoding.js`: `geocodeCityState(pool, city, state)` —
  normalizes to a cache key, checks `geocode_cache` first; on a cache miss,
  calls the Google Maps Geocoding API, stores the result, returns
  `{ lat, lng }`. Returns `null` (not a thrown error) on a failed/ambiguous
  lookup — a bad or unusual city name must degrade to "this lane can't be
  matched yet," never crash a save.
- Because the cache key is the **city+state pair**, not the individual
  load/history row, geocoding a 300-load CSV upload that mostly repeats a
  handful of origin cities costs at most a few dozen live API calls, not
  hundreds — and re-uploading the same board later costs zero.
- Coordinates are geocoded once and cached directly on the row
  (`loads.origin_lat`/etc., `carrier_lane_history.origin_lat`/etc.) at
  write time (on load create/update, on lane-history create/update), so
  Phase 3's matching is pure local math against already-resolved numbers —
  no live API calls happen at match-check time, ever.
- New required env var: `GOOGLE_MAPS_API_KEY` (documented in
  `.env.example` and the README, alongside the existing Google OAuth vars).

### Backend API

`backend/src/routes/carriers.js`, all scoped to `req.session.userId` the
same way `loads.js`/`inquiries.js` already are:

- `GET /api/carriers` — list, with optional `?q=` search across
  company/MC/dispatcher.
- `POST /api/carriers` — find-or-create (dedup logic above).
- `PATCH /api/carriers/:id`
- `DELETE /api/carriers/:id`
- `GET /api/carriers/:id/history`
- `POST /api/carriers/:id/history` — geocodes origin/dest on save.
- `PATCH /api/carriers/history/:historyId`
- `DELETE /api/carriers/history/:historyId`

### Frontend

- **New "Carriers" tab** (`CarriersPanel.jsx`), added to the existing
  state-based tab switcher in `MainToolPage.jsx`/`TopNav.jsx` (no router
  in this app today — this follows the same pattern as the
  Loads/Inquiries tabs, not a new navigation paradigm). List + search,
  built with Phase 1's `BottomSheet` for add/edit (carrier profile fields,
  then a nested lane-history list with its own add/edit sheet).
- **Booking-flow hook**: in `RateModal.jsx`, when `status` is changed to
  `'booked'`, an inline "Log the carrier for this load?" section appears
  (optional, skippable) — a carrier search-or-create field plus
  rate/driver/comment inputs. Saving calls the find-or-create carrier
  endpoint, then creates a `carrier_lane_history` row with `load_id` set
  and origin/dest pulled straight from the load being booked (no
  re-typing the lane).

### Testing

Backend: `carriers.js` route tests mirroring the existing `loads.js`/
`inquiries.js` integration-test style (auth, ownership scoping, dedup
behavior for both MC-number and company-name paths); `geocoding.js` unit
tests with the Google API mocked (cache hit skips the API call, cache miss
calls it and persists the result, a failed lookup returns `null` without
throwing). Frontend: `CarriersPanel` CRUD flows and the `RateModal`
booking-hook addition, mocked API, same Testing-Library conventions as
existing component tests.

---

## Phase 3 — Matching Engine & Carrier Map

### Matching algorithm

`backend/src/lib/carrierMatching.js`, mirroring the existing tiered
approach already used for inbound email matching
(`matchingEngine.js`'s load_number/city_state/city/state tiers) — same
"tiered confidence" shape, different signal (distance instead of text):

`findMatchesForLane(pool, userId, { originLat, originLng, destLat,
destLng }, equipmentType)`:

1. Fetch every `carrier_lane_history` row for the user that has cached
   origin coordinates.
2. Compute Haversine distance from the query origin to each row's origin
   (and, separately, to each row's destination).
3. Classify:
   - **origin distance > 300mi → excluded** (not a match at all).
   - **150mi < origin distance ≤ 300mi → weak/deadhead match.**
   - **origin distance ≤ 150mi → strong match.**
   - **strong match AND destination distance ≤ 150mi → upgraded to
     perfect match.**
4. Flag `equipmentMismatch: true` (never excludes) when the load's
   equipment type isn't among the carrier's `equipment_types` — shown, not
   hidden, per the "they might still know the lane" reasoning already
   agreed on.
5. Group by carrier (a carrier can have several matching history rows;
   keep the single best-tier/closest one per carrier for ranking, note the
   total count), sort perfect → strong → weak, then by distance within a
   tier.
6. Carriers with **no** `carrier_lane_history` rows at all but with
   `operating_states` set are returned in a separate `regionalCarriers`
   list (not lane-distance-ranked — surfaced only when the query
   origin/dest state is among their tagged states) for the globe's
   state-highlight treatment.

### Backend API

- `GET /api/carrier-matches?loadId=X` — matches for one existing load.
- `POST /api/carrier-matches` — matches for a manually-entered lane (the
  Carrier Map's free-form search), body `{ originCity, originState,
  destCity, destState, equipment }`.
- `POST /api/carrier-matches/bulk` — body `{ loadIds: [...] }`, returns a
  `{ [loadId]: { tier, count } }` map in one round trip, so the loads
  table can badge every visible active load without an N+1 request storm.

### Per-load badge

`LoadsTable.jsx` fetches the bulk match map (refreshed alongside the
existing load list fetch/`load:changed` subscription) and renders a small
colored badge next to the load number — reusing the existing `Badge`
component's variant system, with three new tier-specific variants
(perfect/strong/weak) distinct from the existing status/multi-stop badges
already there. Clicking it navigates to the Carrier Map tab (a callback
prop passed down the same way `onSelectLoad`/`onOpenBlast` already are)
with that load's id carried as the "focused load" state.

### Carrier Map

New `CarrierMapPage.jsx`/tab:

- **Globe**: `react-globe.gl` (Three.js-based, purpose-built for exactly
  this — arcs between two lat/lng points, polygon/region fills, built-in
  auto-rotate). Gently auto-rotates when idle.
- **Focused-load state**: when arriving via a badge click, the globe
  animates to center on that load's origin, draws its lane as one bold,
  glowing arc (thicker stroke + a subtle pulse/glow via `react-globe.gl`'s
  arc dash-animation option), and draws each matched carrier's best lane
  as a thinner arc colored by tier (perfect/strong/weak, reusing the same
  three badge colors for visual consistency between the table and the
  map). Carriers in the `regionalCarriers` list get their tagged states
  filled with a soft, muted highlight instead of an arc (needs a bundled
  US-states GeoJSON for the polygon layer — a one-time static asset, not
  an API dependency).
- **Manual lane search**: a translucent search bar (Phase 1's
  translucency language) at the top, for typing an origin/destination
  directly without an existing load — same matching endpoint, no
  "focused load" bold arc since there isn't one.
- **Side panel**: matched carriers as cards (Phase 1 visual language —
  rounded, generous spacing), tapping one both focuses the globe on just
  that carrier's arcs/region and opens a Phase 1 `BottomSheet` with full
  detail: company/MC/dispatcher, a tappable `tel:` phone link, full lane
  history list, notes, and a `mailto:` "send offer" link prefilled with
  the load's rate-offer text (reusing the existing reply-composing
  conventions from `replyComposer.js`/`lookupMessage.js` for the body, not
  a new template language).

### Testing

`carrierMatching.js` is a pure function once given coordinates — easy,
thorough unit tests with fixed lat/lngs covering each tier boundary
(exactly 150mi, exactly 300mi, both-ends-close upgrade to perfect,
equipment-mismatch flagging without exclusion). Route tests for the three
new endpoints mirror existing integration-test conventions. The globe
component itself (WebGL) isn't meaningfully unit-testable — covered by a
smoke test that it mounts without throwing given mocked match data, plus
manual verification, consistent with how visually-driven pieces are
already handled in this codebase.

---

## Phase 4 — Remaining App Restyle

Carries Phase 1's selection-mode/sheet/translucency language to whatever
Phases 2-3 didn't already touch on the way through: the Loads table's
existing bulk-select (same `SelectionCircle`/`BottomActionBar` swap
`ReviewQueue` got in Phase 1), and a pass over the remaining modals
(`AddLoadModal`, `BlastModal`, `ContactMethodModal`) for spacing/motion
consistency with the new `BottomSheet` pattern where it fits better than
the existing centered-modal pattern (centered modals stay for short,
focused actions; bottom sheets for anything with a natural "detail drill-
down" feel, like the new carrier sheet). Scoped last since it's pure
consistency work with no new data or logic, lowest risk to defer if time
runs short.

---

## Out of scope (this spec)

- Third-party carrier verification/safety data (e.g. FMCSA SAFER lookups)
  — mentioned once during brainstorming, not pursued; MC number is stored
  as free-text, not verified against any external registry.
- Real-time carrier location tracking.
- Automated rate benchmarking or rate suggestions.
- Drag-to-dismiss gesture on `BottomSheet` (click-outside/close-button
  only, in line with the existing modal pattern).
- A router/URL-addressable tabs — the Carrier Map remains a state-based
  tab like Loads/Inquiries, not a deep-linkable URL.
