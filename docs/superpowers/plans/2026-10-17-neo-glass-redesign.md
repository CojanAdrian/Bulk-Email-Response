# Neo Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend's look and layout as a responsive, accessible, dark-first Apple-glass UI, and add gold "proven lane" loads plus a Customers tab.

**Architecture:** Backend gains two small pure-logic modules (`equipmentCompat`, `provenLanes`), one route addition (`POST /api/carrier-matches/proven`), a `customers` router, and `customer` columns on `loads` and `carrier_lane_history`. Frontend keeps every component's props/callbacks and tests' behavioural assertions, but swaps presentation: new theme tokens (per-theme card colours), a responsive shell (top bar ≥768px, bottom tab bar below), the loads `<table>` replaced by `LoadRow` cards with expand-in-place, and a new `CustomersPage`.

**Tech Stack:** Express + mysql2 + jest/supertest (backend, `npm test` needs MySQL via Docker container `bulkposting-mysql-portfix`); React 18 + Vite + Tailwind 3 + framer-motion + vitest/RTL (frontend).

Spec: `docs/superpowers/specs/2026-10-17-neo-glass-redesign-design.md`.

**Working dir:** worktree `.worktrees/neo-glass-redesign` (branch `feature/neo-glass-redesign`). `backend/node_modules`, `frontend/node_modules` are junctions to the main checkout; `backend/.env` copied from it.

---

## File map

Backend
- Create `backend/src/lib/equipmentCompat.js` — `expandEquipment(code)`, `isEquipmentCompatible(a, bList)`.
- Create `backend/src/lib/provenLanes.js` — `findProvenCarriers(loads, historyRows)` pure matcher.
- Modify `backend/src/routes/carrierMatches.js` — `POST /proven`.
- Create `backend/src/routes/customers.js` — `GET /`, `GET /carriers`.
- Modify `backend/src/app.js` — mount `/api/customers`.
- Modify `backend/scripts/setup-db.js`, `backend/sql/schema.sql` — `customer` columns.
- Modify `backend/src/routes/loads.js` — `customer` in `LOAD_COLUMNS` + `EDITABLE_FIELDS`, trimmed.
- Modify `backend/src/routes/carriers.js` — `customer` on history POST/PATCH.
- Tests: `backend/tests/lib/equipmentCompat.test.js`, `backend/tests/lib/provenLanes.test.js`, `backend/tests/provenLanes.route.test.js`, `backend/tests/customers.test.js`, additions in `backend/tests/loads.test.js`.

Frontend
- Modify `frontend/src/styles/tokens.css`, `frontend/tailwind.config.js`, `frontend/src/index.css` — new tokens, glass utilities, gold sweep keyframes, reduced-motion.
- Create `frontend/tests/styles/contrast.test.js` — WCAG AA check of token pairs.
- Modify `frontend/src/lib/mcleodParser.js` — `customer` column.
- Create `frontend/src/api/customers.js`; modify `frontend/src/api/carrierMatches.js` (`provenCarriers`).
- Create `frontend/src/components/SegmentedControl.jsx`, `ProvenBadge.jsx`, `LoadRow.jsx`, `BottomTabBar.jsx`, `ImportExportMenu.jsx`, `CustomerField.jsx`.
- Create `frontend/src/pages/CustomersPage.jsx`.
- Create `frontend/src/lib/useHotkeys.js`, `frontend/src/lib/formatMoney.js`, `frontend/src/lib/usePersistentState.js`.
- Modify `LoadsTable.jsx` (rows instead of table), `TopNav.jsx`, `MainToolPage.jsx`, `AddLoadModal.jsx`, `RateModal.jsx`, `CarrierSheet.jsx`, `ModalCard.jsx`, primitives (`Card`, `PrimaryButton`, `SecondaryButton`, `Badge`), and the remaining screens for restyle + contrast fixes.

---

## Phase A — Backend

### Task A1: `equipmentCompat`

**Files:** Create `backend/src/lib/equipmentCompat.js`; Test `backend/tests/lib/equipmentCompat.test.js`

