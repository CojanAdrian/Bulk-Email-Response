# Nightline redesign

Approved by the user on 2026-11-14 through eight interactive mockups. The
final one is saved as `docs/design/nightline-reference.html` and is the
visual source of truth: open it in a browser when a detail here is unclear.

## Goal

Rebuild the whole frontend in one visual language: black, minimal, bold
type, real depth, physical motion. Premium in feel, not a copy of macOS.
Every feature the app has today keeps working. The website and a later
desktop app share this one codebase.

## Out of scope (separate projects, in this order afterwards)

1. Reliability fixes (email poller, time zones, upload limits).
2. Desktop app (Windows wrapper around this frontend).
3. New features (in-app blasts, covered replies, rate capture, templates).
4. Freight inbox (full Gmail threads inside the app). Parked by the user.

## Visual language

- **Colour.** Background `#000`. Text `#f5f5f2` at 100 / 56 / 28 percent.
  Hairlines at 7 percent white. Gold `#f0c462` means "proven lane" and
  nothing else. Orange `#ff7a3d` means "an inquiry needs you" and nothing
  else. Green `#3ddc84` for live and success. No other hues. Dark only; the
  light theme and its toggle are removed.
- **Material.** One surface style, `mat`: 62 percent near-black, 40px
  backdrop blur, half-pixel light inner edge, deep shadow. Used for every
  floating panel. Never stacked on a flat page with nothing behind it.
- **Type.** Inter variable, self-hosted. Tight tracking (-0.008em body,
  down to -0.065em on display numerals). Sizes: 84 hero numeral, 40 detail
  title, 30 section title, 15.5 row title, 13 body, 12 meta, 10.5 caps
  label (0.14em tracking, uppercase, 28 percent).
- **Shape.** Radii: 34 sheets, 30 board, 28 widgets, 18 rows, 99 pills.
- **Motion.** One spring curve (the `linear()` spring in the reference) for
  anything that moves or resizes; one soft ease for fades and dimming.
  Motion always explains a change: where something came from, what it
  belongs to. `prefers-reduced-motion` and the Motion setting collapse
  springs to short fades.
- **Grain.** A 6 percent noise overlay over the whole window.

## Layout

A full-window canvas map sits behind everything. Floating over it:

- **Brand** top left. **Account pill** top right (opens Settings).
- **Island** top centre: a black pill showing inbox state. It springs open
  for a new inquiry (sender, load, message, "Reply with load details",
  "Later") and for confirmations such as an import.
- **Left panel** (540px): the current screen's main list.
- **Right column** (300px): "Needs a reply" inquiry cards and the Today
  widget (goal ring, average margin sparkline, reply-time bars).
- **Command bar** bottom centre: Loads, Inquiries (with count), Carriers,
  Customers, Stats, and Search. A white pill slides to the active tab.

The map sizes itself to the free space between the left panel and the
right column so no state is covered. Below 1100px wide the right column
hides; below 760px the map hides and the left panel fills the screen with
the command bar as a bottom tab bar.

## The map

A canvas drawing of the United States (Albers USA projection): a dot field
filling the land, hairline state borders, a slightly brighter coastline.
Data is bundled with the app (`us-atlas`), not fetched from a CDN.

- Each active load with known coordinates is a thin curved line between its
  two cities; proven lanes are gold.
- Hovering, arrow-keying to, or opening a load focuses it: the camera eases
  and zooms to the lane, the line gets a travelling light, both cities are
  labelled and the mileage shows at the midpoint. Other lanes dim.
- A new inquiry or an import sends a ripple through the dots from the
  pickup city.
- The map drifts a few pixels with the pointer.
- Coordinates come from the backend with each load (`origin_lat` and so on,
  columns that already exist but are never filled). The backend resolves
  them from a bundled US city list first and Google geocoding second, and
  stores them on the load. A load with no coordinates simply has no line.

The Carriers "find" view uses the same map for lane and regional matches.
The existing Google satellite map with driving routes stays available there
behind a "Satellite" switch, so nothing is lost.

## Screens

Every screen is a route (`/loads`, `/loads/:id`, `/inquiries`, `/carriers`,
`/carriers/:id`, `/customers`, `/customers/:name`, `/stats`, `/settings`,
`/settings/:section`), so refresh, back and links work.

### Loads

- Header: live count, "+" for New load, tabs Active / Booked / Covered /
  Proven with counts and a sliding underline.
- Row: lane, then load number (click or press C to copy; turns green and
  says "Copied"), pickup, equipment; on the right the rate and "N asking".
  Gold rows also list their regulars as chips: run count, carrier name,
  last rate paid.
- Clicking a regular opens a carrier card: MC, runs, last paid, average,
  dispatcher, last run date, phone with Copy, "Email this load", "Open
  carrier".
- Opening a load grows the row into a detail sheet: customer, copyable load
  number, lane, mileage strip, pickup and delivery windows with APPT or
  FCFS, rate, equipment, weight, commodity, temperature, stops and extra
  stops, the imported planning comment, regulars or who is asking, and the
  actions Blast, Find carriers, Copy details, Edit, Mark booked / covered /
  active, Delete.
