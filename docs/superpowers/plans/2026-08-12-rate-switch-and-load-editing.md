# Rate Switch, Manual Load Entry & Structured Stops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent per-load rate on/off switch (email replies + DAT export), a manual add/edit path covering every field a CSV row carries, and structured extra-stop entry that automatically flows into replies with a red/blue tag on the loads board.

**Architecture:** Two new columns on `loads` (`include_rate`, `extra_stops` JSON). `replyComposer.js` and `datExport.js` both read `include_rate` directly instead of the old per-export rate choice. A new `POST /api/loads` creates a single load; `POST /api/loads/bulk-include-rate` mirrors the existing `bulk-status` endpoint. A shared `ExtraStopsEditor` component is used by both the new `AddLoadModal` and the existing `RateModal`. `lookupMessage.js` gains a `multiStopTagVariant()` helper reused by both `LoadsTable` (new tag) and `ReviewQueue` (upgrades its existing warning badge).

**Tech Stack:** Node/Express/MySQL (mysql2) backend with Jest + Supertest; React 18/Vite/Tailwind frontend with Vitest + React Testing Library. Matches the existing stack exactly — no new dependencies.

**Relationship to other plans:** Implements `docs/superpowers/specs/2026-08-12-rate-switch-and-load-editing-design.md` in full (single spec, not decomposed into sub-projects).

**Prerequisite:** A local MySQL instance reachable via the backend's `.env` (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_NAME_TEST`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) — the same one the existing backend test suite already requires (`cd backend && npm test` must already pass before starting).

---

## Task 1: Schema — `include_rate` and `extra_stops` columns

**Files:**
- Modify: `backend/sql/schema.sql`
- Modify: `backend/scripts/setup-db.js`

- [ ] **Step 1: Add both columns to the fresh-install schema**

In `backend/sql/schema.sql`, in the `loads` table definition, change:
```sql
  custom_reply_body TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
```
to:
```sql
  custom_reply_body TEXT NULL,
  include_rate TINYINT(1) NOT NULL DEFAULT 1,
  extra_stops JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
```

- [ ] **Step 2: Add the idempotent migration for existing databases**

In `backend/scripts/setup-db.js`, inside `migrateSchema()`, immediately after the existing `customReplyCol` block (the one that adds `custom_reply_body`), add:
```js
  const [includeRateCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'include_rate'`,
    [databaseName]
  );
  if (includeRateCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN include_rate TINYINT(1) NOT NULL DEFAULT 1`);
  }

  const [extraStopsCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'extra_stops'`,
    [databaseName]
  );
  if (extraStopsCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN extra_stops JSON NULL`);
  }
```

- [ ] **Step 3: Apply the migration to both the dev and test databases**

Run (from `backend/`): `npm run setup-db`
Expected output ends with: `Database setup complete.`

- [ ] **Step 4: Verify the columns exist**

Run (from `backend/`, adjust connection flags to match your `.env` if needed): a quick sanity check isn't scriptable without a DB client here — instead, confirm indirectly by running the existing suite, which will fail loudly if the columns are missing once later tasks reference them. Proceed to Step 5.

- [ ] **Step 5: Commit**

```bash
git add backend/sql/schema.sql backend/scripts/setup-db.js
git commit -m "feat: add include_rate and extra_stops columns to loads"
```

---

## Task 2: Reply composer — rate switch and structured extra stops

**Files:**
- Modify: `backend/src/lib/replyComposer.js`
- Modify: `backend/tests/lib/replyComposer.test.js`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('composeReply', ...)` block in `backend/tests/lib/replyComposer.test.js`:
```js
  test('omits the Rate line when include_rate is false even though target_pay is set', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      target_pay: '1500.00',
      include_rate: 0,
    };
    expect(composeReply(load)).not.toContain('Rate:');
  });

  test('includes the Rate line when include_rate is true, and when it is simply absent (defaults to on)', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      target_pay: '1500.00',
      include_rate: 1,
    };
    expect(composeReply(load)).toContain('Rate: $1,500');
    expect(composeReply({ ...load, include_rate: undefined })).toContain('Rate: $1,500');
  });

  test('inserts extra pickups after the primary PU line, in entry order, labeled 2nd/3rd', () => {
    const load = {
      origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL',
      extra_stops: [
        { type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '2026-08-12 13:00:00' },
        { type: 'pickup', city: 'Waco', state: 'TX', datetime: null },
      ],
    };
    expect(composeReply(load)).toBe(
      'PU: DALLAS, TX\n' +
      '2nd PU: FORT WORTH, TX – 08/12/2026 1pm\n' +
      '3rd PU: WACO, TX\n' +
      'DEL: CHICAGO, IL'
    );
  });

  test('inserts extra deliveries after the primary DEL line, in entry order, labeled 2nd/3rd', () => {
    const load = {
      origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL',
      extra_stops: [
        { type: 'delivery', city: 'Joliet', state: 'IL', datetime: '2026-08-14 09:00:00' },
        { type: 'delivery', city: 'Peoria', state: 'IL', datetime: null },
      ],
    };
    expect(composeReply(load)).toBe(
      'PU: DALLAS, TX\n' +
      'DEL: CHICAGO, IL\n' +
      '2nd DEL: JOLIET, IL – 08/14/2026 9am\n' +
      '3rd DEL: PEORIA, IL'
    );
  });

  test('interleaves extra pickups and deliveries correctly around the primary PU/DEL lines, before Rate', () => {
    const load = {
      origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL',
      target_pay: '1500.00',
      extra_stops: [
        { type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null },
        { type: 'delivery', city: 'Joliet', state: 'IL', datetime: null },
      ],
    };
    expect(composeReply(load)).toBe(
      'PU: DALLAS, TX\n' +
      '2nd PU: FORT WORTH, TX\n' +
      'DEL: CHICAGO, IL\n' +
      '2nd DEL: JOLIET, IL\n' +
      'Rate: $1,500'
    );
  });

  test('ignores an extra stop entry with neither city nor state', () => {
    const load = {
      origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL',
      extra_stops: [{ type: 'pickup', city: null, state: null, datetime: null }],
    };
    expect(composeReply(load)).not.toContain('2nd PU');
  });

  test('treats a null or missing extra_stops as no extra stops', () => {
    const load = {
      origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL',
      extra_stops: null,
    };
    expect(() => composeReply(load)).not.toThrow();
    expect(composeReply(load)).not.toContain('2nd');
    expect(composeReply({ ...load, extra_stops: undefined })).not.toContain('2nd');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/lib/replyComposer.test.js`
Expected: FAIL — the new assertions don't match (`include_rate`/`extra_stops` are not read yet)

- [ ] **Step 3: Implement the rate gate and extra-stop lines**

Replace the full contents of `backend/src/lib/replyComposer.js` with:
```js
function formatLocation(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ').toUpperCase() : null;
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'pm' : 'am';
  hours %= 12;
  if (hours === 0) hours = 12;
  const time = minutes === 0 ? `${hours}${period}` : `${hours}:${String(minutes).padStart(2, '0')}${period}`;
  return `${mm}/${dd}/${yyyy} ${time}`;
}

function formatRate(targetPay) {
  const amount = Number(targetPay);
  if (Number.isNaN(amount)) return null;
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

// Extra stops are additional pickups/deliveries beyond the load's primary
// origin/destination, which is always "1st" implicitly (never labeled) --
// so the first extra stop of a given type is "2nd", not "1st".
function extraStopLabel(indexAmongSameType) {
  const n = indexAmongSameType + 2;
  return ORDINALS[n - 1] || `${n}th`;
}

function formatExtraStopLine(stop, indexAmongSameType) {
  const loc = formatLocation(stop.city, stop.state);
  if (!loc) return null;
  const typeLabel = stop.type === 'delivery' ? 'DEL' : 'PU';
  const label = `${extraStopLabel(indexAmongSameType)} ${typeLabel}`;
  const dateTime = formatDateTime(stop.datetime);
  return dateTime ? `${label}: ${loc} – ${dateTime}` : `${label}: ${loc}`;
}

// Format: "PU: CITY, ST – MM/DD/YYYY h:mma" / "2nd PU: ..." (extra pickups,
// entry order) / "DEL: CITY, ST – MM/DD/YYYY h:mma" / "2nd DEL: ..." (extra
// deliveries, entry order) / "Weight: ..." / "Rate: $...", one field per
// line, in that order -- any field the load doesn't have is simply
// omitted, never shown as "null". The Rate line is additionally gated on
// include_rate (defaults to on -- only an explicit 0/false suppresses it),
// which never touches target_pay itself.
function composeReply(load) {
  const lines = [];
  const extraStops = Array.isArray(load.extra_stops) ? load.extra_stops : [];
  const extraPickups = extraStops.filter((s) => s && s.type === 'pickup');
  const extraDeliveries = extraStops.filter((s) => s && s.type === 'delivery');

  const originLoc = formatLocation(load.origin_city, load.origin_state);
  if (originLoc) {
    const puDateTime = formatDateTime(load.early_pu);
    lines.push(puDateTime ? `PU: ${originLoc} – ${puDateTime}` : `PU: ${originLoc}`);
  }
  extraPickups.forEach((stop, i) => {
    const line = formatExtraStopLine(stop, i);
    if (line) lines.push(line);
  });

  const destLoc = formatLocation(load.dest_city, load.dest_state);
  if (destLoc) {
    const delDateTime = formatDateTime(load.late_del);
    lines.push(delDateTime ? `DEL: ${destLoc} – ${delDateTime}` : `DEL: ${destLoc}`);
  }
  extraDeliveries.forEach((stop, i) => {
    const line = formatExtraStopLine(stop, i);
    if (line) lines.push(line);
  });

  if (load.weight) {
    lines.push(`Weight: ${load.weight}`);
  }

  const includeRate = load.include_rate !== 0 && load.include_rate !== false;
  if (includeRate && load.target_pay !== null && load.target_pay !== undefined) {
    const rate = formatRate(load.target_pay);
    if (rate) lines.push(`Rate: ${rate}`);
  }

  return lines.join('\n');
}

module.exports = { composeReply };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/lib/replyComposer.test.js`
Expected: PASS (all original tests plus the 7 new ones)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/replyComposer.js backend/tests/lib/replyComposer.test.js
git commit -m "feat: gate the Rate line on include_rate and add structured extra stops to replies"
```

---

## Task 3: `loads` route — PATCH accepts `include_rate` and `extra_stops`

**Files:**
- Modify: `backend/src/routes/loads.js`
- Modify: `backend/tests/loads.test.js`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('loads routes', ...)` block in `backend/tests/loads.test.js` (right after the existing `'PATCH can clear a custom_reply_body...'` test):
```js
  test('PATCH can set include_rate to false and extra_stops as a JSON array', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({
      include_rate: false,
      extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '2026-08-12 13:00:00' }],
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.include_rate)).toBe(0);
    expect(res.body.extra_stops).toEqual([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '2026-08-12 13:00:00' }]);
  });

  test('PATCH can clear extra_stops by setting it to an empty array', async () => {
    const [result] = await pool.query(
      'INSERT INTO loads (load_number, origin_city, user_id, extra_stops) VALUES (?, ?, ?, ?)',
      ['L1001', 'Dallas', userId, JSON.stringify([{ type: 'pickup', city: 'X', state: 'TX', datetime: null }])]
    );
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ extra_stops: [] });
    expect(res.status).toBe(200);
    expect(res.body.extra_stops).toEqual([]);
  });

  test('a newly inserted load defaults to include_rate = 1', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.get(`/api/loads/${result.insertId}`);
    expect(Number(res.body.include_rate)).toBe(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/loads.test.js -t "include_rate"`
Expected: FAIL — `include_rate`/`extra_stops` are not in `EDITABLE_FIELDS`, so PATCH silently drops them (the response won't reflect the sent values)

- [ ] **Step 3: Add both fields to `EDITABLE_FIELDS` and serialize `extra_stops` on write**

In `backend/src/routes/loads.js`, change:
```js
const EDITABLE_FIELDS = [
  'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip', 'equipment', 'weight',
  'target_pay', 'early_pu', 'late_pu', 'late_del', 'stops',
  'commodity', 'temperature', 'comment', 'status', 'custom_reply_body',
];
```
to:
```js
const EDITABLE_FIELDS = [
  'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip', 'equipment', 'weight',
  'target_pay', 'early_pu', 'late_pu', 'late_del', 'stops',
  'commodity', 'temperature', 'comment', 'status', 'custom_reply_body',
  'include_rate', 'extra_stops',
];
```

Then, in the `router.patch('/:id', ...)` handler, change:
```js
    const updates = [];
    const values = [];
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
```
to:
```js
    const updates = [];
    const values = [];
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(field === 'extra_stops' ? JSON.stringify(req.body[field]) : req.body[field]);
      }
    }
