# Neo Glass Redesign — Design

Date: 2026-10-17
Status: approved (user, 2026-10-17)

## Goal

Rethink the whole frontend so it is simpler, faster to use, accessible, responsive with no horizontal scroll, and visually "neo / futuristic" in an Apple-glass style — while keeping every existing behaviour and test. Add two features: **gold "proven lane" loads** and a **Customers** tab.

Mockups used for approval live in `.superpowers/brainstorm/` (`dark-refined.html` is the approved look).

## Problems in the current UI this must fix

- Text overflows its container (fixed widths, `whitespace-nowrap` on long values).
- `LoadsTable` is a 9-column `<table>` inside `overflow-x-auto` — horizontal scroll on anything narrower than a laptop.
- Lime (`--color-accent`) used as **text/icon** colour on white cards (`CarrierSheet`, `ReviewQueue`, `CarrierDetailSheet`, `InquiryAlertBanner`) — fails contrast.
- Upload panel dominates the top of the Loads page.
- Nav doesn't adapt to phones.

## 1. Visual system

- **Dark-first glass**, light theme kept. Dark: pure-black base with soft violet (top-left) and teal (bottom-right) radial glows; cards are translucent smoked glass (`rgba(40,40,48,.62)`, `backdrop-blur(24px) saturate(180%)`, inset 1px top highlight, soft drop shadow). Light: `#f5f5f7` base with pastel glows, white frosted cards.
- Cards no longer stay white in dark mode — the card tokens (`surface`, `text`, `border`, status colours) get per-theme values.
- **Type:** system SF / Inter stack; page titles 26–28px bold, `-0.02em` tracking; `tabular-nums` on all money / weight / count values.
- **Colour rules:** lime is only ever a *fill* (primary button, selected segment, active tab) with `accent-ink` text on it. Never lime text or lime icons on any surface. Every text/background token pair used for text passes WCAG AA (4.5:1); enforced by a unit test over the token values.
- **Motion:** spring/`cubic-bezier(.2,.8,.2,1)` ~350ms; hover lift (`translateY(-2px)`), expand-in-place, sliding segmented-control thumb. Everything respects `prefers-reduced-motion` (existing `useMotionPreset` + CSS media query).
- **Default theme** becomes dark for new users (existing stored preference wins).

## 2. Shell & responsiveness

- **Desktop / tablet (≥ 768px):** slim sticky glass top bar: logo, tabs **Loads · Inquiries · Carriers · Customers · Stats**, then connection dot, theme toggle, account (username + log out). Pending-review count badge stays on Inquiries.
- **Phone (< 768px):** tabs move to a fixed bottom tab bar (icon + label, ≥ 44px targets, safe-area padding); the top bar keeps logo, theme toggle, log out.
- **No horizontal page scroll anywhere:** grids use `minmax(0,1fr)`, flex children get `min-w-0`, long text wraps (`overflow-wrap:anywhere`) or truncates with `…` and a `title` tooltip. Page container `max-w-[1400px]`, 16px side gutter on phones.
- Browser tab title reflects the pending review count: `(3) BulkPosting`.
- Keyboard: `/` focuses the current page's search, `n` opens Add Load (Loads tab), `Esc` closes the topmost sheet. Shortcuts are ignored while typing in an input.

## 3. Loads board