- Everything the current table does stays: search, sort, selection mode
  with bulk status / include-rate / delete, inline rate edit, pickup window
  edit, custom reply and the "Modified" marker, the booking flow that logs
  the carrier, Add load, DAT export with its anomaly report, load lookup.
- **Import.** Dragging a file anywhere over the window turns the whole
  screen into the drop target. Ctrl V with a copied file or copied CSV text
  imports the same way. The island confirms with new and updated counts and
  the map ripples.
- Keyboard: arrows move, Enter opens, C copies the number, Esc closes,
  Ctrl K opens search, N new load, B blast, / focuses the list search.

### Inquiries

Left panel is the review queue (oldest first), one card per inquiry: who,
when, their message, the matched load with its tier, the editable reply,
rate toggle, Change match, Send, Reject, and selection for bulk send or
reject. Opening one grows it into a sheet with the full draft. The right
column shows the Gmail connection state and the inquiry log. Focusing an
inquiry focuses its load's lane on the map.

### Carriers

Left panel switches between Find (search a lane or pick a load; lane and
regional matches listed with tier, distance, equipment flags) and Manage
(searchable carrier list). Opening a carrier grows into its sheet: contact
details, equipment, operating states, comment, and lane history with add,
edit and delete. The map shows the query lane, match origins and tagged
states.

### Customers

Left panel lists customers with load counts, contract / spot mix and last
activity. Opening one shows its available and done loads and the carriers
who hauled for it, with the existing range, equipment and load-type
filters. The map shows that customer's lanes.

### Stats

Left panel is the booked-loads table with date range presets, sorting and
totals. The right column carries the larger numbers: gross profit against
the weekly target, loads booked, average margin, reply time.

### Search (Ctrl K)

One field over loads, carriers and customers. Arrow keys move, the map
follows a load result, Enter opens it.

### Settings

Opens from the account pill as a sheet with sections:

- **Targets**: loads booked per day, margin per load, reply time, weekly
  gross profit. These drive the Today widget and Stats.
- **Profile**: name, sign-in, change password, time zone.
- **Gmail & replies**: connection, auto-send for exact matches, include
  rate by default, signature. (The covered-load reply appears here when
  that feature is built.)
- **Board**: opening tab, row size. (Expiry and missing-from-upload rules
  appear when those features are built.)
- **Notifications**: new inquiry, waiting too long, a regular replied,
  sound.
- **Appearance**: map on or off, full or reduced motion.

Settings are per user and stored on the server in a new `user_settings`
table (one JSON document per user) behind `GET` and `PATCH
/api/settings`. Changing the password is a new `POST
/api/auth/change-password`.

### Sign in and register

Same language: black, the map faint behind, one centred `mat` card.

## Today widget data

A new `GET /api/stats/today` returns loads booked today, average gross
profit on today's booked loads, the same for the last seven days as a
series, and the median minutes between an inquiry arriving and its reply
today. Targets come from settings.

## Architecture

- React 18, Vite, Tailwind, framer-motion stay. Added: `react-router-dom`,
  `d3-geo`, `topojson-client`, `us-atlas`, `@fontsource-variable/inter`.
- `src/styles/tokens.css` is rewritten to the palette above; Tailwind maps
  to it. Old tokens are removed once nothing uses them.
- `src/ui/`: the primitives (Mat, Caps, Pill, Toggle, Stepper, Segmented,
  Field, Sheet, Popover, SlidingTabs, Island, CommandBar). Each is small,
  has one job, and is the only place its styling lives.
- `src/map/`: `UsMap.jsx` (the canvas), `mapStore.js` (lanes, focus,
  ripples; any screen sets these without knowing how the map draws),
  `geo.js` (projection, curve maths).
- `src/shell/AppShell.jsx` lays out map, brand, island, command bar and
  account pill and renders the current route's left panel and right column.
- `src/screens/<name>/` holds each screen. Existing data logic (API
  modules, `mcleodParser`, `datExport`, `lookupMessage`, hooks) is reused
  unchanged; existing components are restyled or replaced screen by screen.
- The row-to-sheet growth uses framer-motion shared layout (`layoutId`).

## Cleanup done along the way

Comments that narrate history are rewritten to describe the code or
removed. Tests for one-line wrappers are dropped; each new primitive and
screen gets tests for behaviour. Dead tokens, the aurora background, the
theme toggle and unused components are deleted. Text glyphs used as icons
are replaced with the icon set.

## Build order

1. Foundation: tokens, primitives, map, shell, routing.
2. Loads, including import, detail, regulars, backend coordinates.
3. Today widget and Settings, with their backend.
4. Inquiries.
5. Carriers.
6. Customers and Stats.
7. Sign in, register, search, cleanup pass.

Each step leaves the app working: screens not yet rebuilt render inside the
new shell in their current form.

## Testing

Vitest for primitives, the map store and each screen's behaviour. Jest for
the new backend routes. A manual pass in the browser after each step,
compared against the reference mockup.