- [ ] Write the failing test:

```js
const { expandEquipment, isEquipmentCompatible } = require('../../src/lib/equipmentCompat');

describe('expandEquipment', () => {
  test('VR and RV expand to van and reefer', () => {
    expect([...expandEquipment('VR')].sort()).toEqual(['R', 'V']);
    expect([...expandEquipment('rv')].sort()).toEqual(['R', 'V']);
  });
  test('other codes expand to themselves, uppercased and trimmed', () => {
    expect([...expandEquipment(' f ')]).toEqual(['F']);
  });
  test('empty/null expands to an empty set', () => {
    expect(expandEquipment(null).size).toBe(0);
    expect(expandEquipment('').size).toBe(0);
  });
});

describe('isEquipmentCompatible', () => {
  test('VR is compatible with V and with R, both directions', () => {
    expect(isEquipmentCompatible('VR', ['V'])).toBe(true);
    expect(isEquipmentCompatible('V', ['VR'])).toBe(true);
    expect(isEquipmentCompatible('R', ['RV'])).toBe(true);
  });
  test('V is not compatible with F', () => {
    expect(isEquipmentCompatible('V', ['F'])).toBe(false);
  });
  test('any overlap in a list counts', () => {
    expect(isEquipmentCompatible('R', ['F', 'R'])).toBe(true);
  });
  test('unknown on either side is compatible', () => {
    expect(isEquipmentCompatible(null, ['F'])).toBe(true);
    expect(isEquipmentCompatible('V', [])).toBe(true);
    expect(isEquipmentCompatible('V', null)).toBe(true);
  });
});
```

- [ ] Run `cd backend && npx jest tests/lib/equipmentCompat.test.js` → FAIL (module not found).
- [ ] Implement:

```js
// Equipment codes that mean "either of these trailers" -- a VR/RV load can
// go on a van or a reefer, so it overlaps with plain V and plain R.
const COMBO_CODES = { VR: ['V', 'R'], RV: ['V', 'R'] };

function expandEquipment(code) {
  const normalized = code === null || code === undefined ? '' : String(code).trim().toUpperCase();
  if (normalized === '') return new Set();
  return new Set(COMBO_CODES[normalized] || [normalized]);
}

// True when `code` shares at least one trailer type with any entry of
// `otherCodes`. Missing equipment on either side never rules a match out --
// it just means we don't know.
function isEquipmentCompatible(code, otherCodes) {
  const mine = expandEquipment(code);
  const theirs = new Set();
  for (const other of Array.isArray(otherCodes) ? otherCodes : []) {
    for (const c of expandEquipment(other)) theirs.add(c);
  }
  if (mine.size === 0 || theirs.size === 0) return true;
  for (const c of mine) if (theirs.has(c)) return true;
  return false;
}

module.exports = { expandEquipment, isEquipmentCompatible };
```

- [ ] Run the test → PASS. Commit `feat: equipment compatibility helper (VR/RV overlap V and R)`.

### Task A2: `provenLanes` matcher

**Files:** Create `backend/src/lib/provenLanes.js`; Test `backend/tests/lib/provenLanes.test.js`