- `LoadsTable`'s `<table>` is replaced by a list of **load rows** (`LoadRow`). Each row: lane (`Origin, ST → Dest, ST`, wraps), rate (right-aligned, tabular), meta line (`#load · equipment · PU date · weight`, truncates), chips (status, carrier-match tier, proven-lane badge).
- Clicking a row (or Enter/Space on it) **expands it in place** with the actions that today live in the row's buttons: Email carriers (blast), Edit, Rate, Book carrier, Copy load #, View carrier matches. One row expanded at a time. The row is a `button`-semantics region with `aria-expanded`.
- Inline editing, selection mode, bulk action bar, sort and search keep working (same callbacks; selection circle sits at the row's left edge in selection mode).
- **Filter segmented control:** `All · ★ Proven · Needs rate · Booked` with live counts. "Needs rate" = no `target_pay`. Filter + search persist in `localStorage`.
- Upload CSV and Generate DAT Export move into an **Import / Export** menu button next to `+ Add load`; the upload panel opens as a sheet. The DAT export section stays reachable through that menu.
- Empty state with actions ("Import a CSV" / "Add a load"); skeleton rows while loading.

### Gold proven lanes

- **Rule:** a load is *proven* when at least one carrier has a `carrier_lane_history` row whose origin city+state and dest city+state equal the load's (compared with `normalizeLocation`: case-, whitespace- and punctuation-insensitive) **and** whose equipment is compatible with the load's.
- **Equipment compatibility:** expand codes to sets — `VR`/`RV` → `{V,R}`, every other code → `{code}`. Compatible when the sets intersect. If either side has no equipment, it is compatible. The history row's equipment is the linked load's `equipment` (`load_id`) when present, otherwise the carrier's `equipment_types` (any of them may intersect); if neither exists, unknown → compatible.
- **API:** `POST /api/carrier-matches/proven` body `{ loadIds: number[] }` → `{ [loadId]: [{ carrierId, carrierName, runs, lastRanAt, lastRate }] }`, sorted by runs desc then lastRanAt desc. Only the session user's loads/history. Loads with no proven carriers are omitted. One query for history rows, matching in JS.
- **Look:** proven rows get the gold treatment from the approved mockup: warm gold-tinted glass, 1px gold inset edge, soft gold outer glow, and an angled (`skewX(-20deg)`) light band sweeping left → right every ~3.8s then pausing. Badge: gold gradient pill `★ N carriers ran this` (`★ N ran it` on phones). Reduced motion: no sweep, static glow.
- Expanded proven row lists the carriers (name, runs, last ran, last rate) with an "Email them" action (opens the blast modal for that load).

## 4. Customers

- **Data:**
  - `loads.customer VARCHAR(255) NULL`; `carrier_lane_history.customer VARCHAR(255) NULL`. Added by `setup-db.js` migrations (idempotent, like existing ones) and `schema.sql`.
  - CSV parser maps the McLeod `Customer` column → `customer`. Upload upsert writes `customer` (re-uploading fills it for existing loads).
  - Add Load / Edit Load get a `Customer` field with autocomplete from existing customers. Manual lane-history entry gets an optional Customer field.
  - Effective customer of a history row = linked load's `customer` if present, else the row's own `customer`.
- **API:**
  - `GET /api/customers` → `[{ name, loadCount, carrierCount, lastActivity }]`, grouped by trimmed, case-insensitive name (display the most recent spelling), sorted by lastActivity desc.
  - `GET /api/customers/carriers?name=...&range=30|90|all&equipment=CODE` → `[{ carrierId, carrierName, mcNumber, runs, lastRanAt, avgRate, avgGp, lanes: [{ origin, dest, runs }] }]` sorted by runs desc.
- **UI — new `Customers` tab (`CustomersPage`):** left column = searchable customer list (name, loads, carriers, last activity); right column (stacked below on phones) = selected customer's carriers with runs, lanes, last ran, avg rate, avg GP; range segmented control (30d · 90d · All) and equipment filter. Clicking a carrier opens the existing `CarrierDetailSheet`. Selected customer and filters persist in `localStorage`. Empty state explains customers come from the CSV's Customer column or the Customer field.

## 5. Other screens

Restyled onto the new primitives, same behaviour: Inquiries (stats row, review queue cards, Gmail panel, log), Carriers (find matches + all carriers + map page), Stats (KPI tiles + table → responsive rows on phones), Login/Register (glass card, show-password toggle, caps-lock hint), all modals (`ModalCard` → sheet behaviour: bottom sheet on phones, centred panel on desktop; focus trap, Esc, focus return; unsaved-changes guard unchanged).

## 6. Small details

- Money formatted `$1,980`; empty values render `—`, never blank / `null`.
- Relative times (`RelativeTime`) with the absolute date as `title`.
- Copy actions show a toast "Copied".
- Inputs ≥ 16px font on phones (no iOS zoom), correct `type`/`inputMode` for phone/email/number.
- Visible focus ring (`ring-2` accent-strong offset) on every interactive element.
- Tap targets ≥ 44px on phones.

## 7. Testing

- All existing backend (jest, `npm test`, needs MySQL) and frontend (vitest) tests stay green; markup-coupled selectors are updated without weakening what they assert.
- New tests: equipment compatibility + proven-lane matching (unit), `/api/carrier-matches/proven` and `/api/customers*` routes (integration), CSV `Customer` parsing, `LoadRow` gold rendering + reduced-motion fallback, filter segmented control counts, customers page, token contrast test.

## Out of scope

Backend changes beyond proven lanes and customers; changing email matching, reply composition, or DAT export formats.
