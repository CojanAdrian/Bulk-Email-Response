# Matching Engine & Carrier Map (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the lane-matching engine, the per-load colored match badge, and the Carrier Map — a globe visualization showing a load's lane and its matched carriers, reachable both by clicking a load's badge and via manual lane search.

**Architecture:** `backend/src/lib/carrierMatching.js` is a pure function (Haversine distance + tier classification, no DB access) so it's fully unit-testable; the route layer does the DB joins and geocoding and hands it plain coordinate objects. Three new endpoints (`GET /api/carrier-matches?loadId=`, `POST /api/carrier-matches`, `POST /api/carrier-matches/bulk`) share that same function. The frontend gets a `react-globe.gl`-based globe (mocked in tests — jsdom has no WebGL) wrapped by a page that also renders a ranked side list and opens `CarrierSheet` for carrier detail. A load's colored badge (`LoadsTable.jsx`) deep-links into that page with the load pre-focused.

**Tech Stack:** `react-globe.gl` (already installed this session, `^2.38.0`) for the globe. Verified against its bundled `README.md`/`.d.ts` rather than assumed from memory — see prop names used below.

**Source spec:** `docs/superpowers/specs/2026-09-12-carrier-database-and-design-system.md`, Phase 3 section.

**Prerequisite:** Phase 2 (`docs/superpowers/plans/2026-09-12-carrier-database.md`) must be complete.