```
(`extra_stops` is a JSON column — mysql2 does not auto-serialize a JS array/object passed as a bind parameter, so it must be explicitly stringified before the query. Reads come back already parsed, no change needed there.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/loads.test.js`
Expected: PASS (full file, including the 3 new tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js
git commit -m "feat: allow PATCH /api/loads/:id to set include_rate and extra_stops"
```

---

## Task 4: `loads` route — `POST /` to create a single load

**Files:**
- Modify: `backend/src/routes/loads.js`
- Modify: `backend/tests/loads.test.js`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `backend/tests/loads.test.js`, right before the closing `});` of `describe('loads routes', ...)` (i.e. after the last existing top-level test/describe block, such as `POST /api/loads/upload returns 500...`):
```js
  describe('POST /', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/loads').send({ load_number: 'L1001' });
      expect(res.status).toBe(401);
    });

    test('creates a load with only load_number set, defaulting everything else', async () => {
      const res = await agent.post('/api/loads').send({ load_number: 'L1001' });
      expect(res.status).toBe(201);
      expect(res.body.load_number).toBe('L1001');
      expect(res.body.status).toBe('active');
      expect(Number(res.body.include_rate)).toBe(1);
      expect(res.body.target_pay).toBeNull();
      expect(res.body.comment).toBeNull();
    });

    test('creates a load with the full set of fields, including extra_stops and include_rate', async () => {
      const res = await agent.post('/api/loads').send({
        load_number: 'L2002', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
        equipment: 'V', weight: '42000', target_pay: 1500, comment: 'Call ahead', include_rate: false,
        extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }],
      });
      expect(res.status).toBe(201);
      expect(res.body.origin_city).toBe('Dallas');
      expect(Number(res.body.target_pay)).toBe(1500);
      expect(Number(res.body.include_rate)).toBe(0);
      expect(res.body.extra_stops).toEqual([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }]);
    });

    test('returns 400 when load_number is missing or blank', async () => {
      const res1 = await agent.post('/api/loads').send({});
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/loads').send({ load_number: '   ' });
      expect(res2.status).toBe(400);
    });

    test('returns 409 when load_number already exists for this user', async () => {
      await agent.post('/api/loads').send({ load_number: 'DUPE1' });
      const res = await agent.post('/api/loads').send({ load_number: 'DUPE1' });
      expect(res.status).toBe(409);
    });

    test('two different users can each create a load with the same load_number', async () => {
      await agent.post('/api/loads').send({ load_number: 'SHARED1' });

      const passwordHash = await bcrypt.hash('otherpw', 10);
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const otherAgent = request.agent(app);
      await otherAgent.post('/api/auth/login').send({ username: 'otheruser', password: 'otherpw' });

      const res = await otherAgent.post('/api/loads').send({ load_number: 'SHARED1' });
      expect(res.status).toBe(201);
    });

    test('emits load:changed to the creating user', async () => {
      const wsHub = { emitToUser: jest.fn() };
      const hubApp = createApp(pool, wsHub);
      const hubAgent = request.agent(hubApp);
      await hubAgent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });

      const res = await hubAgent.post('/api/loads').send({ load_number: 'L1001' });
      expect(wsHub.emitToUser).toHaveBeenCalledWith(userId, 'load:changed', { loadId: res.body.id });
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/loads.test.js -t "POST /"`
Expected: FAIL — 404, since no `POST /` route exists yet

- [ ] **Step 3: Add the route**

In `backend/src/routes/loads.js`, add this route right after `router.get('/', ...)` and before `router.get('/:id', ...)`:
```js
  router.post('/', asyncHandler(async (req, res) => {
    const loadNumber = String(req.body.load_number ?? '').trim();
    if (loadNumber === '') {
      return res.status(400).json({ error: 'load_number is required' });
    }

    const userId = req.session.userId;
    const columns = ['load_number', 'user_id'];
    const values = [loadNumber, userId];
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        columns.push(field);
        values.push(field === 'extra_stops' ? JSON.stringify(req.body[field]) : req.body[field]);
      }
    }
    const placeholders = columns.map(() => '?').join(', ');

    let insertId;
    try {
      const [result] = await pool.query(`INSERT INTO loads (${columns.join(', ')}) VALUES (${placeholders})`, values);
      insertId = result.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `A load with number "${loadNumber}" already exists` });
      }
      throw err;
    }

    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [insertId]);
    if (wsHub) wsHub.emitToUser(userId, 'load:changed', { loadId: insertId });
    res.status(201).json(rows[0]);
  }));
```
(Reuses the existing `EDITABLE_FIELDS` list, so every field it already knows how to PATCH is also settable at creation time — no separate field list to keep in sync.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/loads.test.js`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js
git commit -m "feat: add POST /api/loads to create a single load manually"
```

---

## Task 5: `loads` route — `POST /bulk-include-rate`

**Files:**
- Modify: `backend/src/routes/loads.js`
- Modify: `backend/tests/loads.test.js`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `backend/tests/loads.test.js`, right after the existing `describe('POST /bulk-status', ...)` block:
```js
  describe('POST /bulk-include-rate', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/loads/bulk-include-rate').send({ ids: [1], includeRate: false });
      expect(res.status).toBe(401);
    });

    test('updates include_rate for multiple owned loads in one request', async () => {
      const [l1] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [l2] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1002', 'Atlanta', userId]);

      const res = await agent.post('/api/loads/bulk-include-rate').send({ ids: [l1.insertId, l2.insertId], includeRate: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });

      const list = await agent.get('/api/loads');
      expect(list.body.every((l) => Number(l.include_rate) === 0)).toBe(true);
    });

    test('does not update a load owned by a different user, even if its id is included', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [mine] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [theirs] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

      const res = await agent.post('/api/loads/bulk-include-rate').send({ ids: [mine.insertId, theirs.insertId], includeRate: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });

      const [rows] = await pool.query('SELECT include_rate FROM loads WHERE id = ?', [theirs.insertId]);
      expect(Number(rows[0].include_rate)).toBe(1);
    });

    test('an admin can bulk-set include_rate across different users', async () => {
      const passwordHash = await bcrypt.hash('adminpw', 10);
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
      const adminAgent = request.agent(app);
      await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });
      const [mine] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);

      const res = await adminAgent.post('/api/loads/bulk-include-rate').send({ ids: [mine.insertId], includeRate: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });
    });

    test('returns 400 when ids is missing or empty', async () => {
      const res1 = await agent.post('/api/loads/bulk-include-rate').send({ includeRate: true });
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/loads/bulk-include-rate').send({ ids: [], includeRate: true });
      expect(res2.status).toBe(400);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/loads.test.js -t "bulk-include-rate"`
Expected: FAIL — 404, route doesn't exist yet

- [ ] **Step 3: Add the route**

In `backend/src/routes/loads.js`, add this route right after `router.post('/bulk-status', ...)` and before `router.post('/upload', ...)`:
```js
  router.post('/bulk-include-rate', asyncHandler(async (req, res) => {
    const { ids, includeRate } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    const isAdmin = req.session.role === 'admin';
    const placeholders = ids.map(() => '?').join(', ');
    const sql = isAdmin
      ? `UPDATE loads SET include_rate = ? WHERE id IN (${placeholders})`
      : `UPDATE loads SET include_rate = ? WHERE id IN (${placeholders}) AND user_id = ?`;
    const params = isAdmin ? [includeRate ? 1 : 0, ...ids] : [includeRate ? 1 : 0, ...ids, req.session.userId];
    const [result] = await pool.query(sql, params);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'load:changed', {});
    res.json({ updated: result.affectedRows });
  }));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/loads.test.js`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js
git commit -m "feat: add POST /api/loads/bulk-include-rate"
```

---

## Task 6: `inquiries` route — expose the matched load's rate and stop data

**Files:**
- Modify: `backend/src/routes/inquiries.js`
- Modify: `backend/tests/inquiries.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/inquiries.test.js`, right after the existing `'surfaces ref_mismatch, ...'` test:
```js
  test('includes the matched load\'s target_pay, include_rate, and extra_stops for the review queue\'s rate toggle and stop tag', async () => {
    const [loadResult] = await pool.query(
      "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, target_pay, include_rate, extra_stops, user_id, status) VALUES ('L1', 'Dallas', 'TX', 'Chicago', 'IL', 1500, 0, ?, ?, 'active')",
      [JSON.stringify([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }]), userId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Dallas load inquiry', '2026-08-01 08:00:00', ?, 'load_number', 'matched')`,
      [userId, accountId, loadResult.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(Number(res.body[0].matched_load_target_pay)).toBe(1500);
    expect(Number(res.body[0].matched_load_include_rate)).toBe(0);
    expect(res.body[0].matched_load_extra_stops).toEqual([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }]);
  });

  test('matched_load_target_pay, matched_load_include_rate, and matched_load_extra_stops are null when there is no matched load', async () => {
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Unmatched inquiry', '2026-08-01 08:00:00', 'none', 'needs_review')`,
      [userId, accountId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body[0].matched_load_target_pay).toBeNull();
    expect(res.body[0].matched_load_include_rate).toBeNull();
    expect(res.body[0].matched_load_extra_stops).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/inquiries.test.js -t "matched_load_target_pay"`
Expected: FAIL — those columns aren't selected yet, so both new fields come back `undefined`

- [ ] **Step 3: Extend the join**

In `backend/src/routes/inquiries.js`, change:
```js
    let sql = `
      SELECT ei.*, l.stops AS matched_load_stops, l.comment AS matched_load_comment
      FROM email_inquiries ei
      LEFT JOIN loads l ON l.id = ei.matched_load_id
      WHERE ei.user_id = ?`;
```
to:
```js
    let sql = `
      SELECT ei.*, l.stops AS matched_load_stops, l.comment AS matched_load_comment,
             l.target_pay AS matched_load_target_pay, l.include_rate AS matched_load_include_rate,
             l.extra_stops AS matched_load_extra_stops
      FROM email_inquiries ei
      LEFT JOIN loads l ON l.id = ei.matched_load_id
      WHERE ei.user_id = ?`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/inquiries.test.js`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/inquiries.js backend/tests/inquiries.test.js
git commit -m "feat: expose matched load's target_pay, include_rate, and extra_stops on GET /api/inquiries"
```

---

## Task 7: Frontend API — `createLoad` and `bulkSetIncludeRate`

**Files:**
- Modify: `frontend/src/api/loads.js`
- Modify: `frontend/tests/api/loads.test.js`

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/api/loads.test.js`, change the import line:
```js
import { listLoads, getLoad, previewLoadReply, updateLoad, deleteLoad, uploadLoads, bulkDeleteLoads, bulkUpdateLoadStatus } from '../../src/api/loads';
```
to:
```js
import { listLoads, getLoad, previewLoadReply, updateLoad, deleteLoad, uploadLoads, bulkDeleteLoads, bulkUpdateLoadStatus, createLoad, bulkSetIncludeRate } from '../../src/api/loads';
```
Then append, inside the `describe('loads api', ...)` block:
```js
  test('createLoad posts /api/loads with the given data', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1, load_number: 'L1' }) });
    await createLoad({ load_number: 'L1' });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ load_number: 'L1' });
  });

  test('bulkSetIncludeRate posts /api/loads/bulk-include-rate with ids and includeRate', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ updated: 2 }) });
    await bulkSetIncludeRate([1, 2], false);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/bulk-include-rate');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ ids: [1, 2], includeRate: false });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/api/loads.test.js`