`historyRows` shape (from the route's SQL): `{ carrier_id, carrier_name, carrier_equipment_types (array|null), load_equipment (string|null), origin_city, origin_state, dest_city, dest_state, rate, ran_at, created_at }`.

- [ ] Write the failing test:

```js
const { findProvenCarriers, laneKey } = require('../../src/lib/provenLanes');

const load = (id, extra = {}) => ({ id, origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', ...extra });
const hist = (extra = {}) => ({
  carrier_id: 1, carrier_name: 'Swift Haul', carrier_equipment_types: null, load_equipment: null,
  origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Chicago', dest_state: 'IL',
  rate: '1900.00', ran_at: '2026-08-02', created_at: '2026-08-02T10:00:00Z', ...extra,
});

describe('laneKey', () => {
  test('is case, whitespace and punctuation insensitive', () => {
    expect(laneKey(' st. louis ', 'mo', 'Chicago', 'IL')).toBe(laneKey('ST LOUIS', 'MO', 'chicago', 'il'));
  });
});

describe('findProvenCarriers', () => {
  test('groups runs per carrier with last date and last rate', () => {
    const result = findProvenCarriers([load(10)], [
      hist({ ran_at: '2026-07-01', rate: '1800.00' }),
      hist({ ran_at: '2026-08-02', rate: '1900.00' }),
      hist({ carrier_id: 2, carrier_name: 'Blue Line', ran_at: '2026-06-01' }),
    ]);
    expect(result[10]).toEqual([
      { carrierId: 1, carrierName: 'Swift Haul', runs: 2, lastRanAt: '2026-08-02', lastRate: 1900 },
      { carrierId: 2, carrierName: 'Blue Line', runs: 1, lastRanAt: '2026-06-01', lastRate: 1900 },
    ]);
  });
  test('ignores a different lane', () => {
    expect(findProvenCarriers([load(10)], [hist({ dest_city: 'Denver', dest_state: 'CO' })])).toEqual({});
  });
  test('uses the linked load equipment first, then the carrier equipment', () => {
    expect(findProvenCarriers([load(10, { equipment: 'V' })], [hist({ load_equipment: 'F', carrier_equipment_types: ['V'] })])).toEqual({});
    expect(findProvenCarriers([load(10, { equipment: 'V' })], [hist({ carrier_equipment_types: ['VR'] })])[10]).toHaveLength(1);
    expect(findProvenCarriers([load(10, { equipment: 'R' })], [hist({ load_equipment: 'VR' })])[10]).toHaveLength(1);
  });
  test('a load missing a lane end is never proven', () => {
    expect(findProvenCarriers([load(10, { dest_city: null })], [hist()])).toEqual({});
  });
  test('falls back to created_at when ran_at is null', () => {
    const result = findProvenCarriers([load(10)], [hist({ ran_at: null, created_at: '2026-05-05T00:00:00Z' })]);
    expect(result[10][0].lastRanAt).toBe('2026-05-05');
  });
});
```

- [ ] Run → FAIL. Implement:

```js
const { isEquipmentCompatible } = require('./equipmentCompat');

function normPart(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Exact-lane identity: same origin city+state and dest city+state, ignoring
// case, spacing and punctuation ("St. Louis" === "ST LOUIS").
function laneKey(originCity, originState, destCity, destState) {
  const parts = [originCity, originState, destCity, destState].map(normPart);
  if (parts.some((p) => p === '')) return null;
  return parts.join('|');
}

function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// Returns { [loadId]: [{ carrierId, carrierName, runs, lastRanAt, lastRate }] }
// for every load at least one carrier has run on the exact same lane with
// compatible equipment. Loads with no such carrier are omitted.
function findProvenCarriers(loads, historyRows) {
  const byLane = new Map();
  for (const row of historyRows) {
    const key = laneKey(row.origin_city, row.origin_state, row.dest_city, row.dest_state);
    if (!key) continue;
    if (!byLane.has(key)) byLane.set(key, []);
    byLane.get(key).push(row);
  }

  const result = {};
  for (const load of loads) {
    const key = laneKey(load.origin_city, load.origin_state, load.dest_city, load.dest_state);
    const candidates = key ? byLane.get(key) : null;
    if (!candidates) continue;

    const perCarrier = new Map();
    for (const row of candidates) {
      const rowEquipment = row.load_equipment ? [row.load_equipment] : row.carrier_equipment_types;
      if (!isEquipmentCompatible(load.equipment, rowEquipment)) continue;
      const ranAt = toDateString(row.ran_at) || toDateString(row.created_at);
      const entry = perCarrier.get(row.carrier_id) || { carrierId: row.carrier_id, carrierName: row.carrier_name, runs: 0, lastRanAt: null, lastRate: null };
      entry.runs += 1;
      if (entry.lastRanAt === null || (ranAt && ranAt > entry.lastRanAt)) {
        entry.lastRanAt = ranAt;
        if (row.rate !== null && row.rate !== undefined) entry.lastRate = Number(row.rate);
      }
      if (entry.lastRate === null && row.rate !== null && row.rate !== undefined) entry.lastRate = Number(row.rate);
      perCarrier.set(row.carrier_id, entry);
    }
    if (perCarrier.size === 0) continue;
    result[load.id] = [...perCarrier.values()].sort(
      (a, b) => b.runs - a.runs || String(b.lastRanAt).localeCompare(String(a.lastRanAt))
    );
  }
  return result;
}

module.exports = { findProvenCarriers, laneKey };
```

- [ ] Run → PASS. Commit `feat: exact-lane proven-carrier matcher`.

### Task A3: `customer` columns

**Files:** Modify `backend/scripts/setup-db.js` (before `await conn.end()`), `backend/sql/schema.sql`, `backend/src/routes/loads.js`, `backend/src/routes/carriers.js`; Test additions in `backend/tests/loads.test.js`, `backend/tests/carriers.test.js`.

- [ ] Add to `setup-db.js`, following the `loadsGeoColumns` pattern:

```js
  const customerColumns = [
    ['loads', `ALTER TABLE loads ADD COLUMN customer VARCHAR(255) NULL`],
    ['carrier_lane_history', `ALTER TABLE carrier_lane_history ADD COLUMN customer VARCHAR(255) NULL`],
  ];
  for (const [tableName, alterSql] of customerColumns) {
    const [col] = await conn.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'customer'`,
      [databaseName, tableName]
    );
    if (col[0].count === 0) {
      await conn.query(alterSql);
    }
  }