**Deliberate simplifications from the original spec wording** (flagging these up front rather than silently deciding):
- **State "highlight" is a marker, not a filled polygon.** The spec's Phase 3 section imagined filling in a carrier's tagged operating states as shaded map regions, which needs real US state border GeoJSON. Fabricating that geometry by hand would risk silently-wrong borders, and there's no verified accurate dataset available in this session to bundle instead. Using `react-globe.gl`'s **points layer** (a marker at the state's geocoded centroid, sized/labeled per state) delivers the same "where do they operate" visual without unverifiable data.
- **The globe has no photographic Earth texture.** `globeImageUrl` needs an external image URL; per the confirmed library behavior (its own README: *"If no image is provided, the globe is represented as a black sphere"*), omitting it renders a clean dark sphere with a colored atmosphere glow (using the app's own accent color) instead — a stylized look that fits a dashboard better than guessing at a texture CDN URL.
- **`dispatcher_email` didn't exist yet.** The spec's "send an offer instantly" mailto action needs an address to send to, which Phase 2's carrier fields didn't include (only phone). Task 1 below adds it.

---

## Task 1: Add `dispatcher_email` to carriers

**Files:**
- Modify: `backend/scripts/setup-db.js`
- Modify: `backend/src/routes/carriers.js`
- Modify: `backend/tests/carriers.test.js`
- Modify: `frontend/src/components/CarrierSheet.jsx`
- Modify: `frontend/tests/components/CarrierSheet.test.jsx`

- [ ] **Step 1: Add the migration**

In `backend/scripts/setup-db.js`, inside `migrateSchema`, add immediately after the `carriers` table's `CREATE TABLE IF NOT EXISTS` block (before the `carrier_lane_history` one):

```js
  const carrierEmailCol = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'carriers' AND COLUMN_NAME = 'dispatcher_email'`,
    [databaseName]
  );
  if (carrierEmailCol[0][0].count === 0) {
    await conn.query(`ALTER TABLE carriers ADD COLUMN dispatcher_email VARCHAR(255) NULL AFTER dispatcher_phone`);
  }
```

Run: `cd backend && npm run setup-db`
Expected: `Database setup complete.` with no errors.

- [ ] **Step 2: Write the failing backend test**

In `backend/tests/carriers.test.js`, add inside the `describe('POST / (find-or-create)', ...)` block, after the `'a matched carrier is updated with any new fields provided'` test:

```js
    test('stores dispatcher_email', async () => {
      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', dispatcher_email: 'dispatch@abctrucking.com' });
      expect(res.status).toBe(200);
      expect(res.body.dispatcher_email).toBe('dispatch@abctrucking.com');
    });
```

Run: `cd backend && npx jest tests/carriers.test.js -t "stores dispatcher_email"`
Expected: FAIL — `res.body.dispatcher_email` is `undefined` (the column exists now, but the route doesn't accept the field yet).

- [ ] **Step 3: Accept the field in the route**

In `backend/src/routes/carriers.js`, change:

```js
const CARRIER_FIELDS = [
  'mc_number', 'company_name', 'dispatcher_name', 'dispatcher_phone',
  'equipment_types', 'equipment_notes', 'operating_states', 'operating_notes', 'comment',
];
```

to:

```js
const CARRIER_FIELDS = [
  'mc_number', 'company_name', 'dispatcher_name', 'dispatcher_phone', 'dispatcher_email',
  'equipment_types', 'equipment_notes', 'operating_states', 'operating_notes', 'comment',
];
```

- [ ] **Step 4: Run the backend test to verify it passes**

Run: `cd backend && npx jest tests/carriers.test.js`
Expected: PASS — all tests (22 existing + 1 new = 23).

- [ ] **Step 5: Add the field to `CarrierSheet`**

In `frontend/src/components/CarrierSheet.jsx`, add state after the existing `dispatcherPhone` state:

```js
  const [dispatcherPhone, setDispatcherPhone] = useState(carrier?.dispatcher_phone ?? '');
  const [dispatcherEmail, setDispatcherEmail] = useState(carrier?.dispatcher_email ?? '');
```

Add it to the save payload, after `dispatcher_phone`:

```js
      dispatcher_phone: blankToNull(dispatcherPhone),
      dispatcher_email: blankToNull(dispatcherEmail),
```

Add the input field in the JSX, right after the "Dispatcher phone" field's closing `</div>` (still inside the same grid, before the "Dispatcher name" field's `col-span-2` div):

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-dispatcher-email">
              Dispatcher email
            </label>
            <input
              id="carrier-dispatcher-email"
              type="email"
              value={dispatcherEmail}
              onChange={(e) => setDispatcherEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
```

- [ ] **Step 6: Write the failing frontend test**

In `frontend/tests/components/CarrierSheet.test.jsx`, add after the `'add mode: creates a carrier with the entered fields...'` test:

```jsx
  test('add mode: includes dispatcher email in the saved payload', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/dispatcher email/i), { target: { value: 'dispatch@abctrucking.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ dispatcher_email: 'dispatch@abctrucking.com' }));
    });
  });
```

Run: `cd frontend && npx vitest run tests/components/CarrierSheet.test.jsx`
Expected: the new test FAILs (no "Dispatcher email" field rendered yet); the rest still pass — since you just wrote the component change in Step 5 before this test, actually run this BEFORE Step 5 if following strict TDD; given Step 5 is already specified above, running now should show it PASS. Run it to confirm.

- [ ] **Step 7: Run the full CarrierSheet suite to verify it passes**

Run: `cd frontend && npx vitest run tests/components/CarrierSheet.test.jsx`
Expected: PASS — all tests (9 existing + 1 new = 10).

- [ ] **Step 8: Commit**

```bash
git add backend/scripts/setup-db.js backend/src/routes/carriers.js backend/tests/carriers.test.js frontend/src/components/CarrierSheet.jsx frontend/tests/components/CarrierSheet.test.jsx
git commit -m "feat: add dispatcher_email to carriers"
```

---

## Task 2: Matching algorithm

**Files:**
- Create: `backend/src/lib/carrierMatching.js`
- Test: `backend/tests/lib/carrierMatching.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/lib/carrierMatching.test.js`:

```js
const { haversineMiles, findMatchesForLane } = require('../../src/lib/carrierMatching');

// Dallas, TX and Fort Worth, TX are ~30mi apart; Dallas and Houston, TX are
// ~225mi apart; Dallas and Chicago, IL are ~800mi apart. Real coordinates,
// used as fixed reference points throughout.
const DALLAS = { lat: 32.7767, lng: -96.797, state: 'TX' };
const FORT_WORTH = { lat: 32.7555, lng: -97.3308, state: 'TX' };
const HOUSTON = { lat: 29.7604, lng: -95.3698, state: 'TX' };
const CHICAGO = { lat: 41.8781, lng: -87.6298, state: 'IL' };
const MIAMI = { lat: 25.7617, lng: -80.1918, state: 'FL' };

describe('haversineMiles', () => {
  test('returns 0 for identical coordinates', () => {
    expect(haversineMiles(DALLAS.lat, DALLAS.lng, DALLAS.lat, DALLAS.lng)).toBe(0);
  });

  test('returns a small distance for two nearby cities', () => {
    const miles = haversineMiles(DALLAS.lat, DALLAS.lng, FORT_WORTH.lat, FORT_WORTH.lng);
    expect(miles).toBeGreaterThan(20);
    expect(miles).toBeLessThan(40);
  });

  test('returns a large distance for two far-apart cities', () => {
    const miles = haversineMiles(DALLAS.lat, DALLAS.lng, CHICAGO.lat, CHICAGO.lng);
    expect(miles).toBeGreaterThan(750);
    expect(miles).toBeLessThan(850);
  });
});

describe('findMatchesForLane', () => {
  function historyRow(overrides) {
    return {
      id: 1, carrier_id: 1, carrier_company_name: 'ABC Trucking', carrier_equipment_types: null,
      origin_lat: DALLAS.lat, origin_lng: DALLAS.lng, dest_lat: CHICAGO.lat, dest_lng: CHICAGO.lng,
      ...overrides,
    };
  }

  test('classifies a lane within 150mi of the query origin as a strong match', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].tier).toBe('strong');
  });

  test('classifies a lane 150-300mi from the query origin as a weak match', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: HOUSTON, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].tier).toBe('weak');
  });

  test('excludes a lane more than 300mi from the query origin', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: CHICAGO, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(0);
  });

  test('upgrades a strong match to perfect when the destination is also within 150mi', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: CHICAGO, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches[0].tier).toBe('perfect');
  });

  test('does not upgrade to perfect when the destination is far even if the origin is close', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches[0].tier).toBe('strong');
  });

  test('flags an equipment mismatch without excluding the match', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: 'R',
      historyRows: [historyRow({ carrier_equipment_types: ['V'] })], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].equipmentMismatch).toBe(true);
  });

  test('does not flag a mismatch when the carrier has no equipment_types on file at all', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: 'R',
      historyRows: [historyRow({ carrier_equipment_types: null })], regionalCarriers: [],
    });
    expect(laneMatches[0].equipmentMismatch).toBe(false);
  });

  test('does not flag a mismatch when the carrier\'s equipment includes the queried type', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: 'R',
      historyRows: [historyRow({ carrier_equipment_types: ['V', 'R'] })], regionalCarriers: [],
    });
    expect(laneMatches[0].equipmentMismatch).toBe(false);
  });

  test('groups multiple history rows for the same carrier, keeping only the best-tier entry', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: CHICAGO, equipment: null,
      historyRows: [
        historyRow({ id: 1, origin_lat: HOUSTON.lat, origin_lng: HOUSTON.lng, dest_lat: MIAMI.lat, dest_lng: MIAMI.lng }), // weak
        historyRow({ id: 2, origin_lat: FORT_WORTH.lat, origin_lng: FORT_WORTH.lng, dest_lat: CHICAGO.lat, dest_lng: CHICAGO.lng }), // perfect
      ],
      regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].tier).toBe('perfect');
    expect(laneMatches[0].laneCount).toBe(2);
  });

  test('sorts matches perfect > strong > weak, then by distance within a tier', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [
        historyRow({ id: 1, carrier_id: 1, carrier_company_name: 'Weak Co', origin_lat: HOUSTON.lat, origin_lng: HOUSTON.lng }),
        historyRow({ id: 2, carrier_id: 2, carrier_company_name: 'Strong Co', origin_lat: FORT_WORTH.lat, origin_lng: FORT_WORTH.lng }),
        historyRow({ id: 3, carrier_id: 3, carrier_company_name: 'Perfect Co', origin_lat: DALLAS.lat, origin_lng: DALLAS.lng, dest_lat: MIAMI.lat, dest_lng: MIAMI.lng }),
      ],
      regionalCarriers: [],
    });
    expect(laneMatches.map((m) => m.carrierName)).toEqual(['Perfect Co', 'Strong Co', 'Weak Co']);
  });

  test('a carrier with no lane history rows but a tagged origin state is a regional match', () => {
    const { regionalMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [], regionalCarriers: [{ id: 9, company_name: 'Regional Co', operating_states: ['TX', 'OK'] }],
    });
    expect(regionalMatches).toHaveLength(1);
    expect(regionalMatches[0].tier).toBe('regional');
  });

  test('upgrades to regional_perfect when both origin and destination states are tagged', () => {
    const { regionalMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [], regionalCarriers: [{ id: 9, company_name: 'Regional Co', operating_states: ['TX', 'FL'] }],
    });
    expect(regionalMatches[0].tier).toBe('regional_perfect');
  });

  test('excludes a regional carrier whose tagged states include neither the origin nor destination state', () => {
    const { regionalMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [], regionalCarriers: [{ id: 9, company_name: 'Regional Co', operating_states: ['CA', 'OR'] }],
    });
    expect(regionalMatches).toHaveLength(0);
  });

  test('a carrier with real lane history is never also returned as a regional match, even if tagged', () => {
    const { laneMatches, regionalMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({ carrier_id: 9 })],
      regionalCarriers: [{ id: 9, company_name: 'ABC Trucking', operating_states: ['TX'] }],
    });
    expect(laneMatches).toHaveLength(1);
    expect(regionalMatches).toHaveLength(0);
  });

  test('handles a history row with no cached coordinates (never geocoded) without crashing', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({ origin_lat: null, origin_lng: null })], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/lib/carrierMatching.test.js`
Expected: FAIL — cannot find module `../../src/lib/carrierMatching`.

- [ ] **Step 3: Write the module**

Create `backend/src/lib/carrierMatching.js`:

```js
const EARTH_RADIUS_MILES = 3958.8;
const STRONG_RADIUS_MILES = 150;
const WEAK_RADIUS_MILES = 300;
const TIER_RANK = { perfect: 3, strong: 2, weak: 1 };

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance between two lat/lng points, in miles.
function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

// Classifies one carrier_lane_history row against a query lane's
// coordinates. Returns null when it's not a match at all (no cached
// coordinates yet, or farther than the weak radius from the origin). See
// the design spec's "Matching algorithm" section for the tier definitions.
function classifyLaneMatch(queryOrigin, queryDest, historyRow) {
  if (historyRow.origin_lat === null || historyRow.origin_lng === null) return null;
  const originDistanceMiles = haversineMiles(queryOrigin.lat, queryOrigin.lng, Number(historyRow.origin_lat), Number(historyRow.origin_lng));
  if (originDistanceMiles > WEAK_RADIUS_MILES) return null;

  let tier = originDistanceMiles <= STRONG_RADIUS_MILES ? 'strong' : 'weak';
  let destDistanceMiles = null;
  if (tier === 'strong' && queryDest && historyRow.dest_lat !== null && historyRow.dest_lng !== null) {
    destDistanceMiles = haversineMiles(queryDest.lat, queryDest.lng, Number(historyRow.dest_lat), Number(historyRow.dest_lng));
    if (destDistanceMiles <= STRONG_RADIUS_MILES) tier = 'perfect';
  }
  return { tier, originDistanceMiles, destDistanceMiles };
}

// Ranks a user's carrier lane history against a queried lane (an existing
// load's origin/dest, or a manually-typed one), grouping by carrier -- each
// carrier's single best-tier/closest entry represents them, with a count of
// how many lanes they have on file. Carriers with zero lane history but a
// tagged operating_states match on the query's origin (and optionally
// destination) state are returned separately as regionalMatches, never
// double-counted against a carrier that also has real lane history.
function findMatchesForLane({ queryOrigin, queryDest, equipment, historyRows, regionalCarriers }) {
  const bestByCarrier = new Map();
  for (const row of historyRows) {
    const classified = classifyLaneMatch(queryOrigin, queryDest, row);
    if (!classified) continue;

    const carrierEquipment = Array.isArray(row.carrier_equipment_types) ? row.carrier_equipment_types : [];
    const equipmentMismatch = Boolean(equipment && carrierEquipment.length > 0 && !carrierEquipment.includes(equipment));

    const existing = bestByCarrier.get(row.carrier_id);
    const isBetter =
      !existing ||
      TIER_RANK[classified.tier] > TIER_RANK[existing.tier] ||
      (TIER_RANK[classified.tier] === TIER_RANK[existing.tier] && classified.originDistanceMiles < existing.originDistanceMiles);

    if (isBetter) {
      bestByCarrier.set(row.carrier_id, {
        carrierId: row.carrier_id,
        carrierName: row.carrier_company_name,
        historyId: row.id,
        tier: classified.tier,
        originDistanceMiles: classified.originDistanceMiles,
        destDistanceMiles: classified.destDistanceMiles,
        equipmentMismatch,
        laneCount: (existing ? existing.laneCount : 0) + 1,
      });
    } else {
      existing.laneCount += 1;
    }
  }

  const laneMatches = [...bestByCarrier.values()].sort((a, b) => {
    if (TIER_RANK[b.tier] !== TIER_RANK[a.tier]) return TIER_RANK[b.tier] - TIER_RANK[a.tier];
    return a.originDistanceMiles - b.originDistanceMiles;
  });

  const matchedCarrierIds = new Set(laneMatches.map((m) => m.carrierId));
  const regionalMatches = regionalCarriers
    .filter((carrier) => !matchedCarrierIds.has(carrier.id))
    .map((carrier) => {
      const states = Array.isArray(carrier.operating_states) ? carrier.operating_states : [];
      const originTagged = states.includes(queryOrigin.state);
      if (!originTagged) return null;
      const destTagged = Boolean(queryDest && states.includes(queryDest.state));
      return {
        carrierId: carrier.id,
        carrierName: carrier.company_name,
        tier: destTagged ? 'regional_perfect' : 'regional',
        taggedStates: states,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'regional_perfect' ? -1 : 1));

  return { laneMatches, regionalMatches };
}

module.exports = { haversineMiles, classifyLaneMatch, findMatchesForLane };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/lib/carrierMatching.test.js`
Expected: PASS — all 18 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/carrierMatching.js backend/tests/lib/carrierMatching.test.js
git commit -m "feat: add carrier lane-matching algorithm"
```

---

## Task 3: Carrier-matches backend routes

**Files:**
- Create: `backend/src/routes/carrierMatches.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/carrierMatches.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/carrierMatches.test.js`:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

// Real coordinates: Fort Worth is ~30mi from Dallas (strong match radius);
// Chicago is ~800mi away (no match).
const DALLAS = { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 };
const FORT_WORTH = { city: 'Fort Worth', state: 'TX', lat: 32.7555, lng: -97.3308 };
const CHICAGO = { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 };

describe('carrier-matches routes', () => {
  let pool;
  let app;
  let agent;
  let userId;

  beforeAll(() => {
    pool = createTestPool();
    app = createApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetTables(pool);
    await pool.query('DELETE FROM carrier_lane_history');
    await pool.query('DELETE FROM carriers');
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = result.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  async function makeCarrierWithHistory(originOverrides = {}) {
    const [carrierResult] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
    await pool.query(
      `INSERT INTO carrier_lane_history (carrier_id, user_id, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, dest_lat, dest_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [carrierResult.insertId, userId, FORT_WORTH.city, FORT_WORTH.state, FORT_WORTH.lat, FORT_WORTH.lng, CHICAGO.city, CHICAGO.state, CHICAGO.lat, CHICAGO.lng, ...Object.values(originOverrides)]
    );
    return carrierResult.insertId;
  }

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/carrier-matches');
    expect(res.status).toBe(401);
  });

  describe('POST / (manual lane)', () => {
    test('returns lane matches for a manually-entered lane', async () => {
      await makeCarrierWithHistory();
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.status).toBe(200);
      expect(res.body.laneMatches).toHaveLength(1);
      expect(res.body.laneMatches[0].carrierName).toBe('ABC Trucking');
      expect(res.body.laneMatches[0].tier).toBe('perfect');
    });

    test('returns 400 when origin/destination city or state is missing', async () => {
      const res = await agent.post('/api/carrier-matches').send({ originCity: 'Dallas' });
      expect(res.status).toBe(400);
    });

    test('only matches the current user\'s own carriers', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherCarrier] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);
      await pool.query(
        `INSERT INTO carrier_lane_history (carrier_id, user_id, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [otherCarrier.insertId, otherUser.insertId, FORT_WORTH.city, FORT_WORTH.state, FORT_WORTH.lat, FORT_WORTH.lng, CHICAGO.city, CHICAGO.state]
      );

      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.status).toBe(200);
      expect(res.body.laneMatches).toHaveLength(0);
    });

    test('returns regional matches for a carrier with no lane history but a tagged operating state', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name, operating_states) VALUES (?, 'Regional Co', ?)", [userId, JSON.stringify(['TX'])]);
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.status).toBe(200);
      expect(res.body.regionalMatches).toHaveLength(1);
      expect(res.body.regionalMatches[0].carrierName).toBe('Regional Co');
    });
  });

  describe('GET /?loadId=', () => {
    test('returns matches for an existing load\'s lane', async () => {
      await makeCarrierWithHistory();
      const [loadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, user_id, status) VALUES ('L1001', ?, ?, ?, ?, ?, ?, ?, 'active')",
        [DALLAS.city, DALLAS.state, DALLAS.lat, DALLAS.lng, CHICAGO.city, CHICAGO.state, userId]
      );

      const res = await agent.get(`/api/carrier-matches?loadId=${loadResult.insertId}`);
      expect(res.status).toBe(200);
      expect(res.body.laneMatches).toHaveLength(1);
    });

    test('returns 404 for a load belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [loadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L1001', 'Dallas', 'TX', 'Chicago', 'IL', ?, 'active')",
        [otherUser.insertId]
      );
      const res = await agent.get(`/api/carrier-matches?loadId=${loadResult.insertId}`);
      expect(res.status).toBe(404);
    });

    test('returns 400 when loadId is missing', async () => {
      const res = await agent.get('/api/carrier-matches');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /bulk', () => {
    test('returns a tier/count map keyed by load id', async () => {
      await makeCarrierWithHistory();
      const [matchedLoad] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, user_id, status) VALUES ('L1001', ?, ?, ?, ?, ?, ?, ?, 'active')",
        [DALLAS.city, DALLAS.state, DALLAS.lat, DALLAS.lng, CHICAGO.city, CHICAGO.state, userId]
      );
      const [unmatchedLoad] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, user_id, status) VALUES ('L1002', 'Miami', 'FL', 25.7617, -80.1918, 'Seattle', 'WA', ?, 'active')",
        [userId]
      );

      const res = await agent.post('/api/carrier-matches/bulk').send({ loadIds: [matchedLoad.insertId, unmatchedLoad.insertId] });
      expect(res.status).toBe(200);
      expect(res.body[matchedLoad.insertId]).toEqual({ tier: 'perfect', count: 1 });
      expect(res.body[unmatchedLoad.insertId]).toBeUndefined();
    });

    test('returns 400 when loadIds is missing or empty', async () => {
      const res1 = await agent.post('/api/carrier-matches/bulk').send({});
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/carrier-matches/bulk').send({ loadIds: [] });
      expect(res2.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/carrierMatches.test.js`
Expected: FAIL — 404s, since neither the route file nor its `app.js` wiring exist yet.

- [ ] **Step 3: Write the route module**

Create `backend/src/routes/carrierMatches.js`:

```js
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { geocodeCityState } = require('../lib/geocoding');
const { findMatchesForLane } = require('../lib/carrierMatching');

// Selects every one of the user's carrier_lane_history rows joined with
// their carrier's name/equipment (what findMatchesForLane needs), plus
// every carrier with zero history rows but a non-empty operating_states
// tag (candidates for the regional-match path).
async function loadCandidates(pool, userId) {
  const [historyRows] = await pool.query(
    `SELECT h.id, h.carrier_id, c.company_name AS carrier_company_name, c.equipment_types AS carrier_equipment_types,
            h.origin_lat, h.origin_lng, h.dest_lat, h.dest_lng
     FROM carrier_lane_history h
     JOIN carriers c ON c.id = h.carrier_id
     WHERE h.user_id = ?`,
    [userId]
  );
  const [regionalCarriers] = await pool.query(
    `SELECT c.id, c.company_name, c.operating_states
     FROM carriers c
     WHERE c.user_id = ? AND JSON_LENGTH(c.operating_states) > 0
       AND NOT EXISTS (SELECT 1 FROM carrier_lane_history h WHERE h.carrier_id = c.id)`,
    [userId]
  );
  return { historyRows, regionalCarriers };
}

async function resolveQueryLane(pool, { originCity, originState, destCity, destState }) {
  const originGeo = await geocodeCityState(pool, originCity, originState);
  const destGeo = destCity && destState ? await geocodeCityState(pool, destCity, destState) : null;
  if (!originGeo) return null;
  return {
    queryOrigin: { lat: originGeo.lat, lng: originGeo.lng, state: originState },
    queryDest: destGeo ? { lat: destGeo.lat, lng: destGeo.lng, state: destState } : null,
  };
}

function createCarrierMatchesRouter(pool) {
  const router = express.Router();

  router.post('/', asyncHandler(async (req, res) => {
    const { originCity, originState, destCity, destState, equipment } = req.body;
    if (!originCity || !originState || !destCity || !destState) {
      return res.status(400).json({ error: 'originCity, originState, destCity, and destState are required' });
    }

    const lane = await resolveQueryLane(pool, { originCity, originState, destCity, destState });
    if (!lane) {
      return res.json({ laneMatches: [], regionalMatches: [] });
    }
    const { historyRows, regionalCarriers } = await loadCandidates(pool, req.session.userId);
    const result = findMatchesForLane({ ...lane, equipment: equipment || null, historyRows, regionalCarriers });
    res.json(result);
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { loadId } = req.query;
    if (!loadId) {
      return res.status(400).json({ error: 'loadId is required' });
    }
    const [loadRows] = await pool.query('SELECT * FROM loads WHERE id = ? AND user_id = ?', [loadId, req.session.userId]);
    if (loadRows.length === 0) {
      return res.status(404).json({ error: 'Load not found' });
    }
    const load = loadRows[0];
    const lane = await resolveQueryLane(pool, {
      originCity: load.origin_city, originState: load.origin_state,
      destCity: load.dest_city, destState: load.dest_state,
    });
    if (!lane) {
      return res.json({ laneMatches: [], regionalMatches: [] });
    }
    const { historyRows, regionalCarriers } = await loadCandidates(pool, req.session.userId);
    const result = findMatchesForLane({ ...lane, equipment: load.equipment || null, historyRows, regionalCarriers });
    res.json(result);
  }));

  router.post('/bulk', asyncHandler(async (req, res) => {
    const { loadIds } = req.body;
    if (!Array.isArray(loadIds) || loadIds.length === 0) {
      return res.status(400).json({ error: 'loadIds must be a non-empty array' });
    }
    const placeholders = loadIds.map(() => '?').join(', ');
    const [loads] = await pool.query(
      `SELECT * FROM loads WHERE id IN (${placeholders}) AND user_id = ?`,
      [...loadIds, req.session.userId]
    );
    const { historyRows, regionalCarriers } = await loadCandidates(pool, req.session.userId);

    const map = {};
    for (const load of loads) {
      const lane = await resolveQueryLane(pool, {
        originCity: load.origin_city, originState: load.origin_state,
        destCity: load.dest_city, destState: load.dest_state,
      });
      if (!lane) continue;
      const { laneMatches, regionalMatches } = findMatchesForLane({ ...lane, equipment: load.equipment || null, historyRows, regionalCarriers });
      if (laneMatches.length > 0) {
        map[load.id] = { tier: laneMatches[0].tier, count: laneMatches.length };
      } else if (regionalMatches.length > 0) {
        map[load.id] = { tier: regionalMatches[0].tier, count: regionalMatches.length };
      }
    }
    res.json(map);
  }));

  return router;
}

module.exports = createCarrierMatchesRouter;
```

- [ ] **Step 4: Wire the router into the app**

In `backend/src/app.js`, add the import after `createCarriersRouter`:

```js
const createCarriersRouter = require('./routes/carriers');
const createCarrierMatchesRouter = require('./routes/carrierMatches');
```

And register the route after `/api/carriers`:

```js
  app.use('/api/carriers', requireAuth, createCarriersRouter(pool));
  app.use('/api/carrier-matches', requireAuth, createCarrierMatchesRouter(pool));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/carrierMatches.test.js`
Expected: PASS — all 10 tests. (Real coordinates are used directly in the test fixtures for `loads`/`carrier_lane_history`, so no live geocoding call happens for the *matching* math itself — `resolveQueryLane` still calls `geocodeCityState` for the query lane, which without `GOOGLE_MAPS_API_KEY` set in the test environment returns `null` gracefully... but the query lane's own coordinates are needed for the distance math to work. Note: the GET/POST tests query lanes by city/state text, not pre-seeded coordinates, so they depend on `geocodeCityState` succeeding. If `GOOGLE_MAPS_API_KEY` is unset in your `.env`, these specific tests will see `resolveQueryLane` return `null` and get 0 matches instead of the expected 1 — see Step 6.)

- [ ] **Step 6: Handle the no-API-key case for these specific tests**

If Step 5 shows failures because the query lane itself can't be geocoded (no `GOOGLE_MAPS_API_KEY` configured), pre-seed the `geocode_cache` table in the test file instead of relying on a live API call. Add this `beforeEach` addition in `backend/tests/carrierMatches.test.js`, right after the existing `await pool.query('DELETE FROM carriers');` line:

```js
    await pool.query('DELETE FROM geocode_cache');
    await pool.query('INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', [
      'dallas|tx', DALLAS.lat, DALLAS.lng,
      'fort worth|tx', FORT_WORTH.lat, FORT_WORTH.lng,
      'chicago|il', CHICAGO.lat, CHICAGO.lng,
    ]);
```

This makes every test's query-lane geocoding a guaranteed cache hit regardless of whether a real API key is configured, consistent with how `geocodeCityState` is exercised elsewhere in the test suite. Re-run Step 5's command to confirm PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/carrierMatches.js backend/src/app.js backend/tests/carrierMatches.test.js
git commit -m "feat: add carrier-matches backend routes"
```

---

## Task 4: Frontend `api/carrierMatches.js`

**Files:**
- Create: `frontend/src/api/carrierMatches.js`

No dedicated test, matching the existing convention for thin API wrapper files.

- [ ] **Step 1: Add the module**

Create `frontend/src/api/carrierMatches.js`:

```js
import { get, post } from './client';

export function getCarrierMatchesForLoad(loadId) {
  return get(`/api/carrier-matches?loadId=${encodeURIComponent(loadId)}`);
}

export function searchCarrierMatches(lane) {
  return post('/api/carrier-matches', lane);
}

export function bulkCarrierMatches(loadIds) {
  return post('/api/carrier-matches/bulk', { loadIds });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/carrierMatches.js
git commit -m "feat: add carrier-matches API client"
```

---

## Task 5: Per-load match badge in `LoadsTable`

**Files:**
- Modify: `frontend/src/components/LoadsTable.jsx`
- Modify: `frontend/tests/components/LoadsTable.test.jsx`

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/components/LoadsTable.test.jsx`, add near the top, after the existing `import * as liveSocket from '../../src/lib/liveSocket';` line:

```jsx
import * as carrierMatchesApi from '../../src/api/carrierMatches';
```

Add `vi.mock('../../src/api/carrierMatches');` after the existing `vi.mock('../../src/lib/liveSocket');` line.

In the `beforeEach`, add `carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({});` right after the existing `liveHandlers = {};` line's block setup (inside the same `beforeEach`).

Add a new `describe` block, anywhere after the existing top-level tests (e.g. right before `describe('row selection and bulk actions', ...)`):

```jsx
  describe('carrier match badge', () => {
    test('shows no badge when a load has no matches', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({});
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      expect(screen.queryByRole('button', { name: /carriers match/i })).not.toBeInTheDocument();
    });

    test('shows a colored badge with the match count when matches exist', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({ [SAMPLE_LOAD.id]: { tier: 'perfect', count: 3 } });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      expect(carrierMatchesApi.bulkCarrierMatches).toHaveBeenCalledWith([SAMPLE_LOAD.id]);
      expect(screen.getByRole('button', { name: /3 carriers match/i })).toBeInTheDocument();
    });

    test('clicking the badge calls onViewMatches with the load', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({ [SAMPLE_LOAD.id]: { tier: 'strong', count: 2 } });
      const onViewMatches = vi.fn();
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} onViewMatches={onViewMatches} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: /2 carriers match/i }));
      expect(onViewMatches).toHaveBeenCalledWith(SAMPLE_LOAD);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/components/LoadsTable.test.jsx`
Expected: FAIL — the 3 new tests fail (`carrierMatchesApi.bulkCarrierMatches` module doesn't exist yet, or the badge never renders); pre-existing tests still pass once the mock import itself resolves (it won't, since Task 4 already created the module — so only the badge-rendering assertions should fail).

- [ ] **Step 3: Add the badge**

In `frontend/src/components/LoadsTable.jsx`, add the import after the existing `bulkSetIncludeRate` import line:

```js
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../api/loads';
import { bulkCarrierMatches } from '../api/carrierMatches';
```

Add a `MATCH_BADGE_VARIANT` constant near the top of the file, after `STATUS_LABELS`:

```js
const MATCH_BADGE_VARIANT = { perfect: 'success', strong: 'info', weak: 'warning', regional_perfect: 'success', regional: 'default' };
```

Change the component signature:

```js
function LoadsTable({ refreshKey, onSelectLoad, onOpenBlast }) {
```

to:

```js
function LoadsTable({ refreshKey, onSelectLoad, onOpenBlast, onViewMatches }) {
```

Add state after the existing `const [loads, setLoads] = useState([]);` line:

```js
  const [matchInfo, setMatchInfo] = useState({});
```

Add a new effect after the existing loads-fetching `useEffect` (the one with `listLoads(statusFilter)...`), fetching match info whenever the loaded set changes:

```js
  useEffect(() => {
    if (loads.length === 0) {
      setMatchInfo({});
      return;
    }
    let ignore = false;
    bulkCarrierMatches(loads.map((load) => load.id))
      .then((data) => {
        if (!ignore) setMatchInfo(data);
      })
      .catch(() => {
        // Best-effort -- a failed match lookup shouldn't block the table
        // itself from rendering; the badge just doesn't show.
      });
    return () => {
      ignore = true;
    };
  }, [loads]);
```

Add the badge in the load-number cell, after the existing multi-stop badges:

```jsx
                <td className="py-1.5 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span>{load.load_number}</span>
                    {Boolean(load.custom_reply_body) && <Badge variant="warning">Modified</Badge>}
                    {multiStopTagVariant(load) === 'error' && <Badge variant="error">Needs stops added</Badge>}
                    {multiStopTagVariant(load) === 'info' && <Badge variant="info">Stops added</Badge>}
                    {matchInfo[load.id] && onViewMatches && (
                      <button type="button" onClick={() => onViewMatches(load)} className="cursor-pointer border-0 bg-transparent p-0">
                        <Badge variant={MATCH_BADGE_VARIANT[matchInfo[load.id].tier] || 'default'}>
                          {matchInfo[load.id].count} carrier{matchInfo[load.id].count === 1 ? '' : 's'} match
                        </Badge>
                      </button>
                    )}
                  </div>
                </td>
```

(Replacing the existing `<td className="py-1.5 pr-4"><div className="flex items-center gap-1.5">...</div></td>` block that currently ends right after the `multiStopTagVariant(load) === 'info'` line.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/components/LoadsTable.test.jsx`
Expected: PASS — all tests (existing suite + 3 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LoadsTable.jsx frontend/tests/components/LoadsTable.test.jsx
git commit -m "feat: add per-load carrier match badge"
```

---

## Task 6: `CarrierMapGlobe` component

**Files:**
- Create: `frontend/src/components/CarrierMapGlobe.jsx`
- Test: `frontend/tests/components/CarrierMapGlobe.test.jsx`

Wraps `react-globe.gl`, translating match data into `arcsData`/`pointsData`. `react-globe.gl` is mocked in tests (jsdom has no WebGL context — the real library would throw or hang) so these tests verify the **props passed to it**, not any visual rendering.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/CarrierMapGlobe.test.jsx`:

```jsx
import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import CarrierMapGlobe from '../../src/components/CarrierMapGlobe';

const globeMock = vi.fn(() => <div data-testid="globe-mock" />);
vi.mock('react-globe.gl', () => ({
  default: (props) => globeMock(props),
}));

const FOCUSED_LOAD = { originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 };

describe('CarrierMapGlobe', () => {
  test('renders without a focused load or matches', () => {
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    expect(globeMock).toHaveBeenCalled();
    const props = globeMock.mock.calls[0][0];
    expect(props.arcsData).toEqual([]);
    expect(props.pointsData).toEqual([]);
  });

  test('includes one bold arc for the focused load\'s own lane', () => {
    render(<CarrierMapGlobe focusedLoad={FOCUSED_LOAD} laneMatches={[]} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    const focusedArc = props.arcsData.find((a) => a.isFocusedLoad);
    expect(focusedArc).toBeDefined();
    expect(focusedArc.startLat).toBe(FOCUSED_LOAD.originLat);
    expect(focusedArc.endLat).toBe(FOCUSED_LOAD.destLat);
  });

  test('includes one thinner arc per lane match, colored by tier', () => {
    const laneMatches = [
      { carrierId: 1, carrierName: 'A', tier: 'perfect', originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 },
      { carrierId: 2, carrierName: 'B', tier: 'weak', originLat: 29.7604, originLng: -95.3698, destLat: 25.7617, destLng: -80.1918 },
    ];
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={laneMatches} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    const carrierArcs = props.arcsData.filter((a) => !a.isFocusedLoad);
    expect(carrierArcs).toHaveLength(2);
  });

  test('includes one point per regional match, at its tagged state\'s centroid', () => {
    const regionalMatches = [
      { carrierId: 9, carrierName: 'Regional Co', tier: 'regional', stateCentroids: [{ state: 'TX', lat: 31.0, lng: -100.0 }] },
    ];
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={regionalMatches} />);
    const props = globeMock.mock.calls[0][0];
    expect(props.pointsData).toHaveLength(1);
    expect(props.pointsData[0].lat).toBe(31.0);
  });

  test('calls onSelectCarrier when a point representing a lane-matched carrier arc is clicked', () => {
    const laneMatches = [{ carrierId: 1, carrierName: 'A', tier: 'perfect', originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 }];
    const onSelectCarrier = vi.fn();
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={laneMatches} regionalMatches={[]} onSelectCarrier={onSelectCarrier} />);
    const props = globeMock.mock.calls[0][0];
    props.onArcClick(props.arcsData[0]);
    expect(onSelectCarrier).toHaveBeenCalledWith(1);
  });

  test('renders no globeImageUrl (stylized dark sphere, not a fabricated texture URL)', () => {
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    expect(props.globeImageUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/components/CarrierMapGlobe.test.jsx`
Expected: FAIL — cannot resolve `../../src/components/CarrierMapGlobe`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/CarrierMapGlobe.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

const TIER_COLOR = {
  perfect: '#15803d',
  strong: '#1d4ed8',
  weak: '#92600c',
  regional_perfect: '#15803d',
  regional: '#6b7280',
};

// Wraps react-globe.gl, translating match data (see carrierMatching.js on
// the backend) into the arcs/points that library expects. No globeImageUrl
// is set -- per the library's own documented fallback ("If no image is
// provided, the globe is represented as a black sphere"), omitting it
// avoids depending on an external texture URL while still looking
// intentional (a dark sphere + colored atmosphere glow), rather than
// guessing at a CDN link.
function CarrierMapGlobe({ focusedLoad, laneMatches, regionalMatches, onSelectCarrier }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 600, height: 500 });

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: Math.max(400, entry.contentRect.height) });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const arcsData = [];
  if (focusedLoad) {
    arcsData.push({
      isFocusedLoad: true,
      startLat: focusedLoad.originLat,
      startLng: focusedLoad.originLng,
      endLat: focusedLoad.destLat,
      endLng: focusedLoad.destLng,
    });
  }
  laneMatches.forEach((match) => {
    arcsData.push({
      isFocusedLoad: false,
      carrierId: match.carrierId,
      tier: match.tier,
      startLat: match.originLat,
      startLng: match.originLng,
      endLat: match.destLat,
      endLng: match.destLng,
    });
  });

  const pointsData = [];
  regionalMatches.forEach((match) => {
    (match.stateCentroids || []).forEach((centroid) => {
      pointsData.push({
        carrierId: match.carrierId,
        tier: match.tier,
        lat: centroid.lat,
        lng: centroid.lng,
        label: `${match.carrierName} — ${centroid.state}`,
      });
    });
  });

  return (
    <div ref={containerRef} className="h-full w-full">
      <Globe
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor="#d7ff3d"
        atmosphereAltitude={0.18}
        arcsData={arcsData}
        arcStartLat={(d) => d.startLat}
        arcStartLng={(d) => d.startLng}
        arcEndLat={(d) => d.endLat}
        arcEndLng={(d) => d.endLng}
        arcColor={(d) => (d.isFocusedLoad ? '#d7ff3d' : TIER_COLOR[d.tier] || '#6b7280')}
        arcStroke={(d) => (d.isFocusedLoad ? 1 : 0.5)}
        arcDashLength={(d) => (d.isFocusedLoad ? 0.4 : 0.6)}
        arcDashGap={(d) => (d.isFocusedLoad ? 0.15 : 0.3)}
        arcDashAnimateTime={(d) => (d.isFocusedLoad ? 1800 : 0)}
        onArcClick={(arc) => {
          if (!arc.isFocusedLoad && onSelectCarrier) onSelectCarrier(arc.carrierId);
        }}
        pointsData={pointsData}
        pointLat={(d) => d.lat}
        pointLng={(d) => d.lng}
        pointColor={(d) => TIER_COLOR[d.tier] || '#6b7280'}
        pointRadius={0.6}
        pointLabel={(d) => d.label}
        onPointClick={(point) => {
          if (onSelectCarrier) onSelectCarrier(point.carrierId);
        }}
      />
    </div>
  );
}

export default CarrierMapGlobe;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/components/CarrierMapGlobe.test.jsx`
Expected: PASS — all 6 tests. (`ResizeObserver` isn't implemented in jsdom by default; if this errors with `ResizeObserver is not defined`, add a minimal mock at the top of the test file, before the component import: `global.ResizeObserver = class { observe() {} disconnect() {} };` — this is a test-environment shim only, not a runtime dependency change.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CarrierMapGlobe.jsx frontend/tests/components/CarrierMapGlobe.test.jsx
git commit -m "feat: add CarrierMapGlobe component"
```

---

## Task 7: Backend support for state centroids and per-load coordinates

**Files:**
- Modify: `backend/src/routes/carrierMatches.js`
- Modify: `backend/tests/carrierMatches.test.js`

The frontend globe needs: (a) the *coordinates* of each lane match (Task 3's response only carries distances/tiers, not lat/lng — add them), and (b) a geocoded centroid per regional match's tagged state (for the points layer).

- [ ] **Step 1: Write the failing tests**

In `backend/tests/carrierMatches.test.js`, add inside `describe('POST / (manual lane)', ...)`, after the `'returns lane matches for a manually-entered lane'` test:

```js
    test('lane matches include origin/destination coordinates for the globe', async () => {
      await makeCarrierWithHistory();
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.body.laneMatches[0].originLat).toBeCloseTo(FORT_WORTH.lat, 2);
      expect(res.body.laneMatches[0].originLng).toBeCloseTo(FORT_WORTH.lng, 2);
      expect(res.body.laneMatches[0].destLat).toBeCloseTo(CHICAGO.lat, 2);
    });

    test('regional matches include a geocoded centroid per tagged state', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name, operating_states) VALUES (?, 'Regional Co', ?)", [userId, JSON.stringify(['TX'])]);
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.body.regionalMatches[0].stateCentroids).toHaveLength(1);
      expect(res.body.regionalMatches[0].stateCentroids[0].state).toBe('TX');
      expect(typeof res.body.regionalMatches[0].stateCentroids[0].lat).toBe('number');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/carrierMatches.test.js -t "coordinates for the globe|geocoded centroid"`
Expected: FAIL — `originLat`/`stateCentroids` are `undefined` on the response.

- [ ] **Step 3: Add coordinates to lane matches and centroids to regional matches**

In `backend/src/routes/carrierMatches.js`, change the `loadCandidates` history query to also select the lat/lng columns needed (they're already selected via `h.*`-equivalent fields — add them explicitly since `findMatchesForLane` doesn't currently pass them through to its output). Update `backend/src/lib/carrierMatching.js` instead, so the coordinates flow through the existing pure function rather than being bolted on afterward — in `frontend`'s Task 6 shape, `laneMatches` entries need `originLat`/`originLng`/`destLat`/`destLng`. Add them to the match object built in `findMatchesForLane`'s loop:

```js
    if (isBetter) {
      bestByCarrier.set(row.carrier_id, {
        carrierId: row.carrier_id,
        carrierName: row.carrier_company_name,
        historyId: row.id,
        tier: classified.tier,
        originDistanceMiles: classified.originDistanceMiles,
        destDistanceMiles: classified.destDistanceMiles,
        originLat: Number(row.origin_lat),
        originLng: Number(row.origin_lng),
        destLat: row.dest_lat !== null ? Number(row.dest_lat) : null,
        destLng: row.dest_lng !== null ? Number(row.dest_lng) : null,
        equipmentMismatch,
        laneCount: (existing ? existing.laneCount : 0) + 1,
      });
```

(This replaces the existing object literal inside that `if (isBetter) { bestByCarrier.set(...) }` block from Task 2 — same fields as before, plus the four new coordinate fields.)

In `backend/src/routes/carrierMatches.js`, add a helper to geocode each regional match's tagged states and attach centroids, used by both `POST /` and `GET /`:

```js
async function attachStateCentroids(pool, regionalMatches) {
  for (const match of regionalMatches) {
    const centroids = [];
    for (const state of match.taggedStates) {
      const centroid = await geocodeCityState(pool, state, state);
      if (centroid) centroids.push({ state, lat: centroid.lat, lng: centroid.lng });
    }
    match.stateCentroids = centroids;
  }
  return regionalMatches;
}
```

Call it in `POST /` right before `res.json(result)`:

```js
    const result = findMatchesForLane({ ...lane, equipment: equipment || null, historyRows, regionalCarriers });
    result.regionalMatches = await attachStateCentroids(pool, result.regionalMatches);
    res.json(result);
```

And identically in `GET /` (same two lines, replacing its own `res.json(result)`).

- [ ] **Step 4: Run the carrierMatching and carrierMatches tests to verify they pass**

Run: `cd backend && npx jest tests/lib/carrierMatching.test.js tests/carrierMatches.test.js`
Expected: PASS — all tests (the Task 2 tests still pass since the new coordinate fields are additive, not replacing anything they assert on).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/carrierMatching.js backend/src/routes/carrierMatches.js backend/tests/carrierMatches.test.js
git commit -m "feat: include coordinates and state centroids in carrier match responses"
```

---

## Task 8: `CarrierMapPage`

**Files:**
- Create: `frontend/src/pages/CarrierMapPage.jsx`
- Test: `frontend/tests/pages/CarrierMapPage.test.jsx`

The tab's page: a translucent lane-search bar, a side list of matches (split lane vs. regional, per the matching algorithm's own grouping), the globe, and a `CarrierSheet` opened for the selected carrier's detail (reusing Phase 2's component rather than building a duplicate detail view).

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/pages/CarrierMapPage.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierMapPage from '../../src/pages/CarrierMapPage';
import * as carrierMatchesApi from '../../src/api/carrierMatches';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carrierMatches');
vi.mock('../../src/api/carriers');
vi.mock('../../src/components/CarrierMapGlobe', () => ({
  default: () => <div data-testid="globe-mock" />,
}));

const FOCUSED_LOAD = { id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', origin_lat: 32.7767, origin_lng: -96.797, dest_lat: 41.8781, dest_lng: -87.6298 };

describe('CarrierMapPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('with no focused load, shows the manual lane search form', () => {
    render(<CarrierMapPage focusedLoad={null} />);
    expect(screen.getByLabelText(/origin city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination city/i)).toBeInTheDocument();
  });

  test('with a focused load, fetches and lists its matches automatically', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originDistanceMiles: 10 }],
      regionalMatches: [],
    });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);

    await waitFor(() => {
      expect(carrierMatchesApi.getCarrierMatchesForLoad).toHaveBeenCalledWith(1);
    });
    expect(screen.getByText('ABC Trucking')).toBeInTheDocument();
  });

  test('submitting the manual lane search calls searchCarrierMatches and lists results', async () => {
    carrierMatchesApi.searchCarrierMatches.mockResolvedValue({
      laneMatches: [{ carrierId: 2, carrierName: 'Regional Trucking', tier: 'strong', originDistanceMiles: 40 }],
      regionalMatches: [],
    });
    render(<CarrierMapPage focusedLoad={null} />);

    fireEvent.change(screen.getByLabelText(/origin city/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/origin state/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/destination city/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/destination state/i), { target: { value: 'IL' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(carrierMatchesApi.searchCarrierMatches).toHaveBeenCalledWith(expect.objectContaining({
        originCity: 'Dallas', originState: 'TX', destCity: 'Chicago', destState: 'IL',
      }));
    });
    expect(screen.getByText('Regional Trucking')).toBeInTheDocument();
  });

  test('lists regional matches in a separate group from lane matches', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'Lane Co', tier: 'strong', originDistanceMiles: 40 }],
      regionalMatches: [{ carrierId: 2, carrierName: 'Region Co', tier: 'regional', taggedStates: ['TX'] }],
    });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);

    await waitFor(() => screen.getByText('Lane Co'));
    expect(screen.getByText('Region Co')).toBeInTheDocument();
    expect(screen.getByText(/no booked lanes/i)).toBeInTheDocument();
  });

  test('clicking a matched carrier opens its detail sheet', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originDistanceMiles: 10 }],
      regionalMatches: [],
    });
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByText('ABC Trucking'));
    expect(screen.getByText(/^edit ABC Trucking$/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/pages/CarrierMapPage.test.jsx`
Expected: FAIL — cannot resolve `../../src/pages/CarrierMapPage`.

- [ ] **Step 3: Write the page**

Create `frontend/src/pages/CarrierMapPage.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { getCarrierMatchesForLoad, searchCarrierMatches } from '../api/carrierMatches';
import CarrierMapGlobe from '../components/CarrierMapGlobe';
import CarrierSheet from '../components/CarrierSheet';
import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import Badge from '../components/Badge';

const TIER_BADGE_VARIANT = { perfect: 'success', strong: 'info', weak: 'warning', regional_perfect: 'success', regional: 'default' };
const TIER_LABEL = { perfect: 'Perfect match', strong: 'Strong match', weak: 'Weak match (deadhead)', regional_perfect: 'Regional (both ends)', regional: 'Regional' };

function blankLane() {
  return { originCity: '', originState: '', destCity: '', destState: '' };
}

// The Carrier Map tab: a manual lane-search form (used when there's no
// focused load) or an automatic lookup for a load's own lane (when
// deep-linked here from a load's match badge -- see LoadsTable.jsx), the
// globe visualization, and a ranked side list. Clicking a matched carrier
// opens Phase 2's CarrierSheet for full detail rather than a duplicate
// view.
function CarrierMapPage({ focusedLoad }) {
  const [lane, setLane] = useState(blankLane());
  const [laneMatches, setLaneMatches] = useState([]);
  const [regionalMatches, setRegionalMatches] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!focusedLoad) return;
    setStatus('loading');
    setError(null);
    getCarrierMatchesForLoad(focusedLoad.id)
      .then((data) => {
        if (isMountedRef.current) {
          setLaneMatches(data.laneMatches);
          setRegionalMatches(data.regionalMatches);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load matches.');
          setStatus('error');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedLoad?.id]);

  function handleSearch() {
    setError(null);
    if (!lane.originCity.trim() || !lane.originState.trim() || !lane.destCity.trim() || !lane.destState.trim()) {
      setError('Origin and destination city/state are required.');
      return;
    }
    setStatus('loading');
    searchCarrierMatches({
      originCity: lane.originCity.trim(), originState: lane.originState.trim(),
      destCity: lane.destCity.trim(), destState: lane.destState.trim(),
    })
      .then((data) => {
        if (isMountedRef.current) {
          setLaneMatches(data.laneMatches);
          setRegionalMatches(data.regionalMatches);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to search for matches.');
          setStatus('error');
        }
      });
  }

  function handleSelectCarrier(carrierId) {
    const match = laneMatches.find((m) => m.carrierId === carrierId) || regionalMatches.find((m) => m.carrierId === carrierId);
    if (match) setSelectedCarrier({ id: carrierId, company_name: match.carrierName });
  }

  const globeFocusedLoad = focusedLoad
    ? { originLat: focusedLoad.origin_lat, originLng: focusedLoad.origin_lng, destLat: focusedLoad.dest_lat, destLng: focusedLoad.dest_lng }
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="flex flex-col gap-4">
        {!focusedLoad && (
          <div className="rounded-2xl border border-border bg-surface-alt/60 p-3 backdrop-blur-xl">
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                aria-label="Origin city"
                placeholder="Origin city"
                value={lane.originCity}
                onChange={(e) => setLane((prev) => ({ ...prev, originCity: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
              <input
                aria-label="Origin state"
                placeholder="Origin state"
                value={lane.originState}
                onChange={(e) => setLane((prev) => ({ ...prev, originState: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
              <input
                aria-label="Destination city"
                placeholder="Destination city"
                value={lane.destCity}
                onChange={(e) => setLane((prev) => ({ ...prev, destCity: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
              <input
                aria-label="Destination state"
                placeholder="Destination state"
                value={lane.destState}
                onChange={(e) => setLane((prev) => ({ ...prev, destState: e.target.value }))}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              />
            </div>
            <div className="flex justify-end">
              <PrimaryButton onClick={handleSearch} disabled={status === 'loading'} className="px-4 py-1.5 text-xs">
                {status === 'loading' ? 'Searching...' : 'Search'}
              </PrimaryButton>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <div className="h-[500px] w-full">
          <CarrierMapGlobe
            focusedLoad={globeFocusedLoad}
            laneMatches={laneMatches}
            regionalMatches={regionalMatches}
            onSelectCarrier={handleSelectCarrier}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-text">Matched carriers</h2>
        {laneMatches.length === 0 && regionalMatches.length === 0 && (
          <p className="text-sm text-text-muted">
            {status === 'loading' ? 'Searching...' : 'No matches yet.'}
          </p>
        )}
        {laneMatches.length > 0 && (
          <ul className="mb-4 space-y-2">
            {laneMatches.map((match) => (
              <li key={match.carrierId}>
                <button
                  type="button"
                  onClick={() => handleSelectCarrier(match.carrierId)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-left text-sm hover:bg-border"
                >
                  <span className="font-medium text-text">{match.carrierName}</span>
                  <Badge variant={TIER_BADGE_VARIANT[match.tier] || 'default'}>
                    {TIER_LABEL[match.tier] || match.tier} — {Math.round(match.originDistanceMiles)}mi
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        {regionalMatches.length > 0 && (
          <>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">No booked lanes — tagged region</p>
            <ul className="space-y-2">
              {regionalMatches.map((match) => (
                <li key={match.carrierId}>
                  <button
                    type="button"
                    onClick={() => handleSelectCarrier(match.carrierId)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-left text-sm hover:bg-border"
                  >
                    <span className="font-medium text-text">{match.carrierName}</span>
                    <Badge variant={TIER_BADGE_VARIANT[match.tier] || 'default'}>{(match.taggedStates || []).join(', ')}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <AnimatePresence>
        {selectedCarrier && (
          <CarrierSheet carrier={selectedCarrier} onClose={() => setSelectedCarrier(null)} onSaved={() => setSelectedCarrier(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default CarrierMapPage;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/pages/CarrierMapPage.test.jsx`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CarrierMapPage.jsx frontend/tests/pages/CarrierMapPage.test.jsx
git commit -m "feat: add CarrierMapPage"
```

---

## Task 9: Deep-link from a load's badge into the Carrier Map

**Files:**
- Modify: `frontend/src/pages/MainToolPage.jsx`
- Modify: `frontend/tests/pages/MainToolPage.test.jsx`

Replaces Task 8 of Phase 2's plain `<CarriersPanel />` Carrier Map... no — replaces the Carrier Map tab's content (currently `CarriersPanel`, unrelated) is NOT touched; this adds `CarrierMapPage` as a **new**, second destination. Re-examine naming: Phase 2 built a **"Carriers" tab** (`CarriersPanel` — manage carrier profiles). This phase's **"Carrier Map"** is a distinct feature. To avoid a confusing pair of near-identical nav items, this task folds the map INTO the existing Carriers tab as a sub-view, switched via clicking a load's badge, rather than adding a fourth top-level tab.

- [ ] **Step 1: Write the failing test**

In `frontend/tests/pages/MainToolPage.test.jsx`, add near the top:

```jsx
import * as carrierMatchesApi from '../../src/api/carrierMatches';

vi.mock('../../src/api/carrierMatches');
```

(Add the import alongside the existing `carriersApi` import, and the `vi.mock` call alongside the existing `vi.mock('../../src/api/carriers');` line.)

In the `beforeEach`, add `carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({});` next to the existing `carriersApi.listCarriers.mockResolvedValue([]);` line.

Add a new test after the existing `'switches to the Carriers tab and renders the carriers panel'` test:

```jsx

  test('clicking a load\'s carrier-match badge switches to Carriers with that load focused', async () => {
    const load = {
      id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
    };
    loadsApi.listLoads.mockResolvedValue([load]);
    carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({ [load.id]: { tier: 'perfect', count: 1 } });
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({ laneMatches: [], regionalMatches: [] });
    renderPage({ username: 'admin', onLogout: vi.fn() });

    await waitFor(() => screen.getByRole('button', { name: /1 carrier.* match/i }));
    fireEvent.click(screen.getByRole('button', { name: /1 carrier.* match/i }));

    await waitFor(() => {
      expect(carrierMatchesApi.getCarrierMatchesForLoad).toHaveBeenCalledWith(1);
    });
    expect(screen.getByText(/^carriers$/i, { selector: 'h2' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/pages/MainToolPage.test.jsx`
Expected: FAIL — the new test fails (`onViewMatches` isn't wired to `LoadsTable` yet, so the badge click does nothing); pre-existing tests still pass.

- [ ] **Step 3: Wire the deep-link**

In `frontend/src/pages/MainToolPage.jsx`, add the import after the existing `CarriersPanel` import:

```js
import CarriersPanel from '../components/CarriersPanel';
import CarrierMapPage from './CarrierMapPage';
```

Add state after the existing `const [blastTarget, setBlastTarget] = useState(null);` line:

```js
  const [focusedMatchLoad, setFocusedMatchLoad] = useState(null);
```

Add a handler near the existing `handleSaved`/`handleLoadCreated` functions:

```js
  function handleViewMatches(load) {
    setFocusedMatchLoad(load);
    setTab('carriers');
  }
```

Pass the new prop to `LoadsTable`:

```jsx
              <LoadsTable
                refreshKey={refreshKey}
                onSelectLoad={setSelectedLoad}
                onOpenBlast={(load, showRate) => setBlastTarget({ load, showRate })}
                onViewMatches={handleViewMatches}
              />
```

Replace the Carriers tab block's content:

```jsx
          {tab === 'carriers' && (
            <motion.main key="carriers" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
              <CarriersPanel />
            </motion.main>
          )}
```

with:

```jsx
          {tab === 'carriers' && (
            <motion.main key="carriers" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
              {focusedMatchLoad ? (
                <>
                  <SecondaryButton onClick={() => setFocusedMatchLoad(null)} className="px-4 py-2 text-xs">
                    ← Back to carrier list
                  </SecondaryButton>
                  <CarrierMapPage focusedLoad={focusedMatchLoad} />
                </>
              ) : (
                <CarriersPanel />
              )}
            </motion.main>
          )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run tests/pages/MainToolPage.test.jsx`
Expected: PASS — all tests (13 existing + 1 new = 14).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MainToolPage.jsx frontend/tests/pages/MainToolPage.test.jsx
git commit -m "feat: deep-link a load's match badge into the Carrier Map"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npx jest --runInBand`
Expected: PASS on every suite except the 3 pre-existing, already-known-broken `emailPoller.test.js` failures. If any *other* suite fails, stop and fix before proceeding.

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS on every suite except the 4 pre-existing, already-known-broken tests (`tests/App.test.jsx` x3, `tests/components/DateRangeField.test.jsx` x1). If any *other* suite fails, stop and fix before proceeding.

- [ ] **Step 3: Verify the production build succeeds**

Run: `cd frontend && npm run build`
Expected: builds successfully (this is the one check that would catch a `react-globe.gl` import/bundling problem that unit tests, which mock the library, cannot). Delete the `dist/` output afterward (`rm -rf dist`) — it's a build artifact, not something to commit.

- [ ] **Step 4: Manual smoke check**

Run: `cd frontend && npm run dev`
Open the app. On the Loads tab, if any load shows a colored "N carriers match" badge, click it — confirm it switches to Carriers with a globe rendered and a back button. On the Carriers tab (no focused load), confirm the manual lane-search form appears and searching shows results (or "No matches yet" if you have no carrier history logged). Stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit and push**

```bash
git push origin master
```

(No new files to add in this task — Steps 1-4 are verification only.)

---

## What's next

Phase 4 (remaining app restyle — carrying Phase 1's selection-mode/sheet/translucency language to the Loads table's own bulk-select and the remaining modals) gets its own plan document once this one ships.