Expected: FAIL — `createLoad`/`bulkSetIncludeRate` are not exported yet

- [ ] **Step 3: Add both functions**

In `frontend/src/api/loads.js`, add at the end of the file:
```js
export function createLoad(data) {
  return post('/api/loads', data);
}

export function bulkSetIncludeRate(ids, includeRate) {
  return post('/api/loads/bulk-include-rate', { ids, includeRate });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/loads.test.js`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/loads.js frontend/tests/api/loads.test.js
git commit -m "feat: add createLoad and bulkSetIncludeRate to the loads API module"
```

---

## Task 8: `dateInput.js` — datetime-local conversion helpers

**Files:**
- Create: `frontend/src/lib/dateInput.js`
- Test: `frontend/tests/lib/dateInput.test.js`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/lib/dateInput.test.js`:
```js
import { describe, test, expect } from 'vitest';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../../src/lib/dateInput';

describe('isoToDatetimeLocal', () => {
  test('formats an ISO datetime as a datetime-local input value using local time', () => {
    const iso = new Date(2026, 7, 12, 9, 5, 0).toISOString();
    expect(isoToDatetimeLocal(iso)).toBe('2026-08-12T09:05');
  });

  test('returns an empty string for null, undefined, or invalid input', () => {
    expect(isoToDatetimeLocal(null)).toBe('');
    expect(isoToDatetimeLocal(undefined)).toBe('');
    expect(isoToDatetimeLocal('not-a-date')).toBe('');
  });
});

describe('datetimeLocalToMysql', () => {
  test('converts a datetime-local value to a MySQL DATETIME string', () => {
    expect(datetimeLocalToMysql('2026-08-12T09:05')).toBe('2026-08-12 09:05:00');
  });

  test('returns null for an empty, undefined, or malformed value', () => {
    expect(datetimeLocalToMysql('')).toBeNull();
    expect(datetimeLocalToMysql(undefined)).toBeNull();
    expect(datetimeLocalToMysql('not-a-date')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/lib/dateInput.test.js`
Expected: FAIL — the module doesn't exist yet

- [ ] **Step 3: Implement the helpers**

`frontend/src/lib/dateInput.js`:
```js
export function isoToDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToMysql(value) {
  const trimmed = String(value ?? '').trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match;
  return `${year}-${month}-${day} ${hours}:${minutes}:00`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/dateInput.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dateInput.js frontend/tests/lib/dateInput.test.js
git commit -m "feat: add datetime-local <-> MySQL datetime conversion helpers"
```

---

## Task 9: `Badge` — add the `info` (blue) variant