```

- [ ] `schema.sql`: add `customer VARCHAR(255) NULL,` after `extra_stops JSON NULL,` in `loads`.
- [ ] `loads.js`: append `'customer'` to `LOAD_COLUMNS` and `EDITABLE_FIELDS`; in `normalizeLoadBody` add `if ('customer' in normalized) normalized.customer = normalized.customer == null ? null : String(normalized.customer).trim() || null;`.
- [ ] `carriers.js`: history POST inserts `customer` (`req.body.customer ? String(req.body.customer).trim() : null`); PATCH's field list gets `'customer'`.
- [ ] Tests (loads.test.js): upload with `customer: '  ALDI, Inc '` stores `'ALDI, Inc'`; re-upload of same load_number with a customer updates it; PATCH `{ customer: 'Kroger' }` persists. (carriers.test.js): POST history with `customer` returns it.
- [ ] Run `node scripts/setup-db.js` against test DB is done by the test setup? — check: run `npm run setup-db` (creates both DBs) then `npm test` → PASS. Commit `feat: store customer on loads and carrier lane history`.

### Task A4: `POST /api/carrier-matches/proven`

**Files:** Modify `backend/src/routes/carrierMatches.js`; Test `backend/tests/provenLanes.route.test.js`

- [ ] Route (register before `return router`):

```js
  // Exact-lane "proven" carriers for a batch of loads -- see provenLanes.js.
  router.post('/proven', asyncHandler(async (req, res) => {
    const { loadIds } = req.body;
    if (!Array.isArray(loadIds) || loadIds.length === 0) {
      return res.status(400).json({ error: 'loadIds must be a non-empty array' });
    }
    const placeholders = loadIds.map(() => '?').join(', ');
    const [loads] = await pool.query(
      `SELECT id, origin_city, origin_state, dest_city, dest_state, equipment FROM loads WHERE id IN (${placeholders}) AND user_id = ?`,
      [...loadIds, req.session.userId]
    );
    const [historyRows] = await pool.query(
      `SELECT h.carrier_id, c.company_name AS carrier_name, c.equipment_types AS carrier_equipment_types,
              l.equipment AS load_equipment, h.origin_city, h.origin_state, h.dest_city, h.dest_state,
              h.rate, h.ran_at, h.created_at
       FROM carrier_lane_history h
       JOIN carriers c ON c.id = h.carrier_id
       LEFT JOIN loads l ON l.id = h.load_id
       WHERE h.user_id = ?`,
      [req.session.userId]
    );
    res.json(findProvenCarriers(loads, historyRows));
  }));
