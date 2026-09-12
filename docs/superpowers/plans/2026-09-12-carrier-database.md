# Carrier Database (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the carrier database itself — schema, geocoding, a standalone Carriers tab for adding/editing carriers and their lane history, and a hook in the booking flow that logs a carrier the moment a load is marked Booked.

**Architecture:** Two new tables (`carriers`, `carrier_lane_history`) plus a `geocode_cache` table and cached lat/lng columns on `loads`, following the existing idempotent-migration convention in `setup-db.js`. A new `backend/src/routes/carriers.js` exposes CRUD + find-or-create dedup (by MC number, falling back to company name) + lane-history endpoints, geocoding each lane once via `backend/src/lib/geocoding.js` (Google Maps Geocoding API, cached) and storing the coordinates directly on the row. Frontend gets a new "Carriers" tab (`CarriersPanel.jsx` + `CarrierSheet.jsx`, built on Phase 1's `BottomSheet`) and a `BookingCarrierFields.jsx` section shown inline in `RateModal.jsx` when a load's status is set to "booked".

**Tech Stack:** Node's built-in `fetch` (Node 24, no new HTTP client dependency needed) for the Google Maps Geocoding API call. Everything else uses the existing stack (Express, mysql2, React, Vitest/Jest) — no new npm packages in this phase.

**Source spec:** `docs/superpowers/specs/2026-09-12-carrier-database-and-design-system.md`, Phase 2 section.

**Prerequisite:** Phase 1 (`docs/superpowers/plans/2026-09-12-design-system-foundation.md`) must be complete — this phase's UI is built on `BottomSheet`.

**Local DB for verification:** These steps assume a MySQL instance reachable via the backend's `.env` (`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_NAME_TEST`). Run `cd backend && npm run setup-db` once before Task 1's tests to apply the schema/migrations up through this plan's new ones (Task 1 adds the new migrations that command picks up).

---

## Task 1: Database schema

**Files:**
- Modify: `backend/scripts/setup-db.js`

No automated test for this task specifically — its correctness is exercised by every later task's integration tests, which fail immediately if a table/column is missing.

- [ ] **Step 1: Add the new tables and columns**

In `backend/scripts/setup-db.js`, inside `migrateSchema(databaseName)`, insert the following immediately before the closing `await conn.end();` of that function (i.e. right after the existing `replyColumns` loop's closing `}`):

```js
  await conn.query(`
    CREATE TABLE IF NOT EXISTS carriers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      mc_number VARCHAR(20) NULL,
      company_name VARCHAR(255) NOT NULL,
      dispatcher_name VARCHAR(255) NULL,
      dispatcher_phone VARCHAR(30) NULL,
      equipment_types JSON NULL,
      equipment_notes TEXT NULL,
      operating_states JSON NULL,
      operating_notes TEXT NULL,
      comment TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_carriers_user_mc (user_id, mc_number),
      INDEX idx_carriers_user_company (user_id, company_name)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS carrier_lane_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      carrier_id INT NOT NULL,
      user_id INT NOT NULL,
      load_id INT NULL,
      origin_city VARCHAR(255) NOT NULL,
      origin_state VARCHAR(2) NOT NULL,
      origin_lat DECIMAL(9,6) NULL,
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
      INDEX idx_history_user (user_id),
      INDEX idx_history_carrier (carrier_id),
      CONSTRAINT fk_history_carrier FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS geocode_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      city_state_key VARCHAR(255) NOT NULL UNIQUE,
      lat DECIMAL(9,6) NOT NULL,
      lng DECIMAL(9,6) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const loadsGeoColumns = [
    ['origin_lat', `ALTER TABLE loads ADD COLUMN origin_lat DECIMAL(9,6) NULL`],
    ['origin_lng', `ALTER TABLE loads ADD COLUMN origin_lng DECIMAL(9,6) NULL`],
    ['dest_lat', `ALTER TABLE loads ADD COLUMN dest_lat DECIMAL(9,6) NULL`],
    ['dest_lng', `ALTER TABLE loads ADD COLUMN dest_lng DECIMAL(9,6) NULL`],
  ];
  for (const [columnName, alterSql] of loadsGeoColumns) {
    const [col] = await conn.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = ?`,
      [databaseName, columnName]
    );
    if (col[0].count === 0) {
      await conn.query(alterSql);
    }
  }
```

- [ ] **Step 2: Apply the migration**

Run: `cd backend && npm run setup-db`
Expected: `Database setup complete.` with no errors. (If `Admin user "..." already exists, skipping` prints instead of `Created admin user`, that's fine — it means this database already existed from earlier work.)

- [ ] **Step 3: Verify the tables exist**

Run: `cd backend && node -e "require('dotenv').config(); const mysql=require('mysql2/promise'); mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME_TEST}).then(async c=>{const [r]=await c.query(\"SHOW TABLES LIKE 'carrier%'\"); console.log(r); await c.end();})"`
Expected: an array listing `carriers` and `carrier_lane_history` (and `geocode_cache` won't match the `carrier%` pattern — that's fine, it's checked implicitly by Task 2's tests).

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/setup-db.js
git commit -m "feat: add carriers, carrier_lane_history, and geocode_cache tables"
```

---

## Task 2: Geocoding with caching

**Files:**
- Create: `backend/src/lib/geocoding.js`
- Test: `backend/tests/lib/geocoding.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/lib/geocoding.test.js`:

```js
require('dotenv').config();
const { geocodeCityState } = require('../../src/lib/geocoding');
const { createTestPool } = require('../setupTestDb');

describe('geocodeCityState', () => {
  let pool;
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = global.fetch;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM geocode_cache');
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
    global.fetch = jest.fn();
  });

  test('calls the Google Maps API and caches the result on a cache miss', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ results: [{ geometry: { location: { lat: 32.7767, lng: -96.797 } } }] }),
    });

    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    expect(result).toEqual({ lat: 32.7767, lng: -96.797 });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [cached] = await pool.query('SELECT * FROM geocode_cache WHERE city_state_key = ?', ['dallas|tx']);
    expect(cached).toHaveLength(1);
  });

  test('skips the API call on a cache hit', async () => {
    await pool.query('INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?)', ['dallas|tx', 32.7767, -96.797]);

    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    expect(result).toEqual({ lat: 32.7767, lng: -96.797 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('cache lookup is case-insensitive', async () => {
    await pool.query('INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?)', ['dallas|tx', 32.7767, -96.797]);

    const result = await geocodeCityState(pool, 'DALLAS', 'tx');
    expect(result).toEqual({ lat: 32.7767, lng: -96.797 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null without throwing when the API returns no results', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ results: [] }) });

    const result = await geocodeCityState(pool, 'Nonexistentville', 'ZZ');
    expect(result).toBeNull();
  });

  test('returns null without throwing when the API call itself fails', async () => {
    global.fetch.mockRejectedValue(new Error('network error'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    consoleErrorSpy.mockRestore();
    expect(result).toBeNull();
  });

  test('returns null and does not call the API when GOOGLE_MAPS_API_KEY is not set', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null for a blank city and state without querying the API', async () => {
    const result = await geocodeCityState(pool, '', '');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/lib/geocoding.test.js`
Expected: FAIL — cannot find module `../../src/lib/geocoding`.

- [ ] **Step 3: Write the module**

Create `backend/src/lib/geocoding.js`:

```js
// Resolves a city/state pair to {lat, lng} via the Google Maps Geocoding
// API, caching every result in the geocode_cache table so the same city is
// never geocoded twice -- a 300-load CSV upload that mostly repeats a
// handful of origin cities costs at most a few dozen live API calls, not
// hundreds. Returns null (never throws) on a failed or ambiguous lookup --
// a bad or unusual city name must degrade to "this lane can't be matched
// yet," never crash a save.
async function geocodeCityState(pool, city, state) {
  const key = `${String(city || '').trim().toLowerCase()}|${String(state || '').trim().toLowerCase()}`;
  if (key === '|') return null;

  const [cached] = await pool.query('SELECT lat, lng FROM geocode_cache WHERE city_state_key = ?', [key]);
  if (cached.length > 0) {
    return { lat: Number(cached[0].lat), lng: Number(cached[0].lng) };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const result = data.results && data.results[0];
    if (!result) return null;
    const { lat, lng } = result.geometry.location;

    await pool.query(
      'INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)',
      [key, lat, lng]
    );
    return { lat, lng };
  } catch (err) {
    console.error(`Failed to geocode "${city}, ${state}":`, err);
    return null;
  }
}

module.exports = { geocodeCityState };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/lib/geocoding.test.js`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/geocoding.js backend/tests/lib/geocoding.test.js
git commit -m "feat: add geocodeCityState with caching"
```

---

## Task 3: Carriers backend routes

**Files:**
- Create: `backend/src/routes/carriers.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/carriers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/carriers.test.js`:

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('carriers routes', () => {
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
    await pool.query('DELETE FROM geocode_cache');
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = result.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/carriers');
    expect(res.status).toBe(401);
  });

  describe('GET /', () => {
    test('lists only the current user\'s own carriers, alphabetically', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Zebra Logistics')", [userId]);
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses Carrier')", [otherUser.insertId]);

      const res = await agent.get('/api/carriers');
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.company_name)).toEqual(['ABC Trucking', 'Zebra Logistics']);
    });

    test('filters by ?q= across company name, MC number, and dispatcher name', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name, mc_number, dispatcher_name) VALUES (?, 'ABC Trucking', '123456', 'John Doe')", [userId]);
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Zebra Logistics')", [userId]);

      const res = await agent.get('/api/carriers?q=123456');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].company_name).toBe('ABC Trucking');
    });
  });

  describe('POST / (find-or-create)', () => {
    test('creates a new carrier when no match exists', async () => {
      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', mc_number: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.company_name).toBe('ABC Trucking');
      expect(res.body.mc_number).toBe('123456');
    });

    test('returns 400 when company_name is missing or blank', async () => {
      const res1 = await agent.post('/api/carriers').send({});
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/carriers').send({ company_name: '   ' });
      expect(res2.status).toBe(400);
    });

    test('finds an existing carrier by MC number instead of creating a duplicate', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [userId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking Inc', mc_number: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(existing.insertId);

      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carriers WHERE user_id = ?', [userId]);
      expect(rows[0].count).toBe(1);
    });

    test('falls back to a case-insensitive company name match when no MC number is given', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'abc trucking' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(existing.insertId);
    });

    test('a matched carrier is updated with any new fields provided', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [userId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', mc_number: '123456', dispatcher_name: 'Jane Doe' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(existing.insertId);
      expect(res.body.dispatcher_name).toBe('Jane Doe');
    });

    test('stores equipment_types and operating_states as JSON arrays', async () => {
      const res = await agent.post('/api/carriers').send({
        company_name: 'ABC Trucking', equipment_types: ['V', 'R'], operating_states: ['TX', 'OK'],
      });
      expect(res.status).toBe(200);
      expect(res.body.equipment_types).toEqual(['V', 'R']);
      expect(res.body.operating_states).toEqual(['TX', 'OK']);
    });

    test('does not match a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [otherUser.insertId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', mc_number: '123456' });
      expect(res.status).toBe(200);

      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carriers WHERE user_id = ?', [userId]);
      expect(rows[0].count).toBe(1);
    });
  });

  describe('PATCH /:id', () => {
    test('updates the given fields', async () => {
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      const res = await agent.patch(`/api/carriers/${result.insertId}`).send({ dispatcher_phone: '555-1234' });
      expect(res.status).toBe(200);
      expect(res.body.dispatcher_phone).toBe('555-1234');
    });

    test('returns 404 for a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);

      const res = await agent.patch(`/api/carriers/${result.insertId}`).send({ dispatcher_phone: '555-1234' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    test('deletes the carrier', async () => {
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      const res = await agent.delete(`/api/carriers/${result.insertId}`);
      expect(res.status).toBe(200);
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carriers WHERE id = ?', [result.insertId]);
      expect(rows[0].count).toBe(0);
    });

    test('returns 404 for a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);

      const res = await agent.delete(`/api/carriers/${result.insertId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('lane history', () => {
    let carrierId;

    beforeEach(async () => {
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      carrierId = result.insertId;
    });

    test('POST /:id/history creates a lane entry, normalizing city/state casing', async () => {
      const res = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'dallas', origin_state: 'tx', dest_city: 'chicago', dest_state: 'il', rate: 1500,
      });
      expect(res.status).toBe(201);
      expect(res.body.origin_city).toBe('Dallas');
      expect(res.body.origin_state).toBe('TX');
      expect(res.body.dest_city).toBe('Chicago');
      expect(Number(res.body.rate)).toBe(1500);
    });

    test('POST /:id/history returns 400 when origin/destination city or state is missing', async () => {
      const res = await agent.post(`/api/carriers/${carrierId}/history`).send({ origin_city: 'Dallas' });
      expect(res.status).toBe(400);
    });

    test('POST /:id/history returns 404 for a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherCarrier] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);

      const res = await agent.post(`/api/carriers/${otherCarrier.insertId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      expect(res.status).toBe(404);
    });

    test('GET /:id/history lists entries for that carrier only', async () => {
      await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      const res = await agent.get(`/api/carriers/${carrierId}/history`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('PATCH /history/:historyId updates the given fields', async () => {
      const createRes = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      const res = await agent.patch(`/api/carriers/history/${createRes.body.id}`).send({ rate: 2000 });
      expect(res.status).toBe(200);
      expect(Number(res.body.rate)).toBe(2000);
    });

    test('DELETE /history/:historyId removes the entry', async () => {
      const createRes = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      const res = await agent.delete(`/api/carriers/history/${createRes.body.id}`);
      expect(res.status).toBe(200);
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carrier_lane_history WHERE id = ?', [createRes.body.id]);
      expect(rows[0].count).toBe(0);
    });

    test('load_id is stored when provided (the booking-flow hook)', async () => {
      const [loadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L1001', 'Dallas', 'TX', 'Chicago', 'IL', ?, 'booked')",
        [userId]
      );
      const res = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', load_id: loadResult.insertId,
      });
      expect(res.status).toBe(201);
      expect(res.body.load_id).toBe(loadResult.insertId);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/carriers.test.js`
Expected: FAIL — `Cannot GET /api/carriers` (404) or a module-not-found error, since neither the route file nor its `app.js` wiring exist yet.

- [ ] **Step 3: Write the route module**

Create `backend/src/routes/carriers.js`:

```js
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { titleCaseCity, upperState } = require('../lib/normalizeLocation');
const { geocodeCityState } = require('../lib/geocoding');

const CARRIER_FIELDS = [
  'mc_number', 'company_name', 'dispatcher_name', 'dispatcher_phone',
  'equipment_types', 'equipment_notes', 'operating_states', 'operating_notes', 'comment',
];
const JSON_CARRIER_FIELDS = new Set(['equipment_types', 'operating_states']);

function createCarriersRouter(pool) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { q } = req.query;
    const params = [req.session.userId];
    let sql = 'SELECT * FROM carriers WHERE user_id = ?';
    if (q) {
      sql += ' AND (company_name LIKE ? OR mc_number LIKE ? OR dispatcher_name LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY company_name ASC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  }));

  // Finds an existing carrier for this user by MC number (if given),
  // falling back to a case-insensitive company name match, or creates a
  // new one -- so logging the same carrier from different places (the
  // standalone Carriers tab, the booking-flow hook) never creates
  // duplicate carrier identities. Any newly-provided fields are merged
  // into a matched carrier.
  async function findOrCreateCarrier(userId, body, companyName) {
    const mcNumber = body.mc_number ? String(body.mc_number).trim() : null;

    let existing = null;
    if (mcNumber) {
      const [rows] = await pool.query('SELECT * FROM carriers WHERE user_id = ? AND mc_number = ?', [userId, mcNumber]);
      existing = rows[0] || null;
    }
    if (!existing) {
      const [rows] = await pool.query('SELECT * FROM carriers WHERE user_id = ? AND LOWER(company_name) = LOWER(?)', [userId, companyName]);
      existing = rows[0] || null;
    }

    if (existing) {
      const updates = [];
      const values = [];
      for (const field of CARRIER_FIELDS) {
        if (body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(JSON_CARRIER_FIELDS.has(field) ? JSON.stringify(body[field]) : body[field]);
        }
      }
      if (updates.length > 0) {
        values.push(existing.id);
        await pool.query(`UPDATE carriers SET ${updates.join(', ')} WHERE id = ?`, values);
      }
      const [rows] = await pool.query('SELECT * FROM carriers WHERE id = ?', [existing.id]);
      return rows[0];
    }

    const columns = ['user_id', 'company_name'];
    const values = [userId, companyName];
    for (const field of CARRIER_FIELDS) {
      if (field === 'company_name') continue;
      if (body[field] !== undefined) {
        columns.push(field);
        values.push(JSON_CARRIER_FIELDS.has(field) ? JSON.stringify(body[field]) : body[field]);
      }
    }
    const placeholders = columns.map(() => '?').join(', ');
    const [result] = await pool.query(`INSERT INTO carriers (${columns.join(', ')}) VALUES (${placeholders})`, values);
    const [rows] = await pool.query('SELECT * FROM carriers WHERE id = ?', [result.insertId]);
    return rows[0];
  }

  router.post('/', asyncHandler(async (req, res) => {
    const companyName = String(req.body.company_name || '').trim();
    if (!companyName) {
      return res.status(400).json({ error: 'company_name is required' });
    }
    const carrier = await findOrCreateCarrier(req.session.userId, req.body, companyName);
    res.json(carrier);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const [existingRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    const updates = [];
    const values = [];
    for (const field of CARRIER_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(JSON_CARRIER_FIELDS.has(field) ? JSON.stringify(req.body[field]) : req.body[field]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    values.push(req.params.id);
    await pool.query(`UPDATE carriers SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM carriers WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const [existingRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    await pool.query('DELETE FROM carriers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }));

  router.get('/:id/history', asyncHandler(async (req, res) => {
    const [carrierRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (carrierRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    const [rows] = await pool.query('SELECT * FROM carrier_lane_history WHERE carrier_id = ? ORDER BY ran_at DESC, created_at DESC', [req.params.id]);
    res.json(rows);
  }));

  router.post('/:id/history', asyncHandler(async (req, res) => {
    const [carrierRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (carrierRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    const originCity = titleCaseCity(req.body.origin_city);
    const originState = upperState(req.body.origin_state);
    const destCity = titleCaseCity(req.body.dest_city);
    const destState = upperState(req.body.dest_state);
    if (!originCity || !originState || !destCity || !destState) {
      return res.status(400).json({ error: 'origin_city, origin_state, dest_city, and dest_state are required' });
    }

    const origin = await geocodeCityState(pool, originCity, originState);
    const dest = await geocodeCityState(pool, destCity, destState);

    const [result] = await pool.query(
      `INSERT INTO carrier_lane_history
       (carrier_id, user_id, load_id, origin_city, origin_state, origin_lat, origin_lng,
        dest_city, dest_state, dest_lat, dest_lng, rate, driver_name, driver_phone, comment, ran_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, req.session.userId, req.body.load_id || null,
        originCity, originState, origin ? origin.lat : null, origin ? origin.lng : null,
        destCity, destState, dest ? dest.lat : null, dest ? dest.lng : null,
        req.body.rate ?? null, req.body.driver_name || null, req.body.driver_phone || null,
        req.body.comment || null, req.body.ran_at || null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM carrier_lane_history WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  }));

  router.patch('/history/:historyId', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM carrier_lane_history WHERE id = ? AND user_id = ?', [req.params.historyId, req.session.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    const existing = rows[0];

    const updates = [];
    const values = [];

    if (req.body.origin_city !== undefined || req.body.origin_state !== undefined) {
      const originCity = req.body.origin_city !== undefined ? titleCaseCity(req.body.origin_city) : existing.origin_city;
      const originState = req.body.origin_state !== undefined ? upperState(req.body.origin_state) : existing.origin_state;
      const origin = await geocodeCityState(pool, originCity, originState);
      updates.push('origin_city = ?', 'origin_state = ?', 'origin_lat = ?', 'origin_lng = ?');
      values.push(originCity, originState, origin ? origin.lat : null, origin ? origin.lng : null);
    }
    if (req.body.dest_city !== undefined || req.body.dest_state !== undefined) {
      const destCity = req.body.dest_city !== undefined ? titleCaseCity(req.body.dest_city) : existing.dest_city;
      const destState = req.body.dest_state !== undefined ? upperState(req.body.dest_state) : existing.dest_state;
      const dest = await geocodeCityState(pool, destCity, destState);
      updates.push('dest_city = ?', 'dest_state = ?', 'dest_lat = ?', 'dest_lng = ?');
      values.push(destCity, destState, dest ? dest.lat : null, dest ? dest.lng : null);
    }
    for (const field of ['rate', 'driver_name', 'driver_phone', 'comment', 'ran_at']) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    values.push(req.params.historyId);
    await pool.query(`UPDATE carrier_lane_history SET ${updates.join(', ')} WHERE id = ?`, values);
    const [updated] = await pool.query('SELECT * FROM carrier_lane_history WHERE id = ?', [req.params.historyId]);
    res.json(updated[0]);
  }));

  router.delete('/history/:historyId', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT id FROM carrier_lane_history WHERE id = ? AND user_id = ?', [req.params.historyId, req.session.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    await pool.query('DELETE FROM carrier_lane_history WHERE id = ?', [req.params.historyId]);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = createCarriersRouter;
```

- [ ] **Step 4: Wire the router into the app**

In `backend/src/app.js`, add the import after the existing `createInquiriesRouter` import:

```js
const createInquiriesRouter = require('./routes/inquiries');
const createCarriersRouter = require('./routes/carriers');
```

And register the route after the existing `/api/inquiries` line:

```js
  app.use('/api/inquiries', requireAuth, createInquiriesRouter(pool, wsHub));
  app.use('/api/carriers', requireAuth, createCarriersRouter(pool));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/carriers.test.js`
Expected: PASS — all tests (rejects unauthenticated + 3 GET + 7 POST + 2 PATCH + 2 DELETE + 7 lane-history = 22 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/carriers.js backend/src/app.js backend/tests/carriers.test.js
git commit -m "feat: add carriers backend routes (CRUD, dedup, lane history)"
```

---

## Task 4: `US_STATES` shared list

**Files:**
- Create: `frontend/src/lib/usStates.js`

No dedicated test — a static data list, exercised through the components that use it (Task 6's tests).

- [ ] **Step 1: Add the list**

Create `frontend/src/lib/usStates.js`:

```js
// Two-letter USPS state codes (plus DC) -- the vocabulary for a carrier's
// operating_states tag (CarrierSheet.jsx) and, in Phase 3, the state
// polygons highlighted on the Carrier Map for a carrier with no booked
// lane history yet.
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/usStates.js
git commit -m "feat: add US_STATES list"
```

---

## Task 5: Frontend `api/carriers.js`

**Files:**
- Create: `frontend/src/api/carriers.js`

No dedicated test, matching the existing convention (`api/loads.js`/`api/inquiries.js`/`api/gmail.js` are thin wrappers with no test files of their own — exercised through the components that mock and call them).

- [ ] **Step 1: Add the API module**

Create `frontend/src/api/carriers.js`:

```js
import { get, post, patch, del } from './client';

export function listCarriers(query) {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return get(`/api/carriers${q}`);
}

export function createCarrier(data) {
  return post('/api/carriers', data);
}

export function updateCarrier(id, data) {
  return patch(`/api/carriers/${id}`, data);
}

export function deleteCarrier(id) {
  return del(`/api/carriers/${id}`);
}

export function listCarrierHistory(carrierId) {
  return get(`/api/carriers/${carrierId}/history`);
}

export function createCarrierHistory(carrierId, data) {
  return post(`/api/carriers/${carrierId}/history`, data);
}

export function updateCarrierHistory(historyId, data) {
  return patch(`/api/carriers/history/${historyId}`, data);
}

export function deleteCarrierHistory(historyId) {
  return del(`/api/carriers/history/${historyId}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/carriers.js
git commit -m "feat: add carriers API client"
```

---

## Task 6: `CarrierSheet` component

**Files:**
- Create: `frontend/src/components/CarrierSheet.jsx`
- Test: `frontend/tests/components/CarrierSheet.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/CarrierSheet.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierSheet from '../../src/components/CarrierSheet';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');

describe('CarrierSheet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('add mode: requires a company name before saving', () => {
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/company name is required/i);
    expect(carriersApi.createCarrier).not.toHaveBeenCalled();
  });

  test('add mode: creates a carrier with the entered fields and calls onSaved/onClose', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/mc number/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({
        company_name: 'ABC Trucking', mc_number: '123456',
      }));
    });
    expect(onSaved).toHaveBeenCalledWith({ id: 1, company_name: 'ABC Trucking' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('add mode: toggling equipment pills includes them in the saved payload', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.click(screen.getByRole('button', { name: 'V' }));
    fireEvent.click(screen.getByRole('button', { name: 'R' }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ equipment_types: ['V', 'R'] }));
    });
  });

  test('add mode: parses a comma-separated operating-states list into a valid state array', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierSheet carrier={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/operating states/i), { target: { value: 'tx, ok, notarealstate' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ operating_states: ['TX', 'OK'] }));
    });
  });

  test('edit mode: prefills fields from the given carrier and calls updateCarrier on save', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking', mc_number: '123456', equipment_types: ['V'], operating_states: ['TX'] };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.updateCarrier.mockResolvedValue({ ...carrier, dispatcher_name: 'Jane Doe' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/company name/i).value).toBe('ABC Trucking');
    fireEvent.change(screen.getByLabelText(/dispatcher name/i), { target: { value: 'Jane Doe' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(carriersApi.updateCarrier).toHaveBeenCalledWith(5, expect.objectContaining({ dispatcher_name: 'Jane Doe' }));
    });
  });

  test('edit mode: loads and lists existing lane history', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([
      { id: 10, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: '1500.00' },
    ]);
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toBeInTheDocument();
    });
  });

  test('edit mode: adding a lane calls createCarrierHistory and appends it to the list', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 11, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: '1500' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^origin city$/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/^origin state$/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/^destination city$/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/^destination state$/i), { target: { value: 'IL' } });
    fireEvent.click(screen.getByRole('button', { name: /^add lane$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(5, expect.objectContaining({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      }));
    });
    expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toBeInTheDocument();
  });

  test('edit mode: removing a lane calls deleteCarrierHistory and removes it from the list', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([
      { id: 10, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' },
    ]);
    carriersApi.deleteCarrierHistory.mockResolvedValue({ ok: true });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/Dallas, TX.*Chicago, IL/));
    fireEvent.click(screen.getByRole('button', { name: /remove lane/i }));

    await waitFor(() => {
      expect(carriersApi.deleteCarrierHistory).toHaveBeenCalledWith(10);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Dallas, TX.*Chicago, IL/)).not.toBeInTheDocument();
    });
  });

  test('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/components/CarrierSheet.test.jsx`
Expected: FAIL — cannot resolve `../../src/components/CarrierSheet`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/CarrierSheet.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  createCarrier, updateCarrier,
  listCarrierHistory, createCarrierHistory, deleteCarrierHistory,
} from '../api/carriers';
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';
import { US_STATES } from '../lib/usStates';
import BottomSheet from './BottomSheet';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';

function blankToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// Parses a comma/space-separated list of state codes into a deduped array
// of valid two-letter codes, dropping anything that isn't a real state --
// this is what drives Phase 3's globe state-highlight for a carrier with
// no booked lane history yet.
function parseStates(text) {
  const found = String(text || '')
    .toUpperCase()
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => US_STATES.includes(s));
  return [...new Set(found)];
}

function blankHistoryEntry() {
  return { origin_city: '', origin_state: '', dest_city: '', dest_state: '', rate: '', driver_name: '', driver_phone: '', comment: '', ran_at: '' };
}

function CarrierSheet({ carrier, onClose, onSaved }) {
  const isEditing = Boolean(carrier);
  const [companyName, setCompanyName] = useState(carrier?.company_name ?? '');
  const [mcNumber, setMcNumber] = useState(carrier?.mc_number ?? '');
  const [dispatcherName, setDispatcherName] = useState(carrier?.dispatcher_name ?? '');
  const [dispatcherPhone, setDispatcherPhone] = useState(carrier?.dispatcher_phone ?? '');
  const [equipmentTypes, setEquipmentTypes] = useState(() => (Array.isArray(carrier?.equipment_types) ? carrier.equipment_types : []));
  const [equipmentNotes, setEquipmentNotes] = useState(carrier?.equipment_notes ?? '');
  const [operatingStatesText, setOperatingStatesText] = useState(() => (Array.isArray(carrier?.operating_states) ? carrier.operating_states.join(', ') : ''));
  const [operatingNotes, setOperatingNotes] = useState(carrier?.operating_notes ?? '');
  const [comment, setComment] = useState(carrier?.comment ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState(isEditing ? 'loading' : 'n/a');
  const [addingHistory, setAddingHistory] = useState(false);
  const [historyDraft, setHistoryDraft] = useState(blankHistoryEntry());
  const [historyError, setHistoryError] = useState(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    listCarrierHistory(carrier.id)
      .then((data) => {
        if (isMountedRef.current) {
          setHistory(data);
          setHistoryStatus('ready');
        }
      })
      .catch(() => {
        if (isMountedRef.current) setHistoryStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleEquipment(code) {
    setEquipmentTypes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function handleSave() {
    setError(null);
    const trimmedCompany = companyName.trim();
    if (!trimmedCompany) {
      setError('Company name is required.');
      return;
    }

    const payload = {
      company_name: trimmedCompany,
      mc_number: blankToNull(mcNumber),
      dispatcher_name: blankToNull(dispatcherName),
      dispatcher_phone: blankToNull(dispatcherPhone),
      equipment_types: equipmentTypes,
      equipment_notes: blankToNull(equipmentNotes),
      operating_states: parseStates(operatingStatesText),
      operating_notes: blankToNull(operatingNotes),
      comment: blankToNull(comment),
    };

    setSaving(true);
    const request = isEditing ? updateCarrier(carrier.id, payload) : createCarrier(payload);
    request
      .then((saved) => {
        if (isMountedRef.current) {
          onSaved(saved);
          onClose();
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to save the carrier.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setSaving(false);
        }
      });
  }

  function handleAddHistory() {
    setHistoryError(null);
    if (!historyDraft.origin_city.trim() || !historyDraft.origin_state.trim() || !historyDraft.dest_city.trim() || !historyDraft.dest_state.trim()) {
      setHistoryError('Origin and destination city/state are required.');
      return;
    }
    setHistoryBusy(true);
    createCarrierHistory(carrier.id, {
      origin_city: historyDraft.origin_city.trim(),
      origin_state: historyDraft.origin_state.trim(),
      dest_city: historyDraft.dest_city.trim(),
      dest_state: historyDraft.dest_state.trim(),
      rate: blankToNull(historyDraft.rate) === null ? null : Number(historyDraft.rate),
      driver_name: blankToNull(historyDraft.driver_name),
      driver_phone: blankToNull(historyDraft.driver_phone),
      comment: blankToNull(historyDraft.comment),
      ran_at: blankToNull(historyDraft.ran_at),
    })
      .then((created) => {
        if (isMountedRef.current) {
          setHistory((prev) => [created, ...prev]);
          setHistoryDraft(blankHistoryEntry());
          setAddingHistory(false);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setHistoryError(err.message || 'Failed to add the lane.');
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setHistoryBusy(false);
        }
      });
  }

  function handleDeleteHistory(id) {
    deleteCarrierHistory(id).then(() => {
      if (isMountedRef.current) {
        setHistory((prev) => prev.filter((entry) => entry.id !== id));
      }
    });
  }

  return (
    <AnimatePresence>
      <BottomSheet onClose={onClose}>
        <h2 className="mb-4 text-lg font-semibold text-text">{isEditing ? `Edit ${carrier.company_name}` : 'Add a carrier'}</h2>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-company">
              Company name
            </label>
            <input
              id="carrier-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-mc">
              MC number
            </label>
            <input
              id="carrier-mc"
              value={mcNumber}
              onChange={(e) => setMcNumber(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-dispatcher-phone">
              Dispatcher phone
            </label>
            <input
              id="carrier-dispatcher-phone"
              value={dispatcherPhone}
              onChange={(e) => setDispatcherPhone(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-dispatcher-name">
              Dispatcher name
            </label>
            <input
              id="carrier-dispatcher-name"
              value={dispatcherName}
              onChange={(e) => setDispatcherName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Equipment</label>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT_OPTIONS.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => toggleEquipment(option.code)}
                aria-pressed={equipmentTypes.includes(option.code)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  equipmentTypes.includes(option.code) ? 'border-accent bg-accent text-accent-ink' : 'border-border bg-surface-alt text-text-muted'
                }`}
              >
                {option.code}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-equipment-notes">
            Equipment notes
          </label>
          <textarea
            id="carrier-equipment-notes"
            value={equipmentNotes}
            onChange={(e) => setEquipmentNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-operating-states">
            Operating states (comma-separated, e.g. TX, OK, AR)
          </label>
          <input
            id="carrier-operating-states"
            value={operatingStatesText}
            onChange={(e) => setOperatingStatesText(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-operating-notes">
            Where they operate (notes)
          </label>
          <textarea
            id="carrier-operating-notes"
            value={operatingNotes}
            onChange={(e) => setOperatingNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="carrier-comment">
            Comment
          </label>
          <textarea
            id="carrier-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        {isEditing && (
          <div className="mb-4 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Lane history</label>
              {!addingHistory && (
                <button type="button" onClick={() => setAddingHistory(true)} className="text-xs font-medium text-accent hover:underline">
                  + Add a lane
                </button>
              )}
            </div>

            {historyStatus === 'loading' && <p className="text-sm text-text-muted">Loading...</p>}
            {historyStatus === 'ready' && history.length === 0 && !addingHistory && (
              <p className="text-sm text-text-muted">No lanes logged yet.</p>
            )}
            <ul className="space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
                  <span>
                    {entry.origin_city}, {entry.origin_state} → {entry.dest_city}, {entry.dest_state}
                    {entry.rate ? ` — $${Number(entry.rate).toLocaleString()}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteHistory(entry.id)}
                    aria-label={`Remove lane ${entry.origin_city}, ${entry.origin_state} to ${entry.dest_city}, ${entry.dest_state}`}
                    className="text-xs text-error hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            {addingHistory && (
              <div className="mt-3 rounded-lg border border-border p-3">
                {historyError && (
                  <p role="alert" className="mb-2 text-xs text-error">
                    {historyError}
                  </p>
                )}
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input
                    aria-label="Origin city"
                    placeholder="Origin city"
                    value={historyDraft.origin_city}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, origin_city: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Origin state"
                    placeholder="Origin state"
                    value={historyDraft.origin_state}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, origin_state: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Destination city"
                    placeholder="Destination city"
                    value={historyDraft.dest_city}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, dest_city: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Destination state"
                    placeholder="Destination state"
                    value={historyDraft.dest_state}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, dest_state: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Rate"
                    placeholder="Rate"
                    value={historyDraft.rate}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, rate: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Date"
                    type="date"
                    value={historyDraft.ran_at}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, ran_at: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Driver name"
                    placeholder="Driver name (optional)"
                    value={historyDraft.driver_name}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, driver_name: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <input
                    aria-label="Driver phone"
                    placeholder="Driver phone (optional)"
                    value={historyDraft.driver_phone}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, driver_phone: e.target.value }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                </div>
                <textarea
                  aria-label="Lane comment"
                  placeholder="Comment (optional)"
                  value={historyDraft.comment}
                  onChange={(e) => setHistoryDraft((prev) => ({ ...prev, comment: e.target.value }))}
                  rows={2}
                  className="mb-2 w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                />
                <div className="flex justify-end gap-2">
                  <SecondaryButton
                    onClick={() => {
                      setAddingHistory(false);
                      setHistoryDraft(blankHistoryEntry());
                      setHistoryError(null);
                    }}
                    className="px-3 py-1 text-xs"
                  >
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton onClick={handleAddHistory} disabled={historyBusy} className="px-3 py-1 text-xs">
                    {historyBusy ? 'Adding...' : 'Add lane'}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </PrimaryButton>
        </div>
      </BottomSheet>
    </AnimatePresence>
  );
}

export default CarrierSheet;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/components/CarrierSheet.test.jsx`
Expected: PASS — all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CarrierSheet.jsx frontend/tests/components/CarrierSheet.test.jsx
git commit -m "feat: add CarrierSheet component"
```

---

## Task 7: `CarriersPanel` component

**Files:**
- Create: `frontend/src/components/CarriersPanel.jsx`
- Test: `frontend/tests/components/CarriersPanel.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/CarriersPanel.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarriersPanel from '../../src/components/CarriersPanel';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');

describe('CarriersPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('renders carriers returned by the API', async () => {
    carriersApi.listCarriers.mockResolvedValue([{ id: 1, company_name: 'ABC Trucking', mc_number: '123456' }]);
    render(<CarriersPanel />);

    await waitFor(() => {
      expect(screen.getByText('ABC Trucking')).toBeInTheDocument();
    });
    expect(screen.getByText(/MC 123456/)).toBeInTheDocument();
  });

  test('shows an empty state when there are no carriers', async () => {
    carriersApi.listCarriers.mockResolvedValue([]);
    render(<CarriersPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no carriers yet/i)).toBeInTheDocument();
    });
  });

  test('opens the add-carrier sheet', async () => {
    carriersApi.listCarriers.mockResolvedValue([]);
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText(/no carriers yet/i));

    fireEvent.click(screen.getByRole('button', { name: /\+ add carrier/i }));
    expect(screen.getByText(/^add a carrier$/i)).toBeInTheDocument();
  });

  test('a newly-created carrier appears in the list without a full refetch', async () => {
    carriersApi.listCarriers.mockResolvedValue([]);
    carriersApi.createCarrier.mockResolvedValue({ id: 9, company_name: 'New Carrier LLC' });
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText(/no carriers yet/i));

    fireEvent.click(screen.getByRole('button', { name: /\+ add carrier/i }));
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'New Carrier LLC' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText('New Carrier LLC')).toBeInTheDocument();
    });
  });

  test('clicking a carrier row opens the edit sheet', async () => {
    carriersApi.listCarriers.mockResolvedValue([{ id: 1, company_name: 'ABC Trucking' }]);
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByText('ABC Trucking'));
    expect(screen.getByText(/^edit ABC Trucking$/i)).toBeInTheDocument();
  });

  test('deleting a carrier requires confirmation, then removes it from the list', async () => {
    carriersApi.listCarriers.mockResolvedValue([{ id: 1, company_name: 'ABC Trucking' }]);
    carriersApi.deleteCarrier.mockResolvedValue({ ok: true });
    render(<CarriersPanel />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByRole('button', { name: /delete abc trucking/i }));
    expect(carriersApi.deleteCarrier).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => {
      expect(carriersApi.deleteCarrier).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('ABC Trucking')).not.toBeInTheDocument();
    });
  });

  test('typing in the search box re-fetches with the query, debounced', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    carriersApi.listCarriers.mockResolvedValue([]);
    render(<CarriersPanel />);
    await vi.waitFor(() => expect(carriersApi.listCarriers).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/search carriers/i), { target: { value: 'ABC' } });
    await vi.advanceTimersByTimeAsync(300);

    expect(carriersApi.listCarriers).toHaveBeenCalledWith('ABC');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/components/CarriersPanel.test.jsx`
Expected: FAIL — cannot resolve `../../src/components/CarriersPanel`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/CarriersPanel.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listCarriers, deleteCarrier } from '../api/carriers';
import Card from './Card';
import CarrierSheet from './CarrierSheet';
import PrimaryButton from './PrimaryButton';
import Skeleton from './Skeleton';

function CarriersPanel() {
  const [carriers, setCarriers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [sheetTarget, setSheetTarget] = useState(null); // null = closed, 'new' = add, carrier object = edit
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function fetchCarriers(query) {
    setStatus('loading');
    setError(null);
    listCarriers(query || undefined)
      .then((data) => {
        if (isMountedRef.current) {
          setCarriers(data);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load carriers.');
          setStatus('error');
        }
      });
  }

  useEffect(() => {
    const timeout = setTimeout(() => fetchCarriers(searchText.trim()), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  function handleSaved(carrier) {
    setCarriers((prev) => {
      const exists = prev.some((c) => c.id === carrier.id);
      return exists ? prev.map((c) => (c.id === carrier.id ? carrier : c)) : [carrier, ...prev];
    });
  }

  function handleDelete(id) {
    deleteCarrier(id).then(() => {
      if (isMountedRef.current) {
        setCarriers((prev) => prev.filter((c) => c.id !== id));
        setConfirmingDeleteId(null);
      }
    });
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Carriers</h2>
        <div className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Search carriers"
            placeholder="Search company, MC, dispatcher..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-48 rounded-lg border border-border bg-surface-alt px-2 py-1 text-sm text-text sm:w-64"
          />
          <PrimaryButton onClick={() => setSheetTarget('new')} className="px-3 py-1.5 text-xs">
            + Add carrier
          </PrimaryButton>
        </div>
      </div>

      {status === 'loading' && <Skeleton count={4} height="2.5rem" />}
      {status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {status === 'ready' && carriers.length === 0 && <p className="text-sm text-text-muted">No carriers yet.</p>}
      {status === 'ready' && carriers.length > 0 && (
        <ul className="divide-y divide-border">
          {carriers.map((carrier) => (
            <li key={carrier.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <button type="button" onClick={() => setSheetTarget(carrier)} className="min-w-0 flex-1 truncate text-left text-text hover:underline">
                <span className="font-medium">{carrier.company_name}</span>
                {carrier.mc_number && <span className="ml-2 text-text-muted">MC {carrier.mc_number}</span>}
              </button>
              {confirmingDeleteId === carrier.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button onClick={() => handleDelete(carrier.id)} className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white hover:opacity-90">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmingDeleteId(null)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(carrier.id)}
                  aria-label={`Delete ${carrier.company_name}`}
                  className="shrink-0 rounded-lg border border-error/40 px-2 py-1 text-xs text-error hover:bg-error-bg"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {sheetTarget && (
          <CarrierSheet
            carrier={sheetTarget === 'new' ? null : sheetTarget}
            onClose={() => setSheetTarget(null)}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>
    </Card>
  );
}

export default CarriersPanel;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/components/CarriersPanel.test.jsx`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CarriersPanel.jsx frontend/tests/components/CarriersPanel.test.jsx
git commit -m "feat: add CarriersPanel component"
```

---

## Task 8: Wire the "Carriers" tab into navigation

**Files:**
- Modify: `frontend/src/components/icons.jsx`
- Modify: `frontend/src/components/TopNav.jsx`
- Modify: `frontend/src/pages/MainToolPage.jsx`
- Modify: `frontend/tests/components/TopNav.test.jsx`
- Modify: `frontend/tests/pages/MainToolPage.test.jsx`

- [ ] **Step 1: Add a truck icon**

In `frontend/src/components/icons.jsx`, append after the `CheckIcon` function (end of file):

```jsx

export function TruckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1" y="6" width="13" height="10" rx="1" />
      <path d="M14 9h4l3 3v4h-7z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
```

- [ ] **Step 2: Write the failing TopNav test**

In `frontend/tests/components/TopNav.test.jsx`, add after the `'renders both nav items and the username'` test:

```jsx
  test('renders a Carriers nav item', () => {
    render(<TopNav tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^carriers$/i })).toBeInTheDocument();
  });

  test('marks Carriers active with aria-current when it is the current tab', () => {
    render(<TopNav tab="carriers" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^carriers$/i })).toHaveAttribute('aria-current', 'page');
  });

  test('calls onTabChange with "carriers" when the Carriers button is clicked', () => {
    const onTabChange = vi.fn();
    render(<TopNav tab="loads" onTabChange={onTabChange} username="admin" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^carriers$/i }));
    expect(onTabChange).toHaveBeenCalledWith('carriers');
  });
```

- [ ] **Step 3: Run the TopNav test to verify the new tests fail**

Run: `cd frontend && npx vitest run tests/components/TopNav.test.jsx`
Expected: FAIL — the 3 new tests fail (no "Carriers" button rendered yet); the pre-existing tests still pass.

- [ ] **Step 4: Add the nav button**

In `frontend/src/components/TopNav.jsx`, change the import line:

```js
import { BoxIcon, MailIcon, LogoutIcon } from './icons';
```

to:

```js
import { BoxIcon, MailIcon, LogoutIcon, TruckIcon } from './icons';
```

And add a new `NavButton` after the existing "Inquiries" one:

```jsx
        <NavButton
          icon={<MailIcon className="h-4 w-4" />}
          label="Inquiries"
          active={tab === 'inquiries'}
          onClick={() => onTabChange('inquiries')}
          badge={gmailConnected === false ? 'Gmail not connected — click to connect' : null}
          count={pendingReviewCount}
        />
        <NavButton icon={<TruckIcon className="h-4 w-4" />} label="Carriers" active={tab === 'carriers'} onClick={() => onTabChange('carriers')} />
```

(The first `<NavButton icon={<MailIcon .../>` block above is unchanged — only the new `TruckIcon` line is added immediately after it.)

- [ ] **Step 5: Run the TopNav test to verify it passes**

Run: `cd frontend && npx vitest run tests/components/TopNav.test.jsx`
Expected: PASS — all tests (11 existing + 3 new = 14).

- [ ] **Step 6: Write the failing MainToolPage test**

In `frontend/tests/pages/MainToolPage.test.jsx`, add the mock import and setup:

Replace:

```jsx
import * as loadsApi from '../../src/api/loads';
import * as gmailApi from '../../src/api/gmail';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('papaparse');
vi.mock('../../src/api/loads');
vi.mock('../../src/api/gmail');
vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');
```

with:

```jsx
import * as loadsApi from '../../src/api/loads';
import * as gmailApi from '../../src/api/gmail';
import * as inquiriesApi from '../../src/api/inquiries';
import * as carriersApi from '../../src/api/carriers';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('papaparse');
vi.mock('../../src/api/loads');
vi.mock('../../src/api/gmail');
vi.mock('../../src/api/inquiries');
vi.mock('../../src/api/carriers');
vi.mock('../../src/lib/liveSocket');
```

Add `carriersApi.listCarriers.mockResolvedValue([]);` to the `beforeEach` block, right after the existing `inquiriesApi.listInquiries.mockResolvedValue([]);` line.

Then add a new test at the end of the file, just before the final closing `});`:

```jsx

  test('switches to the Carriers tab and renders the carriers panel', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /^carriers$/i }));

    await waitFor(() => {
      expect(carriersApi.listCarriers).toHaveBeenCalled();
    });
    expect(screen.getByText(/^carriers$/i, { selector: 'h2' })).toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the MainToolPage test to verify the new test fails**

Run: `cd frontend && npx vitest run tests/pages/MainToolPage.test.jsx`
Expected: FAIL — the new "Carriers" test fails (no such tab renders yet); pre-existing tests still pass (the `carriersApi` mock being added doesn't affect them).

- [ ] **Step 8: Wire the tab into MainToolPage**

In `frontend/src/pages/MainToolPage.jsx`, add the import after the existing `InquiriesLog` import:

```js
import InquiriesLog from '../components/InquiriesLog';
import CarriersPanel from '../components/CarriersPanel';
```

Update `TAB_TITLES`:

```js
const TAB_TITLES = {
  loads: 'Loads',
  inquiries: 'Inquiries',
  carriers: 'Carriers',
};
```

And add a new tab block after the existing `{tab === 'inquiries' && (...)}` block, still inside the same `<AnimatePresence>`:

```jsx
          {tab === 'carriers' && (
            <motion.main key="carriers" {...preset.crossfade} className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
              <CarriersPanel />
            </motion.main>
          )}
```

- [ ] **Step 9: Run the MainToolPage test to verify it passes**

Run: `cd frontend && npx vitest run tests/pages/MainToolPage.test.jsx`
Expected: PASS — all tests (12 existing + 1 new = 13).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/icons.jsx frontend/src/components/TopNav.jsx frontend/src/pages/MainToolPage.jsx frontend/tests/components/TopNav.test.jsx frontend/tests/pages/MainToolPage.test.jsx
git commit -m "feat: wire the Carriers tab into navigation"
```

---

## Task 9: Booking-flow carrier capture hook

**Files:**
- Create: `frontend/src/components/BookingCarrierFields.jsx`
- Test: `frontend/tests/components/BookingCarrierFields.test.jsx`
- Modify: `frontend/src/components/RateModal.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/BookingCarrierFields.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingCarrierFields from '../../src/components/BookingCarrierFields';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');

describe('BookingCarrierFields', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('requires a company name before logging', () => {
    render(<BookingCarrierFields loadId={1} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);
    fireEvent.click(screen.getByRole('button', { name: /log carrier/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/company name is required/i);
    expect(carriersApi.createCarrier).not.toHaveBeenCalled();
  });

  test('finds-or-creates the carrier, then logs a lane-history entry tied to this load', async () => {
    carriersApi.createCarrier.mockResolvedValue({ id: 7, company_name: 'ABC Trucking' });
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 20 });
    render(<BookingCarrierFields loadId={42} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);

    fireEvent.change(screen.getByLabelText(/carrier company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.change(screen.getByLabelText(/^rate paid$/i), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: /log carrier/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrier).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'ABC Trucking' }));
    });
    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(7, expect.objectContaining({
        load_id: 42, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: 1500,
      }));
    });
    await waitFor(() => {
      expect(screen.getByText(/carrier logged for this load/i)).toBeInTheDocument();
    });
  });

  test('shows an error and stays editable when the save fails', async () => {
    carriersApi.createCarrier.mockRejectedValue(new Error('Network error'));
    render(<BookingCarrierFields loadId={1} originCity="Dallas" originState="TX" destCity="Chicago" destState="IL" />);

    fireEvent.change(screen.getByLabelText(/carrier company name/i), { target: { value: 'ABC Trucking' } });
    fireEvent.click(screen.getByRole('button', { name: /log carrier/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
    });
    expect(screen.getByLabelText(/carrier company name/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/components/BookingCarrierFields.test.jsx`
Expected: FAIL — cannot resolve `../../src/components/BookingCarrierFields`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/BookingCarrierFields.jsx`:

```jsx
import { useState } from 'react';
import { createCarrier, createCarrierHistory } from '../api/carriers';
import PrimaryButton from './PrimaryButton';

function blankToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// Optional, skippable carrier-logging section shown when a load's status
// is set to "booked" -- saves straight into the carrier database (find-or-
// create by MC number/company name, then a new lane-history row tied to
// this load) so booking a load and building carrier history happen in one
// step instead of two. Independent of RateModal's own Save button -- this
// logs immediately on its own "Log carrier" click.
function BookingCarrierFields({ loadId, originCity, originState, destCity, destState }) {
  const [companyName, setCompanyName] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [dispatcherName, setDispatcherName] = useState('');
  const [dispatcherPhone, setDispatcherPhone] = useState('');
  const [rate, setRate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState(null);

  function handleLogCarrier() {
    setError(null);
    const trimmedCompany = companyName.trim();
    if (!trimmedCompany) {
      setError('Company name is required to log the carrier.');
      return;
    }
    setStatus('saving');
    createCarrier({
      company_name: trimmedCompany,
      mc_number: blankToNull(mcNumber),
      dispatcher_name: blankToNull(dispatcherName),
      dispatcher_phone: blankToNull(dispatcherPhone),
    })
      .then((carrier) =>
        createCarrierHistory(carrier.id, {
          load_id: loadId,
          origin_city: originCity,
          origin_state: originState,
          dest_city: destCity,
          dest_state: destState,
          rate: blankToNull(rate) === null ? null : Number(rate),
          driver_name: blankToNull(driverName),
          driver_phone: blankToNull(driverPhone),
          comment: blankToNull(comment),
          ran_at: new Date().toISOString().slice(0, 10),
        })
      )
      .then(() => setStatus('saved'))
      .catch((err) => {
        setStatus('error');
        setError(err.message || 'Failed to log the carrier.');
      });
  }

  if (status === 'saved') {
    return (
      <p className="mb-4 rounded-lg border border-success/40 bg-success-bg px-3 py-2 text-sm text-success">
        Carrier logged for this load.
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Log the carrier for this load (optional)</p>
      {error && (
        <p role="alert" className="mb-2 text-xs text-error">
          {error}
        </p>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          aria-label="Carrier company name"
          placeholder="Company name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Carrier MC number"
          placeholder="MC number"
          value={mcNumber}
          onChange={(e) => setMcNumber(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Dispatcher name"
          placeholder="Dispatcher name"
          value={dispatcherName}
          onChange={(e) => setDispatcherName(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Dispatcher phone"
          placeholder="Dispatcher phone"
          value={dispatcherPhone}
          onChange={(e) => setDispatcherPhone(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Rate paid"
          placeholder="Rate"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Driver name"
          placeholder="Driver name (optional)"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
        <input
          aria-label="Driver phone"
          placeholder="Driver phone (optional)"
          value={driverPhone}
          onChange={(e) => setDriverPhone(e.target.value)}
          className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
        />
      </div>
      <textarea
        aria-label="Carrier comment"
        placeholder="Comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="mb-2 w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
      />
      <div className="flex justify-end">
        <PrimaryButton onClick={handleLogCarrier} disabled={status === 'saving'} className="px-3 py-1 text-xs">
          {status === 'saving' ? 'Logging...' : 'Log carrier'}
        </PrimaryButton>
      </div>
    </div>
  );
}

export default BookingCarrierFields;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/components/BookingCarrierFields.test.jsx`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Wire it into RateModal**

In `frontend/src/components/RateModal.jsx`, add the import after the existing `DateRangeField` import:

```js
import DateRangeField from './DateRangeField';
import BookingCarrierFields from './BookingCarrierFields';
```

Insert the following immediately after the "Target pay / Status" grid's closing `</div>` and before the existing `{error && (` block:

```jsx
        {status === 'booked' && (
          <BookingCarrierFields
            loadId={load.id}
            originCity={fields.origin_city}
            originState={fields.origin_state}
            destCity={fields.dest_city}
            destState={fields.dest_state}
          />
        )}

```

- [ ] **Step 6: Manually verify RateModal still renders correctly**

Run: `cd frontend && npx vitest run tests/components/RateModal.test.jsx`
Expected: PASS — this file doesn't mock `../../src/api/carriers`, but `BookingCarrierFields` only renders (and only calls `createCarrier`) when `status === 'booked'` AND its own "Log carrier" button is clicked — no existing `RateModal.test.jsx` test sets status to `'booked'` and clicks that button, so nothing in `BookingCarrierFields` executes during these tests and no mock is needed for them to keep passing. If this fails instead, stop and report the failure rather than adding an unplanned mock.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/BookingCarrierFields.jsx frontend/tests/components/BookingCarrierFields.test.jsx frontend/src/components/RateModal.jsx
git commit -m "feat: log carrier + lane history when a load is marked booked"
```

---

## Task 10: Env var docs and full verification

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/README.md` (if it documents env vars — check first; if it doesn't have an env var section, skip the README edit)

- [ ] **Step 1: Document `GOOGLE_MAPS_API_KEY`**

In `backend/.env.example`, add after the existing `GOOGLE_REDIRECT_URI=...` line:

```
# Only needed for the carrier-matching feature's distance calculations
# (backend/src/lib/geocoding.js). Get one from Google Cloud Console with
# the "Geocoding API" enabled. Not required to run the test suite -- all
# geocoding calls are mocked in tests, and a missing key just means new
# lanes save without coordinates (they simply won't factor into carrier
# matching until Phase 3, or until the key is set and they're re-saved).
GOOGLE_MAPS_API_KEY=
```

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend && npx jest --runInBand`
Expected: PASS on every suite except the 3 pre-existing, already-known-broken `emailPoller.test.js` failures (confirmed unrelated to this work — they fail identically on unmodified `master`, see the prior bug-fix session). If any *other* suite fails, stop and fix before proceeding.

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS on every suite except the 2 pre-existing, already-known-broken suites (`tests/App.test.jsx`, `tests/components/DateRangeField.test.jsx`). If any *other* suite fails, stop and fix before proceeding.

- [ ] **Step 4: Manual smoke check**

Run: `cd frontend && npm run dev`
Open the app, click the new "Carriers" tab, add a carrier, edit it to add a lane, delete the lane, delete the carrier. Open an existing load, set its status to "Booked," confirm the "Log the carrier for this load" section appears and logging a carrier there shows the "Carrier logged for this load" confirmation. Stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit and push**

```bash
git add backend/.env.example
git commit -m "docs: document GOOGLE_MAPS_API_KEY"
git push origin master
```

---

## What's next

Phase 3 (Matching Engine & Carrier Map — the globe visualization, per-load badge, deep-link, manual lane search) gets its own plan document once this one ships.
