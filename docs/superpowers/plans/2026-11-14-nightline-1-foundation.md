# Nightline 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the whole app inside the Nightline shell (black palette, map backdrop, island, command bar, real URLs) with every existing screen still working.

**Architecture:** The existing components read colour from CSS tokens through Tailwind, so rewriting `tokens.css` to the Nightline palette restyles every current screen at once. A new shell replaces `TopNav`; the active tab comes from the URL instead of component state. The map is a canvas driven by a small store that screens write to.

**Tech Stack:** React 18, Vite, Tailwind 3, framer-motion, react-router-dom 6, d3-geo, topojson-client, us-atlas, @fontsource-variable/inter, Vitest.

Spec: `docs/superpowers/specs/2026-11-14-nightline-redesign-design.md`. Visual reference: `docs/design/nightline-reference.html`.

Run all commands from `frontend/`. Test command: `npx vitest run`.

---

### Task 1: Dependencies

- [ ] `npm install react-router-dom@6 d3-geo@3 topojson-client@3 us-atlas@3 @fontsource-variable/inter`
- [ ] Commit `chore: add router, map and font dependencies`.

### Task 2: Palette and global styles

**Files:** modify `src/styles/tokens.css`, `src/index.css`, `tailwind.config.js`, `index.html`, `tests/styles/contrast.test.js`. Delete `src/components/ThemeToggle.jsx`, `src/components/AuroraBackground.jsx`, `src/lib/useTheme.js`, `tests/components/ThemeToggle.test.jsx`.

- [ ] `tokens.css`: one `:root` block, dark only. Keep every existing token name so current components keep compiling; values per the spec's colour section. `accent` becomes the off-white `245 245 242` with `accent-ink` `0 0 0`. Add `--color-hot: 255 122 61`. Add `--spring` (the `linear()` curve from the reference) and `--soft`.
- [ ] `index.css`: import `@fontsource-variable/inter`; `color-scheme: dark`; `.glass` takes the `mat` recipe (62% near-black, blur 40px, half-pixel inner edge, deep shadow); add `.mat` as the same recipe, `.caps` label style, and `.grain` overlay. Remove `.app-backdrop` and the light-theme rules.
- [ ] `tailwind.config.js`: add `hot` to `TOKEN_NAMES`; font family `'Inter Variable', Inter, system-ui, sans-serif`; `transitionTimingFunction.spring: 'var(--spring)'` and `soft`; remove the aurora keyframes.
- [ ] `index.html`: `<html lang="en" class="dark">`; remove the theme script and the Google Fonts links; `color-scheme` meta `dark`.
- [ ] `contrast.test.js`: parse `:root` only; one `describe` for the single theme; same pairs.
- [ ] Remove `ThemeToggle` and `AuroraBackground` from `LoginPage.jsx` and `RegisterPage.jsx`.
- [ ] Run tests; fix; commit `feat: Nightline palette, material and type`.

### Task 3: Map geometry

**Files:** create `src/map/geo.js`, `tests/map/geo.test.js`.

Exports: `project([lng, lat]) -> [x, y] | null` (Albers USA, scale 1300, translate 487.5/305, matching `us-atlas` pre-projected files); `laneGeometry(a, b) -> { A, B, C, length } | null` where `C` is the quadratic control point offset 20% of the length to the upper side; `pointOnLane(geom, t)`; `roadMiles(a, b)` (great-circle miles times 1.17, rounded to 10).

- [ ] Tests: Chicago projects inside the 975x610 frame; a point in the Atlantic returns null; `laneGeometry` control point is above the chord for an east-west lane; `pointOnLane` at 0 and 1 returns A and B; Chicago to Dallas `roadMiles` is between 900 and 1000.
- [ ] Implement; tests pass; commit `feat: map projection and lane geometry`.

### Task 4: Map store

**Files:** create `src/map/mapStore.js`, `tests/map/mapStore.test.js`.