```

- [ ] Tests: 401 unauthenticated; 400 on empty `loadIds`; a load whose exact lane a carrier ran returns `{ [id]: [{ carrierName: 'ABC Trucking', runs: 1, ... }] }`; equipment mismatch (load `F`, carrier `['V']`) omitted; another user's history never counts.
- [ ] Run → PASS. Commit `feat: POST /api/carrier-matches/proven`.

### Task A5: customers router

**Files:** Create `backend/src/routes/customers.js`; Modify `backend/src/app.js`; Test `backend/tests/customers.test.js`

- [ ] Implement:

```js
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');

const RANGE_DAYS = { 30: 30, 90: 90 };

// A history row's customer is its linked load's customer when there is one,
// otherwise whatever was typed on the history row itself.
const EFFECTIVE_CUSTOMER = 'COALESCE(NULLIF(TRIM(l.customer), \'\'), NULLIF(TRIM(h.customer), \'\'))';

function createCustomersRouter(pool) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const [loadRows] = await pool.query(
      `SELECT TRIM(customer) AS name, COUNT(*) AS loadCount, MAX(updated_at) AS lastLoadAt
       FROM loads WHERE user_id = ? AND customer IS NOT NULL AND TRIM(customer) <> ''
       GROUP BY LOWER(TRIM(customer)), TRIM(customer)`,
      [userId]
    );
    const [historyRows] = await pool.query(
      `SELECT ${EFFECTIVE_CUSTOMER} AS name, h.carrier_id, COALESCE(h.ran_at, h.created_at) AS ranAt
       FROM carrier_lane_history h LEFT JOIN loads l ON l.id = h.load_id
       WHERE h.user_id = ? HAVING name IS NOT NULL`,
      [userId]
    );

    const byKey = new Map();
    const entry = (name) => {
      const key = name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { name, loadCount: 0, carriers: new Set(), lastActivity: null });
      return byKey.get(key);
    };
    const later = (a, b) => (!a ? b : !b ? a : new Date(a) > new Date(b) ? a : b);
    for (const row of loadRows) {
      const e = entry(row.name);
      e.loadCount += Number(row.loadCount);
      e.lastActivity = later(e.lastActivity, row.lastLoadAt);
    }
    for (const row of historyRows) {
      const e = entry(row.name);
      e.carriers.add(row.carrier_id);
      e.lastActivity = later(e.lastActivity, row.ranAt);
    }
    const list = [...byKey.values()]
      .map((e) => ({ name: e.name, loadCount: e.loadCount, carrierCount: e.carriers.size, lastActivity: e.lastActivity ? new Date(e.lastActivity).toISOString() : null }))
      .sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
    res.json(list);
  }));

  router.get('/carriers', asyncHandler(async (req, res) => {
    const name = String(req.query.name ?? '').trim();
    if (name === '') return res.status(400).json({ error: 'name is required' });
    const conditions = ['h.user_id = ?', `LOWER(${EFFECTIVE_CUSTOMER}) = LOWER(?)`];
    const values = [req.session.userId, name];
    const days = RANGE_DAYS[req.query.range];
    if (days) {
      conditions.push('COALESCE(h.ran_at, DATE(h.created_at)) >= (CURDATE() - INTERVAL ? DAY)');
      values.push(days);
    }
    const [rows] = await pool.query(
      `SELECT h.carrier_id, c.company_name, c.mc_number, c.equipment_types, h.origin_city, h.origin_state, h.dest_city, h.dest_state,
              h.rate, h.gp, DATE_FORMAT(COALESCE(h.ran_at, DATE(h.created_at)), '%Y-%m-%d') AS ranAt, l.equipment AS load_equipment
       FROM carrier_lane_history h
       JOIN carriers c ON c.id = h.carrier_id
       LEFT JOIN loads l ON l.id = h.load_id
       WHERE ${conditions.join(' AND ')}`,
      values
    );

    const equipment = req.query.equipment ? String(req.query.equipment).toUpperCase() : null;
    const { isEquipmentCompatible } = require('../lib/equipmentCompat');
    const byCarrier = new Map();
    for (const row of rows) {
      if (equipment && !isEquipmentCompatible(equipment, row.load_equipment ? [row.load_equipment] : row.equipment_types)) continue;
      const c = byCarrier.get(row.carrier_id) || { carrierId: row.carrier_id, carrierName: row.company_name, mcNumber: row.mc_number, runs: 0, lastRanAt: null, rates: [], gps: [], lanes: new Map() };
      c.runs += 1;
      if (!c.lastRanAt || row.ranAt > c.lastRanAt) c.lastRanAt = row.ranAt;
      if (row.rate !== null) c.rates.push(Number(row.rate));
      if (row.gp !== null) c.gps.push(Number(row.gp));
      const laneLabel = `${row.origin_city}, ${row.origin_state} → ${row.dest_city}, ${row.dest_state}`;
      c.lanes.set(laneLabel, (c.lanes.get(laneLabel) || 0) + 1);
      byCarrier.set(row.carrier_id, c);
    }
    const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null);
    const result = [...byCarrier.values()]
      .map((c) => ({
        carrierId: c.carrierId, carrierName: c.carrierName, mcNumber: c.mcNumber, runs: c.runs, lastRanAt: c.lastRanAt,
        avgRate: avg(c.rates), avgGp: avg(c.gps),
        lanes: [...c.lanes.entries()].map(([lane, runs]) => ({ lane, runs })).sort((a, b) => b.runs - a.runs),
      }))
      .sort((a, b) => b.runs - a.runs || String(b.lastRanAt).localeCompare(String(a.lastRanAt)));
    res.json(result);
  }));

  return router;
}