**Files:**
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/components/Badge.jsx`
- Modify: `frontend/tests/components/Badge.test.jsx`

- [ ] **Step 1: Write the failing test**

In `frontend/tests/components/Badge.test.jsx`, change:
```js
  test.each([
    ['success', 'bg-success-bg'],
    ['error', 'bg-error-bg'],
    ['warning', 'bg-warning-bg'],
  ])('applies the %s variant styling', (variant, expectedClass) => {
```
to:
```js
  test.each([
    ['success', 'bg-success-bg'],
    ['error', 'bg-error-bg'],
    ['warning', 'bg-warning-bg'],
    ['info', 'bg-info-bg'],
  ])('applies the %s variant styling', (variant, expectedClass) => {
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `frontend/`): `npx vitest run tests/components/Badge.test.jsx`
Expected: FAIL — `info` isn't a recognized variant, so it falls back to `bg-tag-bg`

- [ ] **Step 3: Add the color tokens**

In `frontend/src/styles/tokens.css`, change:
```css
  --color-tag: #5b21b6;
  --color-tag-bg: #ede9fe;
}
```
to:
```css
  --color-tag: #5b21b6;
  --color-tag-bg: #ede9fe;
  --color-info: #1d4ed8;
  --color-info-bg: #dbeafe;
}
```

- [ ] **Step 4: Map the tokens in Tailwind**

In `frontend/tailwind.config.js`, change:
```js
        tag: 'var(--color-tag)',
        'tag-bg': 'var(--color-tag-bg)',
      },
```
to:
```js
        tag: 'var(--color-tag)',
        'tag-bg': 'var(--color-tag-bg)',
        info: 'var(--color-info)',
        'info-bg': 'var(--color-info-bg)',
      },
```

- [ ] **Step 5: Add the variant to `Badge`**

In `frontend/src/components/Badge.jsx`, change:
```js
const VARIANT_CLASSES = {
  default: 'bg-tag-bg text-tag',
  success: 'bg-success-bg text-success',
  error: 'bg-error-bg text-error',
  warning: 'bg-warning-bg text-warning',
};
```
to:
```js
const VARIANT_CLASSES = {
  default: 'bg-tag-bg text-tag',
  success: 'bg-success-bg text-success',
  error: 'bg-error-bg text-error',
  warning: 'bg-warning-bg text-warning',
  info: 'bg-info-bg text-info',
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/components/Badge.test.jsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/tokens.css frontend/tailwind.config.js frontend/src/components/Badge.jsx frontend/tests/components/Badge.test.jsx
git commit -m "feat: add an info (blue) Badge variant"
```

---

## Task 10: `lookupMessage.js` — `multiStopTagVariant` helper

**Files:**
- Modify: `frontend/src/lib/lookupMessage.js`
- Modify: `frontend/tests/lib/lookupMessage.test.js`

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/lib/lookupMessage.test.js`, change the import line:
```js
import { searchLoads, extractSched, detectMultiStop, buildLookupMessage } from '../../src/lib/lookupMessage';
```
to:
```js
import { searchLoads, extractSched, detectMultiStop, multiStopTagVariant, buildLookupMessage } from '../../src/lib/lookupMessage';
```
Then add a new `describe` block, right after the existing `describe('detectMultiStop', ...)` block:
```js
describe('multiStopTagVariant', () => {
  test('returns "error" (red) when multi-stop language is detected and there are no structured extra stops', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: [] }))).toBe('error');
  });

  test('returns "info" (blue) when structured extra stops exist, regardless of comment language', () => {
    expect(multiStopTagVariant(load({ comment: 'standard load', extra_stops: [{ type: 'pickup', city: 'X', state: 'TX' }] }))).toBe('info');
  });

  test('returns "info" even when multi-stop language is also detected', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: [{ type: 'pickup', city: 'X', state: 'TX' }] }))).toBe('info');
  });

  test('returns null when nothing suggests extra stops', () => {
    expect(multiStopTagVariant(load({ comment: 'standard load', stops: 0, extra_stops: [] }))).toBeNull();
  });

  test('treats a missing extra_stops field as no structured stops', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: undefined }))).toBe('error');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/lib/lookupMessage.test.js`
Expected: FAIL — `multiStopTagVariant` is not exported yet

- [ ] **Step 3: Implement the helper**

In `frontend/src/lib/lookupMessage.js`, add right after the `detectMultiStop` function:
```js
// Red until structured extra stops exist, then blue -- once real stops are
// entered, that's the definitive resolved state, regardless of whether the
// comment-text heuristic would also have triggered.
export function multiStopTagVariant(load) {
  const extraStops = Array.isArray(load.extra_stops) ? load.extra_stops : [];
  if (extraStops.length > 0) return 'info';
  if (detectMultiStop(load)) return 'error';
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/lookupMessage.test.js`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/lookupMessage.js frontend/tests/lib/lookupMessage.test.js
git commit -m "feat: add multiStopTagVariant (red/blue/none) helper"
```

---

## Task 11: `ExtraStopsEditor` component

**Files:**
- Create: `frontend/src/components/ExtraStopsEditor.jsx`
- Test: `frontend/tests/components/ExtraStopsEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/components/ExtraStopsEditor.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExtraStopsEditor from '../../src/components/ExtraStopsEditor';

describe('ExtraStopsEditor', () => {
  test('renders no rows and an "Add a stop" button when there are no stops', () => {
    render(<ExtraStopsEditor stops={[]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/stop 1 city/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a stop/i })).toBeInTheDocument();
  });

  test('clicking "Add a stop" appends a blank pickup row', () => {
    const onChange = vi.fn();
    render(<ExtraStopsEditor stops={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /add a stop/i }));
    expect(onChange).toHaveBeenCalledWith([{ type: 'pickup', city: '', state: '', datetime: '' }]);
  });

  test('editing a row\'s city updates only that row', () => {
    const onChange = vi.fn();
    const stops = [
      { type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '' },
      { type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' },
    ];
    render(<ExtraStopsEditor stops={stops} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/stop 1 city/i), { target: { value: 'Waco' } });
    expect(onChange).toHaveBeenCalledWith([
      { type: 'pickup', city: 'Waco', state: 'TX', datetime: '' },
      { type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' },
    ]);
  });

  test('changing a row\'s type updates only the type field', () => {
    const onChange = vi.fn();
    const stops = [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '' }];
    render(<ExtraStopsEditor stops={stops} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/stop 1 type/i), { target: { value: 'delivery' } });
    expect(onChange).toHaveBeenCalledWith([{ type: 'delivery', city: 'Fort Worth', state: 'TX', datetime: '' }]);
  });

  test('removing a row drops only that row', () => {
    const onChange = vi.fn();
    const stops = [
      { type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '' },
      { type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' },
    ];
    render(<ExtraStopsEditor stops={stops} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/remove stop 1/i));
    expect(onChange).toHaveBeenCalledWith([{ type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/components/ExtraStopsEditor.test.jsx`
Expected: FAIL — the component doesn't exist yet

- [ ] **Step 3: Implement the component**

`frontend/src/components/ExtraStopsEditor.jsx`:
```jsx
function blankStop() {
  return { type: 'pickup', city: '', state: '', datetime: '' };
}

function ExtraStopsEditor({ stops, onChange }) {
  function updateStop(index, field, value) {
    onChange(stops.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function removeStop(index) {
    onChange(stops.filter((_, i) => i !== index));
  }

  function addStop() {
    onChange([...stops, blankStop()]);
  }

  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Extra stops</label>
      {stops.map((stop, index) => (
        <div key={index} className="mb-2 grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-type-${index}`}>
              Type
            </label>
            <select
              id={`extra-stop-type-${index}`}
              aria-label={`Stop ${index + 1} type`}
              value={stop.type}
              onChange={(e) => updateStop(index, 'type', e.target.value)}
              className="rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
            >
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-city-${index}`}>
              City
            </label>
            <input
              id={`extra-stop-city-${index}`}
              aria-label={`Stop ${index + 1} city`}
              value={stop.city}
              onChange={(e) => updateStop(index, 'city', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-state-${index}`}>
              State
            </label>
            <input
              id={`extra-stop-state-${index}`}
              aria-label={`Stop ${index + 1} state`}
              value={stop.state}
              onChange={(e) => updateStop(index, 'state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted" htmlFor={`extra-stop-datetime-${index}`}>
              Date/time
            </label>
            <input
              id={`extra-stop-datetime-${index}`}
              aria-label={`Stop ${index + 1} date/time`}
              type="datetime-local"
              value={stop.datetime}
              onChange={(e) => updateStop(index, 'datetime', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
            />
          </div>
          <button
            type="button"
            onClick={() => removeStop(index)}
            aria-label={`Remove stop ${index + 1}`}
            className="rounded-lg border border-error/40 px-3 py-2 text-xs text-error hover:bg-error-bg"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addStop}
        className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
      >
        + Add a stop
      </button>
    </div>
  );
}

export default ExtraStopsEditor;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ExtraStopsEditor.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ExtraStopsEditor.jsx frontend/tests/components/ExtraStopsEditor.test.jsx
git commit -m "feat: add ExtraStopsEditor component"
```

---

## Task 12: `RateModal` — pickup/delivery dates and the extra-stops editor

**Files:**
- Modify: `frontend/src/components/RateModal.jsx`
- Modify: `frontend/tests/components/RateModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/components/RateModal.test.jsx`, change the `BLANK_EXTRA_FIELDS` constant:
```js
const BLANK_EXTRA_FIELDS = {
  origin_city: null, origin_state: null, origin_zip: null,
  dest_city: null, dest_state: null, dest_zip: null,
  equipment: null, weight: null, commodity: null, temperature: null, comment: null,
  stops: null, custom_reply_body: null,
};
```
to:
```js
const BLANK_EXTRA_FIELDS = {
  origin_city: null, origin_state: null, origin_zip: null,
  dest_city: null, dest_state: null, dest_zip: null,
  equipment: null, weight: null, commodity: null, temperature: null, comment: null,
  stops: null, custom_reply_body: null,
  early_pu: null, late_pu: null, late_del: null, extra_stops: [],
};
```
Then find the test `'saves edits to route, equipment, and cargo fields alongside rate and status'` and change its expectation:
```js
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(5, {
        origin_city: 'Dallas', origin_state: 'TX', origin_zip: '75201',
        dest_city: 'Milwaukee', dest_state: 'IL', dest_zip: '60601',
        equipment: 'V', weight: '40000', commodity: 'General', temperature: null, comment: 'Call ahead',
        stops: 0, target_pay: 1500, status: 'covered', custom_reply_body: null,
      });
```
to:
```js
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(5, {
        origin_city: 'Dallas', origin_state: 'TX', origin_zip: '75201',
        dest_city: 'Milwaukee', dest_state: 'IL', dest_zip: '60601',
        equipment: 'V', weight: '40000', commodity: 'General', temperature: null, comment: 'Call ahead',
        stops: 0, target_pay: 1500, status: 'covered', custom_reply_body: null,
        early_pu: null, late_pu: null, late_del: null, extra_stops: [],
      });
```
Then append these new tests inside the `describe('RateModal', ...)` block:
```js
  test('prefills date fields from the load\'s early_pu/late_pu/late_del and saves them back as MySQL datetimes', async () => {
    const loadWithDates = {
      ...LOAD,
      early_pu: new Date(2026, 7, 12, 9, 0).toISOString(),
      late_pu: new Date(2026, 7, 12, 9, 0).toISOString(),
      late_del: new Date(2026, 7, 14, 8, 0).toISOString(),
    };
    loadsApi.updateLoad.mockResolvedValue(loadWithDates);
    render(<RateModal load={loadWithDates} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/early pickup/i)).toHaveValue('2026-08-12T09:00');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      const payload = loadsApi.updateLoad.mock.calls[0][1];
      expect(payload.early_pu).toBe('2026-08-12 09:00:00');
      expect(payload.late_pu).toBe('2026-08-12 09:00:00');
      expect(payload.late_del).toBe('2026-08-14 08:00:00');
    });
  });

  test('adding an extra stop and saving includes it in extra_stops, converted to a MySQL datetime', async () => {
    loadsApi.updateLoad.mockResolvedValue(LOAD);
    render(<RateModal load={LOAD} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add a stop/i }));
    fireEvent.change(screen.getByLabelText(/stop 1 city/i), { target: { value: 'Fort Worth' } });
    fireEvent.change(screen.getByLabelText(/stop 1 state/i), { target: { value: 'TX' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      const payload = loadsApi.updateLoad.mock.calls[0][1];
      expect(payload.extra_stops).toEqual([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }]);
    });
  });

  test('discards a blank extra-stop row (no city or state) instead of saving it', async () => {
    loadsApi.updateLoad.mockResolvedValue(LOAD);
    render(<RateModal load={LOAD} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add a stop/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      const payload = loadsApi.updateLoad.mock.calls[0][1];
      expect(payload.extra_stops).toEqual([]);
    });
  });

  test('prefills the extra-stops editor from the load\'s existing extra_stops', () => {
    const loadWithStops = { ...LOAD, extra_stops: [{ type: 'delivery', city: 'Joliet', state: 'IL', datetime: null }] };
    render(<RateModal load={loadWithStops} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/stop 1 city/i)).toHaveValue('Joliet');
    expect(screen.getByLabelText(/stop 1 type/i)).toHaveValue('delivery');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/components/RateModal.test.jsx`
Expected: FAIL — no "early pickup" label, no "Add a stop" button, and the existing payload-shape tests no longer match

- [ ] **Step 3: Add date fields and the extra-stops editor**

In `frontend/src/components/RateModal.jsx`, change the imports:
```js
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { updateLoad, previewLoadReply } from '../api/loads';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
```
to:
```js
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { updateLoad, previewLoadReply } from '../api/loads';
import { useMotionPreset } from '../lib/motionConfig';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../lib/dateInput';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import ExtraStopsEditor from './ExtraStopsEditor';
```

Add new state, right after the existing `stops`/`targetPay`/`status` state declarations:
```js
  const [earlyPu, setEarlyPu] = useState(isoToDatetimeLocal(load.early_pu));
  const [latePu, setLatePu] = useState(isoToDatetimeLocal(load.late_pu));
  const [lateDel, setLateDel] = useState(isoToDatetimeLocal(load.late_del));
  const [extraStops, setExtraStops] = useState(() =>
    Array.isArray(load.extra_stops)
      ? load.extra_stops.map((s) => ({ type: s.type, city: s.city ?? '', state: s.state ?? '', datetime: isoToDatetimeLocal(s.datetime) }))
      : []
  );
```

In `handleSave`, change the `payload` object:
```js
    const payload = {
      ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, blankToNull(fields[field])])),
      stops: normalizedStops,
      target_pay: normalizedTargetPay,
      status,
      custom_reply_body: useCustomReply ? blankToNull(customReplyText) : null,
    };