A module-level store with `getState()`, `subscribe(fn)`, and actions: `setLanes(lanes)` where a lane is `{ id, from: [lng, lat], to: [lng, lat], fromLabel, toLabel, gold }` (lanes whose ends do not project are dropped; geometry and miles are precomputed); `setFocus(id | null)`; `ripple([lng, lat])` (appends `{ x, y, startedAt }`, ignored if the point does not project); `setDimmed(bool)`. Plus the hook `useMapStore(selector)` built on `useSyncExternalStore`.

- [ ] Tests: `setLanes` drops unprojectable lanes and precomputes `miles`; `setFocus` notifies subscribers; `ripple` appends; unsubscribing stops notifications.
- [ ] Implement; tests pass; commit `feat: map store`.

### Task 5: Map canvas

**Files:** create `src/map/UsMap.jsx`. Modify `tests/setup.js` so `HTMLCanvasElement.prototype.getContext` returns `null` in jsdom.

Port the drawing loop from the reference (`frame` function): dot field, borders, lanes, focus labels, ripples, pointer drift, camera easing. Differences from the reference: topology is imported from `us-atlas/states-albers-10m.json`; state comes from `mapStore`; the free-space rectangle is passed as props `insetLeft` and `insetRight`; the loop stops when the tab is hidden and when `prefers-reduced-motion` is set it draws without the travelling light or drift; returns early when there is no 2D context.

- [ ] Implement; verify in the browser against the reference; commit `feat: US map canvas`.

### Task 6: Shell pieces

**Files:** create `src/shell/CommandBar.jsx`, `src/shell/Island.jsx`, `src/shell/AccountPill.jsx`, `src/shell/Brand.jsx`, `src/shell/routes.js`, `tests/shell/CommandBar.test.jsx`, `tests/shell/Island.test.jsx`. Delete `src/components/TopNav.jsx`, `tests/components/TopNav.test.jsx`.

- `routes.js`: `NAV = [{ key, label, path }]` for loads, inquiries, carriers, customers, stats; `tabFromPath(pathname)`.
- `CommandBar`: `<nav aria-label="Primary">` of buttons with `aria-current="page"` on the active one and a framer-motion `layoutId` pill behind it; the Inquiries button shows the pending count (`usePendingReviewCount`) and the "Gmail not connected" dot (`useGmailConnected`), keeping the `pending-review-badge` and `gmail-nudge-badge` test ids; a Search button on the right (calls `onSearch`). Sets `document.title` as `TopNav` did.
- `Island`: idle shows connection state and the pending count; `inquiry:new` over the live socket springs it open with sender, subject and "View" / "Later"; it closes itself after 8 seconds.
- `AccountPill`: initials, username, connection indicator, and a Log out button with the accessible name "Log out".

- [ ] Tests: CommandBar marks the active tab from the route, navigates on click, shows the count badge; Island opens on `inquiry:new` and "View" navigates to `/inquiries`.
- [ ] Implement; tests pass; commit `feat: Nightline shell pieces`.

### Task 7: Shell and routing

**Files:** create `src/shell/AppShell.jsx`. Modify `src/main.jsx` (wrap in `BrowserRouter`), `src/pages/MainToolPage.jsx` (tab from `useLocation`, `navigate` instead of `setTab`, render inside `AppShell`, drop `TopNav`, `AuroraBackground` and the alert banner), `tests/pages/MainToolPage.test.jsx` and `tests/App.test.jsx` (wrap in `MemoryRouter`; update assertions that referenced the old nav).

`AppShell` renders `UsMap` (dimmed while a not-yet-rebuilt screen is showing), the grain layer, `Brand`, `Island`, `AccountPill`, `CommandBar`, and `children`. `/` redirects to `/loads`.

- [ ] Implement; all tests pass; `npx vite build` succeeds; manual pass in the browser on every tab, refresh and back button; commit `feat: Nightline shell with URL routing`.