module.exports = createCustomersRouter;
```

(Hoist the `isEquipmentCompatible` require to the top of the file when implementing.)

- [ ] Mount in `app.js`: `app.use('/api/customers', requireAuth, createCustomersRouter(pool));`.
- [ ] Tests: 401; list groups `'ALDI, Inc'` and `'aldi, inc '` into one entry with summed loadCount; a history row linked to a load inherits the load's customer; an unlinked history row with its own customer counts; `/carriers?name=aldi, inc` returns carriers sorted by runs with lanes + avgRate; `range=30` excludes an old run; `equipment=F` excludes a van-only carrier; 400 without name.
- [ ] Run → PASS. Commit `feat: customers API`.

## Phase B — Frontend foundation

### Task B1: tokens, glass utilities, contrast test

- `tokens.css`: `:root` = light theme, `.dark` = dark theme; **all** tokens (shell + card + status + new `gold-*`) defined per theme. Dark card tokens: `--color-surface: rgba(40,40,48,.62)`, `--color-surface-solid: #1c1c22`, `--color-surface-alt: rgba(255,255,255,.06)`, `--color-text: #f5f5f7`, `--color-text-muted: #a1a1aa`, `--color-border: rgba(255,255,255,.10)`; status colours with dark variants (`--color-success: #4ade80`, `--color-success-bg: rgba(74,222,128,.14)`, etc.). Add `--color-gold: #fbbf24`, `--color-gold-soft: #fde68a`, `--color-gold-ink: #3d2a00`, `--color-gold-surface` (dark `rgba(58,46,20,.85)`, light `#fff7e6`), `--color-focus` (accent-strong).
- `tailwind.config.js`: map new tokens; keyframes `gold-sweep` (`0% translateX(-150%) skewX(-20deg)` → `55%,100% translateX(420%) skewX(-20deg)`), animation `gold-sweep 3.8s cubic-bezier(.45,0,.2,1) infinite`; `surface-solid`, `gold*` colours.
- `index.css`: `.glass` (surface bg + `backdrop-filter: blur(24px) saturate(180%)` + inset highlight + shadow), `.glass-gold`, `.gold-sweep::after`, focus-visible ring default, `@media (prefers-reduced-motion: reduce)` disabling `.gold-sweep::after` and transitions; body `overflow-x: hidden` guard is **not** used (fix layout instead).
- Body background in dark: black + two radial glows (fixed, `AuroraBackground` retuned).
- Contrast test `frontend/tests/styles/contrast.test.js`: parse `tokens.css` for both themes, compute WCAG contrast (composite rgba over the shell bg) for pairs `text/surface`, `text-muted/surface`, `shell-text/shell-bg`, `shell-text-muted/shell-bg`, `accent-ink/accent`, `gold-ink/gold`, each status text over its bg → all ≥ 4.5.
- Default theme dark in `useTheme` when no stored preference (update its test).
- Commit `feat: neo glass design tokens with per-theme cards and contrast test`.