```
to:
```js
    const payload = {
      ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, blankToNull(fields[field])])),
      stops: normalizedStops,
      target_pay: normalizedTargetPay,
      early_pu: datetimeLocalToMysql(earlyPu),
      late_pu: datetimeLocalToMysql(latePu),
      late_del: datetimeLocalToMysql(lateDel),
      extra_stops: extraStops
        .filter((s) => s.city.trim() !== '' || s.state.trim() !== '')
        .map((s) => ({ type: s.type, city: blankToNull(s.city), state: blankToNull(s.state), datetime: datetimeLocalToMysql(s.datetime) })),
      status,
      custom_reply_body: useCustomReply ? blankToNull(customReplyText) : null,
    };
```

In the JSX, add a new date-fields grid right after the "Dest city/State/Zip" grid and before the "Equipment/Weight" grid:
```jsx
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="earlyPu">
              Early pickup
            </label>
            <input
              id="earlyPu"
              type="datetime-local"
              value={earlyPu}
              onChange={(e) => setEarlyPu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="latePu">
              Late pickup
            </label>
            <input
              id="latePu"
              type="datetime-local"
              value={latePu}
              onChange={(e) => setLatePu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="lateDel">
              Late delivery
            </label>
            <input
              id="lateDel"
              type="datetime-local"
              value={lateDel}
              onChange={(e) => setLateDel(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
        </div>
```

Add `<ExtraStopsEditor stops={extraStops} onChange={setExtraStops} />` right before the `<div className="mb-4">` block that contains the "Use a custom reply for this load" checkbox.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/RateModal.test.jsx`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RateModal.jsx frontend/tests/components/RateModal.test.jsx
git commit -m "feat: edit pickup/delivery dates and extra stops from the load edit popup"
```

---

## Task 13: `AddLoadModal` component

**Files:**
- Create: `frontend/src/components/AddLoadModal.jsx`
- Test: `frontend/tests/components/AddLoadModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/components/AddLoadModal.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddLoadModal from '../../src/components/AddLoadModal';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

describe('AddLoadModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('shows an error and does not call the API when load # is blank', async () => {
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));
    await waitFor(() => {
      expect(screen.getByText(/load # is required/i)).toBeInTheDocument();
    });
    expect(loadsApi.createLoad).not.toHaveBeenCalled();
  });

  test('creates a load with only load_number set, leaving rate and comment blank', async () => {
    loadsApi.createLoad.mockResolvedValue({ id: 1, load_number: 'L1001' });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(loadsApi.createLoad).toHaveBeenCalledWith(expect.objectContaining({
        load_number: 'L1001', target_pay: null, comment: null, include_rate: true, extra_stops: [],
      }));
      expect(onCreated).toHaveBeenCalledWith({ id: 1, load_number: 'L1001' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('creates a load with the full set of fields, including an extra stop', async () => {
    loadsApi.createLoad.mockResolvedValue({ id: 2, load_number: 'L2002' });
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L2002' } });
    fireEvent.change(screen.getByLabelText(/origin city/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/origin state/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/dest city/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/dest state/i), { target: { value: 'IL' } });
    fireEvent.change(screen.getByLabelText(/target pay/i), { target: { value: '1500' } });
    fireEvent.click(screen.getByLabelText(/include rate in replies/i));
    fireEvent.click(screen.getByRole('button', { name: /add a stop/i }));
    fireEvent.change(screen.getByLabelText(/stop 1 city/i), { target: { value: 'Fort Worth' } });
    fireEvent.change(screen.getByLabelText(/stop 1 state/i), { target: { value: 'TX' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(loadsApi.createLoad).toHaveBeenCalledWith(expect.objectContaining({
        load_number: 'L2002', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
        target_pay: 1500, include_rate: false,
        extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }],
      }));
    });
  });

  test('shows the server error and does not close when creation fails', async () => {
    loadsApi.createLoad.mockRejectedValue(new Error('A load with number "L1001" already exists'));
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('calls onClose without creating when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(loadsApi.createLoad).not.toHaveBeenCalled();
  });

  test('rejects a non-integer stops value without calling the API', async () => {
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.change(screen.getByLabelText(/^stops$/i), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/stops must be a whole number/i)).toBeInTheDocument();
    });
    expect(loadsApi.createLoad).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/components/AddLoadModal.test.jsx`
Expected: FAIL — the component doesn't exist yet

- [ ] **Step 3: Implement the component**

`frontend/src/components/AddLoadModal.jsx`:
```jsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { createLoad } from '../api/loads';
import { datetimeLocalToMysql } from '../lib/dateInput';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import ExtraStopsEditor from './ExtraStopsEditor';

const MotionCard = motion(Card);

const TEXT_FIELDS = [
  'load_number', 'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip',
  'equipment', 'weight', 'commodity', 'temperature', 'comment',
];

function blankToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function AddLoadModal({ onClose, onCreated }) {
  const preset = useMotionPreset();
  const [fields, setFields] = useState(() => Object.fromEntries(TEXT_FIELDS.map((f) => [f, ''])));
  const [stops, setStops] = useState('');
  const [targetPay, setTargetPay] = useState('');
  const [earlyPu, setEarlyPu] = useState('');
  const [latePu, setLatePu] = useState('');
  const [lateDel, setLateDel] = useState('');
  const [includeRate, setIncludeRate] = useState(true);
  const [extraStops, setExtraStops] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleFieldChange(field, value) {
    setFields((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    setError(null);

    const loadNumber = fields.load_number.trim();
    if (loadNumber === '') {
      setError('Load # is required.');
      return;
    }

    const trimmedPay = String(targetPay).trim();
    let normalizedTargetPay = null;
    if (trimmedPay !== '') {
      const parsed = Number(trimmedPay);
      if (Number.isNaN(parsed)) {
        setError('Target pay must be a number.');
        return;
      }
      normalizedTargetPay = parsed;
    }

    const trimmedStops = String(stops).trim();
    let normalizedStops = null;
    if (trimmedStops !== '') {
      const parsed = Number(trimmedStops);
      if (Number.isNaN(parsed) || !Number.isInteger(parsed)) {
        setError('Stops must be a whole number.');
        return;
      }
      normalizedStops = parsed;
    }

    const payload = {
      load_number: loadNumber,
      ...Object.fromEntries(TEXT_FIELDS.filter((f) => f !== 'load_number').map((field) => [field, blankToNull(fields[field])])),
      stops: normalizedStops,
      target_pay: normalizedTargetPay,
      early_pu: datetimeLocalToMysql(earlyPu),
      late_pu: datetimeLocalToMysql(latePu),
      late_del: datetimeLocalToMysql(lateDel),
      include_rate: includeRate,
      extra_stops: extraStops
        .filter((s) => s.city.trim() !== '' || s.state.trim() !== '')
        .map((s) => ({ type: s.type, city: blankToNull(s.city), state: blankToNull(s.state), datetime: datetimeLocalToMysql(s.datetime) })),
    };

    setSaving(true);
    createLoad(payload)
      .then((created) => {
        onCreated(created);
        onClose();
      })
      .catch((err) => {
        setError(err.message || 'Failed to create the load.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-load-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      {...preset.modal.backdrop}
    >
      <MotionCard className="max-h-[85vh] w-full max-w-lg overflow-y-auto" {...preset.modal.card}>
        <h2 id="add-load-title" className="mb-4 text-lg font-semibold text-text">
          Add a load
        </h2>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="load_number">
            Load #
          </label>
          <input
            id="load_number"
            value={fields.load_number}
            onChange={(e) => handleFieldChange('load_number', e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_city">
              Origin city
            </label>
            <input id="origin_city" value={fields.origin_city} onChange={(e) => handleFieldChange('origin_city', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_state">
              State
            </label>
            <input id="origin_state" value={fields.origin_state} onChange={(e) => handleFieldChange('origin_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_zip">
              Zip
            </label>
            <input id="origin_zip" value={fields.origin_zip} onChange={(e) => handleFieldChange('origin_zip', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_city">
              Dest city
            </label>
            <input id="dest_city" value={fields.dest_city} onChange={(e) => handleFieldChange('dest_city', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_state">
              State
            </label>
            <input id="dest_state" value={fields.dest_state} onChange={(e) => handleFieldChange('dest_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_zip">
              Zip
            </label>
            <input id="dest_zip" value={fields.dest_zip} onChange={(e) => handleFieldChange('dest_zip', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="earlyPu">
              Early pickup
            </label>
            <input id="earlyPu" type="datetime-local" value={earlyPu} onChange={(e) => setEarlyPu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="latePu">
              Late pickup
            </label>
            <input id="latePu" type="datetime-local" value={latePu} onChange={(e) => setLatePu(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="lateDel">
              Late delivery
            </label>
            <input id="lateDel" type="datetime-local" value={lateDel} onChange={(e) => setLateDel(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="equipment">
              Equipment
            </label>
            <input id="equipment" value={fields.equipment} onChange={(e) => handleFieldChange('equipment', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="weight">
              Weight
            </label>
            <input id="weight" value={fields.weight} onChange={(e) => handleFieldChange('weight', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="commodity">
              Commodity
            </label>
            <input id="commodity" value={fields.commodity} onChange={(e) => handleFieldChange('commodity', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="temperature">
              Temperature
            </label>
            <input id="temperature" value={fields.temperature} onChange={(e) => handleFieldChange('temperature', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="stops">
              Stops
            </label>
            <input id="stops" value={stops} onChange={(e) => setStops(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="comment">
          Comment
        </label>
        <textarea id="comment" value={fields.comment} onChange={(e) => handleFieldChange('comment', e.target.value)} rows={2}
          className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />

        <ExtraStopsEditor stops={extraStops} onChange={setExtraStops} />

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="targetPay">
              Target pay
            </label>
            <input id="targetPay" type="number" step="0.01" value={targetPay} onChange={(e) => setTargetPay(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-text" htmlFor="includeRate">
              <input id="includeRate" type="checkbox" checked={includeRate} onChange={(e) => setIncludeRate(e.target.checked)} />
              Include rate in replies
            </label>
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Adding...' : 'Add load'}
          </PrimaryButton>
        </div>
      </MotionCard>
    </motion.div>
  );
}

export default AddLoadModal;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/AddLoadModal.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AddLoadModal.jsx frontend/tests/components/AddLoadModal.test.jsx
git commit -m "feat: add AddLoadModal for manually creating a single load"
```

---

## Task 14: Wire "+ Add Load" into `MainToolPage`

**Files:**
- Modify: `frontend/src/pages/MainToolPage.jsx`
- Modify: `frontend/tests/pages/MainToolPage.test.jsx`

- [ ] **Step 1: Write the failing test**

Append to the `describe('MainToolPage', ...)` block in `frontend/tests/pages/MainToolPage.test.jsx`:
```js
  test('opens the Add Load modal and refreshes the table after creating a load', async () => {
    loadsApi.createLoad.mockResolvedValue({ id: 9, load_number: 'NEW1' });
    renderPage({ username: 'admin', onLogout: vi.fn() });
    await waitFor(() => screen.getByText(/no loads found/i));

    fireEvent.click(screen.getByRole('button', { name: /\+ add load/i }));
    expect(screen.getByText(/^add a load$/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'NEW1' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    // LoadsStatsRow + LoadsTable + DatExportSection each fetch independently on mount and on refreshKey change
    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(6);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `frontend/`): `npx vitest run tests/pages/MainToolPage.test.jsx -t "Add Load"`
Expected: FAIL — there's no "+ Add Load" button yet

- [ ] **Step 3: Add the button, state, and modal**

In `frontend/src/pages/MainToolPage.jsx`, change the imports:
```js
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import LoadsStatsRow from '../components/LoadsStatsRow';
import RateModal from '../components/RateModal';
```
to:
```js
import UploadPanel from '../components/UploadPanel';
import LoadsTable from '../components/LoadsTable';
import LoadsStatsRow from '../components/LoadsStatsRow';
import RateModal from '../components/RateModal';
import AddLoadModal from '../components/AddLoadModal';
import PrimaryButton from '../components/PrimaryButton';
```

Add state, right after `const [selectedLoad, setSelectedLoad] = useState(null);`:
```js
  const [addLoadOpen, setAddLoadOpen] = useState(false);
```

Add a handler, right after `handleUploadComplete`:
```js
  function handleLoadCreated() {
    setRefreshKey((k) => k + 1);
  }
```

Change:
```jsx
              <LoadsStatsRow refreshKey={refreshKey} />
              <UploadPanel onUploadComplete={handleUploadComplete} />
              <LoadsTable refreshKey={refreshKey} onSelectLoad={setSelectedLoad} />
              <DatExportSection refreshKey={refreshKey} />
```
to:
```jsx
              <LoadsStatsRow refreshKey={refreshKey} />
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <UploadPanel onUploadComplete={handleUploadComplete} />
                </div>
                <PrimaryButton onClick={() => setAddLoadOpen(true)} className="shrink-0">
                  + Add Load
                </PrimaryButton>
              </div>
              <LoadsTable refreshKey={refreshKey} onSelectLoad={setSelectedLoad} />
              <DatExportSection refreshKey={refreshKey} />
```

Change:
```jsx
      <AnimatePresence>
        {selectedLoad && (
          <RateModal load={selectedLoad} onClose={() => setSelectedLoad(null)} onSaved={handleSaved} />
        )}
      </AnimatePresence>
```
to:
```jsx
      <AnimatePresence>
        {selectedLoad && (
          <RateModal load={selectedLoad} onClose={() => setSelectedLoad(null)} onSaved={handleSaved} />
        )}
        {addLoadOpen && (
          <AddLoadModal onClose={() => setAddLoadOpen(false)} onCreated={handleLoadCreated} />
        )}
      </AnimatePresence>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/pages/MainToolPage.test.jsx`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MainToolPage.jsx frontend/tests/pages/MainToolPage.test.jsx
git commit -m "feat: wire the Add Load modal into the Loads tab"
```

---

## Task 15: `LoadsTable` — per-row rate toggle, bulk rate action, and the multi-stop tag

**Files:**
- Modify: `frontend/src/components/LoadsTable.jsx`
- Modify: `frontend/tests/components/LoadsTable.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('LoadsTable', ...)` block in `frontend/tests/components/LoadsTable.test.jsx` (outside the nested `describe` blocks, e.g. right after the `'shows an error when delete fails'` test):
```js
  test('shows a checked rate toggle by default and unchecked when include_rate is 0', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, { ...SAMPLE_LOAD_2, include_rate: 0 }]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.getByLabelText(/include rate for l1001/i)).toBeChecked();
    expect(screen.getByLabelText(/include rate for a2002/i)).not.toBeChecked();
  });

  test('toggling the rate switch calls updateLoad with the new include_rate value', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    loadsApi.updateLoad.mockResolvedValue({ ...SAMPLE_LOAD, include_rate: 0 });
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    fireEvent.click(screen.getByLabelText(/include rate for l1001/i));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { include_rate: false });
    });
  });

  test('shows a red "Needs stops added" tag when the comment suggests multi-stop and there are no structured extra stops', async () => {
    loadsApi.listLoads.mockResolvedValue([{ ...SAMPLE_LOAD, comment: '2nd pickup required', extra_stops: [] }]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.getByText(/needs stops added/i)).toBeInTheDocument();
  });

  test('shows a blue "Stops added" tag once structured extra stops exist, instead of the red one', async () => {
    loadsApi.listLoads.mockResolvedValue([
      { ...SAMPLE_LOAD, comment: '2nd pickup required', extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }] },
    ]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.getByText(/^stops added$/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs stops added/i)).not.toBeInTheDocument();
  });

  test('shows no multi-stop tag for an ordinary load', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.queryByText(/needs stops added/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^stops added$/i)).not.toBeInTheDocument();
  });
```
Then, inside the `describe('row selection and bulk actions', ...)` block, append:
```js
    test('choosing a bulk rate action calls bulkSetIncludeRate with the selected ids', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkSetIncludeRate.mockResolvedValue({ updated: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select all loads'));
      fireEvent.change(screen.getByLabelText(/rate for selected/i), { target: { value: 'exclude' } });

      await waitFor(() => {
        expect(loadsApi.bulkSetIncludeRate).toHaveBeenCalledWith([1, 2], false);
      });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/components/LoadsTable.test.jsx`
Expected: FAIL — no rate toggle, no bulk rate control, no multi-stop tags yet

- [ ] **Step 3: Implement the changes**

In `frontend/src/components/LoadsTable.jsx`, change the imports:
```js
import { useEffect, useMemo, useState } from 'react';
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import Badge from './Badge';
import Card from './Card';
import Skeleton from './Skeleton';
```
to:
```js
import { useEffect, useMemo, useState } from 'react';
import { listLoads, updateLoad, deleteLoad, bulkDeleteLoads, bulkUpdateLoadStatus, bulkSetIncludeRate } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import { multiStopTagVariant } from '../lib/lookupMessage';
import Badge from './Badge';
import Card from './Card';
import Skeleton from './Skeleton';
```

Add two handlers, right after `handleBulkStatusChange`:
```js
  function handleIncludeRateChange(load, checked) {
    setActionError(null);
    setBusyLoadId(load.id);
    updateLoad(load.id, { include_rate: checked })
      .catch((err) => {
        setActionError(err.message || 'Failed to update rate.');
      })
      .finally(() => {
        setBusyLoadId(null);
      });
  }

  function handleBulkIncludeRate(e) {
    const value = e.target.value;
    if (!value) return;
    setActionError(null);
    setBulkBusy(true);
    bulkSetIncludeRate(Array.from(selectedIds), value === 'include')
      .then(() => {
        setSelectedIds(new Set());
      })
      .catch((err) => setActionError(err.message || 'Failed to update rate for selected loads.'))
      .finally(() => {
        setBulkBusy(false);
        e.target.value = '';
      });
  }
```

In the bulk-actions bar JSX, add a new `<select>` right after the existing "Mark as..." `<select>` and before the delete-confirmation block:
```jsx
          <select
            aria-label="Rate for selected"
            defaultValue=""
            onChange={handleBulkIncludeRate}
            disabled={bulkBusy}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-60"
          >
            <option value="" disabled>
              Rate...
            </option>
            <option value="include">Include rate</option>
            <option value="exclude">Exclude rate</option>
          </select>
```

In the table header, change:
```jsx
              <th className="py-2 pr-4">Status</th>
              <th className="py-2"></th>
```
to:
```jsx
              <th className="py-2 pr-4">Rate</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2"></th>
```

In the row rendering, change:
```jsx
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span>{load.load_number}</span>
                    {Boolean(load.custom_reply_body) && <Badge variant="warning">Modified</Badge>}
                  </div>
                </td>
```
to:
```jsx
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span>{load.load_number}</span>
                    {Boolean(load.custom_reply_body) && <Badge variant="warning">Modified</Badge>}
                    {multiStopTagVariant(load) === 'error' && <Badge variant="error">Needs stops added</Badge>}
                    {multiStopTagVariant(load) === 'info' && <Badge variant="info">Stops added</Badge>}
                  </div>
                </td>
```

And change:
```jsx
                <td className="py-2 pr-4">{load.target_pay}</td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Status for ${load.load_number}`}
```
to:
```jsx
                <td className="py-2 pr-4">{load.target_pay}</td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    aria-label={`Include rate for ${load.load_number}`}
                    checked={Boolean(load.include_rate)}
                    onChange={(e) => handleIncludeRateChange(load, e.target.checked)}
                    disabled={busyLoadId === load.id}
                  />
                </td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Status for ${load.load_number}`}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/LoadsTable.test.jsx`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LoadsTable.jsx frontend/tests/components/LoadsTable.test.jsx
git commit -m "feat: add per-row/bulk rate toggle and the multi-stop tag to the loads board"
```

---

## Task 16: `ReviewQueue` — rate override checkbox and the blue "stops added" state

**Files:**
- Modify: `frontend/src/components/ReviewQueue.jsx`
- Modify: `frontend/tests/components/ReviewQueue.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('ReviewQueue', ...)` block in `frontend/tests/components/ReviewQueue.test.jsx`, right after the existing `'labels the badge MULTI-DROP...'` test:
```js
  test('shows a blue "extra stops already added" badge instead of the red warning once the matched load has structured extra stops', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      {
        ...INQUIRY,
        matched_load_stops: 1,
        matched_load_comment: '2nd pickup in Fort Worth',
        matched_load_extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }],
      },
    ]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByText(/extra stops already added/i)).toBeInTheDocument();
    expect(screen.queryByText(/add extra stops manually/i)).not.toBeInTheDocument();
  });

  test('shows the rate checkbox, checked by default, when the matched load has a target pay and include_rate is on', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      { ...INQUIRY, matched_load_target_pay: 1500, matched_load_include_rate: 1, reply_body: 'PU: DALLAS, TX\nRate: $1,500' },
    ]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByLabelText(/include rate in this reply/i)).toBeChecked();
  });

  test('unchecking the rate checkbox strips the Rate line from the draft without changing the load', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      { ...INQUIRY, matched_load_target_pay: 1500, matched_load_include_rate: 1, reply_body: 'PU: DALLAS, TX\nRate: $1,500' },
    ]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    fireEvent.click(screen.getByLabelText(/include rate in this reply/i));

    expect(screen.getByLabelText(/reply/i)).toHaveValue('PU: DALLAS, TX');
  });

  test('checking the rate checkbox appends a Rate line built from the matched load\'s target pay', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      { ...INQUIRY, matched_load_target_pay: 1500, matched_load_include_rate: 0, reply_body: 'PU: DALLAS, TX' },
    ]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByLabelText(/include rate in this reply/i)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(/include rate in this reply/i));

    expect(screen.getByLabelText(/reply/i)).toHaveValue('PU: DALLAS, TX\nRate: $1,500');
  });

  test('does not show the rate checkbox when the matched load has no target pay', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY, matched_load_target_pay: null }]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.queryByLabelText(/include rate in this reply/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/components/ReviewQueue.test.jsx`
Expected: FAIL — no rate checkbox, and the multi-stop badge doesn't yet consider `matched_load_extra_stops`

- [ ] **Step 3: Implement the changes**

In `frontend/src/components/ReviewQueue.jsx`, change the import:
```js
import { detectMultiStop } from '../lib/lookupMessage';
```
to:
```js
import { detectMultiStop, multiStopTagVariant } from '../lib/lookupMessage';
```

Add state, right after `const [actioningId, setActioningId] = useState(null);`:
```js
  const [rateOverrides, setRateOverrides] = useState({});
```

Add two helpers, right after `handleDraftChange`:
```js
  function isRateIncluded(inquiry) {
    if (inquiry.id in rateOverrides) return rateOverrides[inquiry.id];
    return Boolean(Number(inquiry.matched_load_include_rate));
  }

  function handleRateToggle(inquiry, checked) {
    setRateOverrides((prev) => ({ ...prev, [inquiry.id]: checked }));
    const targetPay = Number(inquiry.matched_load_target_pay);
    const rateLine = `Rate: $${targetPay.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    setDrafts((prev) => {
      const current = prev[inquiry.id] ?? '';
      const withoutRate = current.split('\n').filter((line) => !line.startsWith('Rate: ')).join('\n');
      const next = checked ? (withoutRate ? `${withoutRate}\n${rateLine}` : rateLine) : withoutRate;
      return { ...prev, [inquiry.id]: next };
    });
  }
```

In the render loop, change:
```jsx
              const multiStopFlag = detectMultiStop({
                comment: inquiry.matched_load_comment,
                stops: inquiry.matched_load_stops,
              });
              return (
```
to:
```jsx
              const multiStopFlag = detectMultiStop({
                comment: inquiry.matched_load_comment,
                stops: inquiry.matched_load_stops,
              });
              const multiStopVariant = multiStopTagVariant({
                comment: inquiry.matched_load_comment,
                stops: inquiry.matched_load_stops,
                extra_stops: inquiry.matched_load_extra_stops,
              });
              return (
```

Change:
```jsx
                  {multiStopFlag && (
                    <Badge variant="error">{multiStopFlag} — add extra stops manually</Badge>
                  )}
                </div>
                <label className="mb-1 block text-xs text-text-muted" htmlFor={`reply-${inquiry.id}`}>
                  Reply
                </label>
```
to:
```jsx
                  {multiStopVariant === 'error' && (
                    <Badge variant="error">{multiStopFlag} — add extra stops manually</Badge>
                  )}
                  {multiStopVariant === 'info' && <Badge variant="info">Extra stops already added</Badge>}
                </div>
                {inquiry.matched_load_target_pay !== null && inquiry.matched_load_target_pay !== undefined && (
                  <label className="mb-2 flex items-center gap-2 text-xs text-text-muted" htmlFor={`rate-toggle-${inquiry.id}`}>
                    <input
                      id={`rate-toggle-${inquiry.id}`}
                      type="checkbox"
                      checked={isRateIncluded(inquiry)}
                      onChange={(e) => handleRateToggle(inquiry, e.target.checked)}
                    />
                    Include rate in this reply
                  </label>
                )}
                <label className="mb-1 block text-xs text-text-muted" htmlFor={`reply-${inquiry.id}`}>
                  Reply
                </label>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ReviewQueue.test.jsx`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReviewQueue.jsx frontend/tests/components/ReviewQueue.test.jsx
git commit -m "feat: add a per-reply rate override and upgrade the multi-stop warning to blue once resolved"
```

---

## Task 17: `ContactMethodModal` — drop the per-export rate choice

**Files:**
- Modify: `frontend/src/components/ContactMethodModal.jsx`
- Modify: `frontend/tests/components/ContactMethodModal.test.jsx`

- [ ] **Step 1: Update the tests**

In `frontend/tests/components/ContactMethodModal.test.jsx`, change:
```js
  test('defaults to phone contact, no contact line, and no rate', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith({ contactMethod: 'phone', commentContact: '', rateChoice: 'none' });
  });
```
to:
```js
  test('defaults to phone contact and no contact line', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith({ contactMethod: 'phone', commentContact: '' });
  });
```
Delete the entire `'reports the chosen rate choice'` test:
```js
  test('reports the chosen rate choice', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('radio', { name: /include for all loads/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ rateChoice: 'all' }));
  });

```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/components/ContactMethodModal.test.jsx`
Expected: FAIL — the component still reports `rateChoice`, and the rate radios still exist

- [ ] **Step 3: Remove the rate fieldset**

In `frontend/src/components/ContactMethodModal.jsx`, remove the state line:
```js
  const [rateChoice, setRateChoice] = useState('none');
```

Change:
```js
  function handleConfirm() {
    onConfirm({
      contactMethod,
      commentContact: includeContactLine ? commentContact.trim() : '',
      rateChoice,
    });
  }
```
to:
```js
  function handleConfirm() {
    onConfirm({
      contactMethod,
      commentContact: includeContactLine ? commentContact.trim() : '',
    });
  }
```

Remove the entire fieldset and helper paragraph:
```jsx
        <fieldset className="mb-6">
          <legend className="mb-2 text-sm text-text-muted">DAT Loadboard Rate</legend>
          <label className="mb-1 flex items-center gap-2 text-sm text-text">
            <input type="radio" name="rateChoice" value="all" checked={rateChoice === 'all'} onChange={() => setRateChoice('all')} />
            Include for all loads
          </label>
          <label className="mb-1 flex items-center gap-2 text-sm text-text">
            <input type="radio" name="rateChoice" value="some" checked={rateChoice === 'some'} onChange={() => setRateChoice('some')} />
            Choose per load
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="radio" name="rateChoice" value="none" checked={rateChoice === 'none'} onChange={() => setRateChoice('none')} />
            Don&apos;t include rate
          </label>
        </fieldset>

        <p className="mb-4 text-xs text-text-muted">Controls whether the Target Pay value is included as the DAT Loadboard Rate.</p>

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ContactMethodModal.test.jsx`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ContactMethodModal.jsx frontend/tests/components/ContactMethodModal.test.jsx
git commit -m "feat: drop the per-export rate choice from ContactMethodModal"
```

---

## Task 18: `datExport.js` — read `include_rate` directly

**Files:**
- Modify: `frontend/src/lib/datExport.js`
- Modify: `frontend/tests/lib/datExport.test.js`

- [ ] **Step 1: Update the tests**

In `frontend/tests/lib/datExport.test.js`, replace these three tests:
```js
  test('rate choice "all" includes the rate on every row', () => {
    const { exportRows } = processLoadsForExport([load({ target_pay: 1500 })], { rateChoice: 'all' });
    expect(exportRows[0]['DAT Loadboard Rate']).toBe(1500);
  });

  test('rate choice "none" omits the rate from every row', () => {
    const { exportRows } = processLoadsForExport([load({ target_pay: 1500 })], { rateChoice: 'none' });
    expect(exportRows[0]['DAT Loadboard Rate']).toBe('');
  });

  test('rate choice "some" uses the per-load override map, including an edited rate value', () => {
    const { exportRows } = processLoadsForExport(
      [load({ id: 1, target_pay: 1500 })],
      { rateChoice: 'some', rateOverrides: { 1: { include: true, value: 1800 } } }
    );
    expect(exportRows[0]['DAT Loadboard Rate']).toBe(1800);
  });

  test('rate choice "some" with include: false omits the rate for that load', () => {
    const { exportRows } = processLoadsForExport(
      [load({ id: 1, target_pay: 1500 })],
      { rateChoice: 'some', rateOverrides: { 1: { include: false, value: null } } }
    );
    expect(exportRows[0]['DAT Loadboard Rate']).toBe('');
  });
```
with:
```js
  test('includes the rate when the load\'s include_rate switch is on', () => {
    const { exportRows } = processLoadsForExport([load({ target_pay: 1500, include_rate: 1 })], {});
    expect(exportRows[0]['DAT Loadboard Rate']).toBe(1500);
  });

  test('omits the rate when the load\'s include_rate switch is off', () => {
    const { exportRows } = processLoadsForExport([load({ target_pay: 1500, include_rate: 0 })], {});
    expect(exportRows[0]['DAT Loadboard Rate']).toBe('');
  });
```
And in `describe('buildDatCsv', ...)`, change:
```js
    const { exportRows } = processLoadsForExport([load()], { rateChoice: 'all' });
```
to:
```js
    const { exportRows } = processLoadsForExport([load({ include_rate: 1 })], {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/lib/datExport.test.js`
Expected: FAIL — `processLoadsForExport` still reads `rateChoice`/`rateOverrides`, which are no longer passed

- [ ] **Step 3: Simplify `processLoadsForExport`**

In `frontend/src/lib/datExport.js`, inside `buildExpandedRows`, change:
```js
function buildExpandedRows(loads, options, anomalies) {
  const { commentContact, rateChoice, rateOverrides } = options;
  const expandedRows = [];
```
to:
```js
function buildExpandedRows(loads, options, anomalies) {
  const { commentContact } = options;
  const expandedRows = [];
```

Change:
```js
    const includeRate =
      rateChoice === 'all' ? true : rateChoice === 'some' ? Boolean(rateOverrides[load.id] && rateOverrides[load.id].include) : false;
    const rateOverrideValue = rateOverrides[load.id] && rateOverrides[load.id].value;

    const baseRow = {
      order,
      origCity: finalOrigCity, origState: finalOrigState, destCity: finalDestCity, destState: finalDestState,
      equipment,
      weightNum,
      targetPayNum: rateOverrideValue !== undefined && rateOverrideValue !== null && rateOverrideValue !== '' ? Number(rateOverrideValue) : targetPayNum,
      pickupEarliest, pickupLatest,
      rawComment,
      comment,
      isTeam: String(load.raw_equipment || '').toUpperCase() === 'POTM',
      includeRate,
      loadId: load.id,
    };
```
to:
```js
    const includeRate = Boolean(load.include_rate);

    const baseRow = {
      order,
      origCity: finalOrigCity, origState: finalOrigState, destCity: finalDestCity, destState: finalDestState,
      equipment,
      weightNum,
      targetPayNum,
      pickupEarliest, pickupLatest,
      rawComment,
      comment,
      isTeam: String(load.raw_equipment || '').toUpperCase() === 'POTM',
      includeRate,
      loadId: load.id,
    };
```

Change the `processLoadsForExport` function and its doc comment:
```js
// options: { contactMethod: 'phone'|'email', commentContact: string, rateChoice: 'all'|'some'|'none',
//            rateOverrides: { [loadId]: { include: boolean, value: number|string|null } } }
export function processLoadsForExport(loads, options) {
  const { contactMethod = 'phone', commentContact = '', rateChoice = 'none', rateOverrides = {} } = options || {};
  const anomalies = makeEmptyAnomalies();

  const expandedRows = buildExpandedRows(loads, { commentContact, rateChoice, rateOverrides }, anomalies);
  const finalRows = dedupExpandedRows(expandedRows, anomalies);
  const exportRows = finalRows.map((row) => buildDatRow(row, contactMethod));

  return { finalRows, exportRows, anomalies };
}
```
to:
```js
// options: { contactMethod: 'phone'|'email', commentContact: string }
// Each load's own include_rate switch (persisted on the load, not chosen
// per export) controls whether its DAT Loadboard Rate is populated.
export function processLoadsForExport(loads, options) {
  const { contactMethod = 'phone', commentContact = '' } = options || {};
  const anomalies = makeEmptyAnomalies();

  const expandedRows = buildExpandedRows(loads, { commentContact }, anomalies);
  const finalRows = dedupExpandedRows(expandedRows, anomalies);
  const exportRows = finalRows.map((row) => buildDatRow(row, contactMethod));

  return { finalRows, exportRows, anomalies };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/datExport.test.js`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/datExport.js frontend/tests/lib/datExport.test.js
git commit -m "feat: drive DAT export rate inclusion from each load's include_rate switch"
```

---

## Task 19: `DatExportSection` — drop the rate-selection step

**Files:**
- Modify: `frontend/src/components/DatExportSection.jsx`
- Modify: `frontend/tests/components/DatExportSection.test.jsx`

- [ ] **Step 1: Update the tests**

In `frontend/tests/components/DatExportSection.test.jsx`, replace these two tests:
```js
  test('confirming with rate choice "all" downloads a CSV immediately and shows the anomaly report', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByRole('button', { name: /generate dat export/i }));

    fireEvent.click(screen.getByRole('button', { name: /generate dat export/i }));
    fireEvent.click(screen.getByRole('radio', { name: /include for all loads/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/downloaded a dat csv with 1 row/i)).toBeInTheDocument();
    expect(screen.getByText(/anomaly report/i)).toBeInTheDocument();
    // the modal may still be mid-exit-animation briefly
    await waitFor(() => {
      expect(screen.queryByText(/dat contact method/i)).not.toBeInTheDocument();
    });
  });

  test('confirming with rate choice "some" opens the per-load rate selection modal instead of exporting immediately', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByRole('button', { name: /generate dat export/i }));

    fireEvent.click(screen.getByRole('button', { name: /generate dat export/i }));
    fireEvent.click(screen.getByRole('radio', { name: /choose per load/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText(/choose loads to include a rate on/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/downloaded a dat csv with 1 row/i)).toBeInTheDocument();
  });
```
with:
```js
  test('confirming the contact method downloads a CSV immediately, using each load\'s rate switch', async () => {
    loadsApi.listLoads.mockResolvedValue([{ ...LOADS[0], include_rate: 1 }]);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByRole('button', { name: /generate dat export/i }));

    fireEvent.click(screen.getByRole('button', { name: /generate dat export/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/downloaded a dat csv with 1 row/i)).toBeInTheDocument();
    expect(screen.getByText(/anomaly report/i)).toBeInTheDocument();
    // the modal may still be mid-exit-animation briefly
    await waitFor(() => {
      expect(screen.queryByText(/dat contact method/i)).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/components/DatExportSection.test.jsx`
Expected: FAIL — the component still routes "choose per load" through `RateSelectionModal`, and the "include for all loads" radio no longer exists (removed in Task 17)

- [ ] **Step 3: Simplify the component**

Replace the full contents of `frontend/src/components/DatExportSection.jsx` with:
```jsx
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listLoads } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import { processLoadsForExport, buildDatCsv, buildDatExportFilename, countAnomalies } from '../lib/datExport';
import ContactMethodModal from './ContactMethodModal';
import AnomalyReport from './AnomalyReport';
import LoadLookupPanel from './LoadLookupPanel';
import BlastModal from './BlastModal';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import Skeleton from './Skeleton';

function downloadCsv(csv, filename) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DatExportSection({ refreshKey }) {
  const [loads, setLoads] = useState([]);
  const [fetchStatus, setFetchStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [fetchError, setFetchError] = useState(null);
  const [step, setStep] = useState('idle'); // 'idle' | 'contactMethod'
  const [result, setResult] = useState(null);
  const [blastTarget, setBlastTarget] = useState(null);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    setFetchStatus('loading');
    setFetchError(null);
    listLoads('active')
      .then((data) => {
        if (!ignore) {
          setLoads(data);
          setFetchStatus('ready');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFetchError(err.message || 'Failed to load active loads.');
          setFetchStatus('error');
        }
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, liveTick]);

  useEffect(() => {
    return subscribe('load:changed', () => setLiveTick((t) => t + 1));
  }, []);

  function handleContactConfirm(options) {
    const { exportRows, anomalies } = processLoadsForExport(loads, options);
    const csv = buildDatCsv(exportRows);
    downloadCsv(csv, buildDatExportFilename());
    setResult({ anomalies, exportedCount: exportRows.length });
    setStep('idle');
  }

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">DAT Export</h2>
          {fetchStatus === 'loading' && <Skeleton height="1rem" width="12rem" />}
          {fetchStatus === 'error' && (
            <p role="alert" className="text-sm text-error">
              {fetchError}
            </p>
          )}
          {fetchStatus === 'ready' && <p className="text-sm text-text-muted">{loads.length} active load(s) ready to export.</p>}
        </div>
        <PrimaryButton onClick={() => setStep('contactMethod')} disabled={fetchStatus !== 'ready' || loads.length === 0}>
          Generate DAT Export
        </PrimaryButton>
      </Card>

      {result && (
        <>
          <p className="text-sm text-text-muted">
            Downloaded a DAT CSV with {result.exportedCount} row(s). {countAnomalies(result.anomalies)} anomaly flag(s) below.
          </p>
          <AnomalyReport anomalies={result.anomalies} />
        </>
      )}

      {fetchStatus === 'ready' && loads.length > 0 && (
        <LoadLookupPanel loads={loads} onOpenBlast={(load, showRate) => setBlastTarget({ load, showRate })} />
      )}

      <AnimatePresence>
        {step === 'contactMethod' && <ContactMethodModal onCancel={() => setStep('idle')} onConfirm={handleContactConfirm} />}
      </AnimatePresence>
      <AnimatePresence>
        {blastTarget && (
          <BlastModal load={blastTarget.load} initialShowRate={blastTarget.showRate} onClose={() => setBlastTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default DatExportSection;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/DatExportSection.test.jsx`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DatExportSection.jsx frontend/tests/components/DatExportSection.test.jsx
git commit -m "feat: drop the per-export rate-selection step from DAT export"
```

---

## Task 20: Delete `RateSelectionModal`

**Files:**
- Delete: `frontend/src/components/RateSelectionModal.jsx`
- Delete: `frontend/tests/components/RateSelectionModal.test.jsx`

- [ ] **Step 1: Confirm nothing still imports it**

Run (from `frontend/`): `grep -rl "RateSelectionModal" src tests`
Expected: no output (Task 19 already removed the only import, in `DatExportSection.jsx`)

- [ ] **Step 2: Delete both files**

```bash
git rm frontend/src/components/RateSelectionModal.jsx frontend/tests/components/RateSelectionModal.test.jsx
```

- [ ] **Step 3: Run the full frontend suite to confirm nothing else depended on it**

Run (from `frontend/`): `npx vitest run`
Expected: PASS (no failures related to the removed files)

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove RateSelectionModal, superseded by the persistent per-load rate switch"
```

---

## Task 21: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run (from `backend/`): `npm test`
Expected: PASS, every test file green (existing tests plus all added in Tasks 1–6)

- [ ] **Step 2: Run the full frontend suite**

Run (from `frontend/`): `npm test`
Expected: PASS, every test file green (existing tests plus all added in Tasks 7–20)

- [ ] **Step 3: Manual smoke test**

With both servers running (`cd backend && npm start`, `cd frontend && npm run dev`), verify by hand (per the design spec's testing approach — there is no additional automated coverage beyond Tasks 1–20 for this):
- Toggle a load's rate switch off on the Loads board, open its inquiry preview/reply, confirm the Rate line is gone; toggle back on, confirm it returns.
- Click "+ Add Load", create a load with only a load # set, confirm it appears on the board with an empty rate and comment.
- Edit that load, add two extra stops (one pickup, one delivery), save, then use "Preview reply" (via the custom-reply toggle) or a real inbound test inquiry to confirm both appear correctly ordered.
- Confirm the board shows a red tag on a load whose comment mentions "2nd pickup" before you've added structured stops, and that it turns blue once you add one.
- Run a DAT export end-to-end and confirm the downloaded CSV's rate column matches each load's current switch state.

- [ ] **Step 4: Report status**

If all automated tests pass and the manual smoke test looks right, the feature set from the design spec is complete. If anything fails, fix it directly (don't skip ahead) and re-run the relevant suite before moving on.