### Task B2: primitives restyle

`Card` → `.glass rounded-3xl`; `PrimaryButton` (lime fill, accent-ink, focus ring, min-h-11 on phones); `SecondaryButton` (glass, text token); `Badge` variants map to token bg/text, add `gold` variant; `ModalCard` → bottom sheet < 640px (`items-end`, rounded-t-3xl, safe-area padding) and centred panel ≥ 640px, uses `surface-solid` so text never sits on see-through glass; `Skeleton` on tokens; `Toast` glass. Fix every lime-as-text use (`CarrierSheet:372`, `ReviewQueue:440`, `CarrierDetailSheet:46`, `InquiryAlertBanner:34`, `TopNav` count badge) → `text-text` / `text-info` / underline links. Run vitest, fix selectors only. Commit.

### Task B3: shell — TopNav, BottomTabBar, Customers tab, hotkeys, title badge

- `TopNav`: tabs hidden `< md`; adds Customers (`UsersIcon` in `icons.jsx`).
- `BottomTabBar` (`md:hidden fixed bottom-0 inset-x-0`, glass, 5 tabs, `aria-label="Primary"` nav, `pb-[env(safe-area-inset-bottom)]`), same props as TopNav's tabs; main gets `pb-24 md:pb-6`.
- `useHotkeys(map)` ignores events from inputs/textareas/selects/contenteditable; `/` → focus `[data-hotkey-search]`, `n` → Add Load.
- `MainToolPage`: `document.title = count ? \`(${count}) BulkPosting\` : 'BulkPosting'`; Customers tab renders `CustomersPage`.
- Tests: bottom tab bar switches tabs; hotkey ignored inside input; title updates. Commit.

## Phase C — Loads board

### Task C1: helpers + API

- `formatMoney(value)` → `'$1,980'`, `'$1,980.50'`, `'—'` for null/''/NaN. Tests.
- `usePersistentState(key, initial)` — localStorage with try/catch. Tests.
- `api/carrierMatches.js`: `provenCarriers(loadIds)` → `post('/api/carrier-matches/proven', { loadIds })`.
- `api/customers.js`: `listCustomers()`, `customerCarriers({ name, range, equipment })`.
- Commit.

### Task C2: `SegmentedControl`, `ProvenBadge`

- `SegmentedControl({ options:[{value,label,count?}], value, onChange, ariaLabel })` — `role="radiogroup"`, each option `role="radio" aria-checked`, arrow keys move selection, framer-motion `layoutId` thumb. Tests: click selects; ArrowRight moves; counts render.
- `ProvenBadge({ count, compact })` — gold gradient pill `★ {count} carrier(s) ran this` / `★ {count} ran it`, `aria-label`. Tests.
- Commit.

### Task C3: `LoadRow` + LoadsTable rewrite

- Read `LoadsTable.jsx` fully first; keep its data fetching, sorting, selection mode, inline-edit, bulk bar, copy, status changes and callbacks (`onSelectLoad`, `onOpenBlast`, `onViewMatches`).
- `LoadRow({ load, expanded, onToggle, proven, matchTier, selectionMode, selected, onToggleSelect, actions })` — glass row (`.glass-gold gold-sweep` when `proven?.length`), grid `minmax(0,1fr) auto`, lane wraps, meta truncates with `title`, chips. Header region is a `button` with `aria-expanded`; expanded body (framer-motion height animation) shows proven carriers list + action buttons.
- LoadsTable: replaces `<table>` with list of `LoadRow`; fetches `provenCarriers` alongside `bulkCarrierMatches`; filter `SegmentedControl` (All / ★ Proven / Needs rate / Booked, counts) persisted; search input gets `data-hotkey-search`; sort becomes a small select ("Pickup date", "Rate", "Load #", "Newest").
- Update `LoadsTable` tests' selectors (`getByRole('row')` → row buttons, etc.) keeping assertions. New tests: proven row has gold class + badge; reduced motion → no `gold-sweep`; filter counts and filtering; no-lane load not proven.
- Commit.

### Task C4: Import/Export menu, empty state, customer field

- `ImportExportMenu` button (popover: "Upload CSV" opens UploadPanel in a ModalCard; "Generate DAT export" calls `datExportRef.current.openExportFlow()`). UploadPanel no longer rendered inline.
- `CustomerField` — input with `<datalist>` from `listCustomers()`; used in AddLoadModal and RateModal (edit) and CarrierSheet lane-history form.
- `mcleodParser`: `OPTIONAL_COLS.customer = ['Customer', 'Customer Name', 'Bill To']`; `customer: colMap.customer ? cleanText(row[colMap.customer]) || null : null`. Test.
- Empty state in LoadsTable. Commit.

## Phase D — Customers page

### Task D1: `CustomersPage`

- Layout `grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]`; left: search + list (buttons, `aria-pressed`), right: header with name + SegmentedControl range (30d/90d/All) + equipment select (EQUIPMENT_OPTIONS), carrier cards (name, MC, runs, last ran via RelativeTime, avg rate/gp via formatMoney, lane chips). Clicking a carrier fetches it (`getCarrier` from api/carriers if it exists, else uses the row data) and opens `CarrierDetailSheet`. Persist selection + filters with `usePersistentState`. Empty + loading + error states.
- Tests: lists customers; selecting fetches carriers with params; range change refetches; empty state text. Commit.

## Phase E — Remaining screens

Each task: read the component, restyle onto tokens/primitives (glass, no fixed widths, `min-w-0`, wrap/truncate, ≥44px targets on phones, inputs `text-base sm:text-sm`), keep behaviour, update only markup-coupled test selectors, run vitest, commit.

- E1 Inquiries: `InquiriesStatsRow`, `ReviewQueue`, `GmailConnectionPanel`, `InquiriesLog`, `InquiryAlertBanner`.
- E2 Carriers: `CarriersPanel`, `CarrierSheet`, `CarrierDetailSheet`, `CarrierMapPage` (split → stacked on phones), `CarrierLaneMap`.
- E3 Stats: `StatsPage` table → responsive rows below `md`, KPI tiles glass; `LoadsStatsRow`.
- E4 Auth: `LoginPage`, `RegisterPage` — glass card, show-password toggle (`aria-pressed`), caps-lock hint (`getModifierState('CapsLock')`).
- E5 Modals/forms: `AddLoadModal`, `RateModal`, `BlastModal`, `BookingCarrierModal`, `ContactMethodModal`, `DateRangeField`/`DateTimeCalendar`/`PopoverPanel`, `EquipmentPicker`, `CityStateAutocomplete`, `StateSelect` (dropdowns use `surface-solid`).

## Final verification

- [ ] `cd backend && npm test` → all pass.
- [ ] `cd frontend && npx vitest run` → all pass; `npx vite build` succeeds.
- [ ] Run the app (`npm start` backend, `npm run dev` frontend) and check at 1280px and 375px: no horizontal scroll on any tab, gold rows animate, reduced-motion disables sweep, both themes readable.
- [ ] Merge to master, push.
