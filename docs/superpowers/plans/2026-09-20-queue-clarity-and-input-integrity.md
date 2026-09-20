# Queue Clarity & Input Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the review queue show the email and load behind every draft reply, let a wrong match be corrected, add a live-ticking age indicator to review queue cards, and replace every free-text US state field with a constrained picker — plus an unsaved-changes guard on every modal/sheet in the app.

**Architecture:** Five small, independently-testable frontend primitives (`StateSelect`, `useDirtyGuard`, `useCloseConfirmation`, `UnsavedChangesBar`, `RelativeTime`, `LoadPicker`) get built first, then wired into the five existing components that need them (`AddLoadModal`, `RateModal`, `BlastModal`, `CarrierSheet`, `CarrierMapPage`, `ExtraStopsEditor`, `ReviewQueue`). Two small backend additions (a re-assign route, a load-number lookup route) and one ENUM widening support the frontend changes.

**Tech Stack:** Express + MySQL (mysql2) backend, React + Vite frontend, Jest (backend) + Vitest/Testing Library (frontend), Tailwind CSS, Framer Motion.

---

## Before you start

Read `docs/superpowers/specs/2026-09-20-queue-clarity-and-input-integrity-design.md` in full — this plan implements it. Read `docs/superpowers/specs/2026-09-20-broker-tool-roadmap.md` for the surrounding context (this is sub-project 1 of 8).

Two clarifications this plan makes that the design spec left implicit — noted here so you don't have to reconcile them yourself:

1. The design spec's architecture section says `LoadPicker` is "used by B25 to re-assign an inquiry, and by F4 to resolve a load number on the lane form." The spec's own UI section then describes F4 as a **typed field + blur-triggered lookup** (mirroring `BookingCarrierFields`' MC lookup), not a browsing dropdown. This plan follows the more detailed UI section: `LoadPicker` (a searchable dropdown) is used **only** by B25 in the review queue. F4 uses a plain input and the new `GET /api/loads/lookup` route directly, with no `LoadPicker` involved.
2. `StateSelect` commits a value to its parent **immediately** when the typed text is an exact match for a real 2-letter state code (not just on blur) — this preserves compatibility with several existing tests that use `fireEvent.change(input, { target: { value: 'TX' } })` and assert on the result without simulating a blur afterward. Full-name typing (`"Texas"`) and any other case still only resolves on blur or Enter.

---

## Task 1: Widen the `match_tier` ENUM to add `'manual'`

**Files:**
- Modify: `backend/sql/schema.sql`
- Modify: `backend/scripts/setup-db.js`

- [ ] **Step 1: Update the fresh-install schema**

In `backend/sql/schema.sql`, find this line inside the `email_inquiries` table definition:

```sql
  match_tier ENUM('load_number','city_state','city','state','none') NOT NULL DEFAULT 'none',
```

Replace it with:

```sql
  match_tier ENUM('load_number','city_state','city','state','manual','none') NOT NULL DEFAULT 'none',
```

- [ ] **Step 2: Add the migration for existing databases**

Open `backend/scripts/setup-db.js`. Find the `replyColumns` loop inside `migrateSchema` (it ends with the closing `}` right before the `carriers` table's `CREATE TABLE IF NOT EXISTS` block). Immediately after that loop's closing brace, add:

```javascript
  // 'manual' records that a human chose this inquiry's match via the
  // review queue's re-assign control -- distinguishing it from every
  // heuristic tier matters because it is the only tier known-correct by
  // construction (see the sub-project 1 design spec).
  const [matchTierCol] = await conn.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_inquiries' AND COLUMN_NAME = 'match_tier'`,
    [databaseName]
  );
  if (matchTierCol[0] && !matchTierCol[0].COLUMN_TYPE.includes("'manual'")) {
    await conn.query(`ALTER TABLE email_inquiries MODIFY COLUMN match_tier ENUM('load_number','city_state','city','state','manual','none') NOT NULL DEFAULT 'none'`);
  }
```

- [ ] **Step 3: Run the migration against both databases**

From the `backend/` directory:

```bash
npm run setup-db
```

Expected: prints `Database setup complete.` with no errors. This applies the ALTER to both `DB_NAME` and `DB_NAME_TEST` (see `.env`), which the backend test suite needs before Task 4's tests can pass.

- [ ] **Step 4: Commit**

```bash
git add backend/sql/schema.sql backend/scripts/setup-db.js
git commit -m "feat: widen email_inquiries.match_tier to include 'manual'"
```

---

## Task 2: Join the load's number and equipment into every inquiry row

**Files:**
- Modify: `backend/src/lib/inquiryQueries.js`
- Test: `backend/tests/inquiries.test.js`

- [ ] **Step 1: Write the failing test**

Add this test to `backend/tests/inquiries.test.js`, alongside the other `GET /api/inquiries` tests that check joined fields (e.g. right after the "includes the matched load's stops count" test):

```javascript
  test('includes the matched load\'s load_number and equipment for the review queue\'s load header', async () => {
    const [loadResult] = await pool.query(
      "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, equipment, user_id, status) VALUES ('L4521', 'Dallas', 'TX', 'Chicago', 'IL', 'V', ?, 'active')",
      [userId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Dallas load inquiry', '2026-08-01 08:00:00', ?, 'load_number', 'matched')`,
      [userId, accountId, loadResult.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body[0].matched_load_load_number).toBe('L4521');
    expect(res.body[0].matched_load_equipment).toBe('V');
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend
npx jest inquiries.test.js -t "load_number and equipment"
```

Expected: FAIL — `res.body[0].matched_load_load_number` is `undefined`.

- [ ] **Step 3: Add the two fields to the join**

In `backend/src/lib/inquiryQueries.js`, find `INQUIRY_JOIN_FIELDS`:

```javascript
const INQUIRY_JOIN_FIELDS = `
    l.origin_city AS matched_load_origin_city, l.origin_state AS matched_load_origin_state,
    l.dest_city AS matched_load_dest_city, l.dest_state AS matched_load_dest_state,
    l.early_pu AS matched_load_early_pu, l.late_pu AS matched_load_late_pu,
    l.early_del AS matched_load_early_del, l.late_del AS matched_load_late_del,
    l.weight AS matched_load_weight, l.stops AS matched_load_stops, l.comment AS matched_load_comment,
    l.target_pay AS matched_load_target_pay, l.include_rate AS matched_load_include_rate,
    l.extra_stops AS matched_load_extra_stops, l.custom_reply_body AS matched_load_custom_reply_body`;
```

Replace it with:

```javascript
const INQUIRY_JOIN_FIELDS = `
    l.load_number AS matched_load_load_number, l.equipment AS matched_load_equipment,
    l.origin_city AS matched_load_origin_city, l.origin_state AS matched_load_origin_state,
    l.dest_city AS matched_load_dest_city, l.dest_state AS matched_load_dest_state,
    l.early_pu AS matched_load_early_pu, l.late_pu AS matched_load_late_pu,
    l.early_del AS matched_load_early_del, l.late_del AS matched_load_late_del,
    l.weight AS matched_load_weight, l.stops AS matched_load_stops, l.comment AS matched_load_comment,
    l.target_pay AS matched_load_target_pay, l.include_rate AS matched_load_include_rate,
    l.extra_stops AS matched_load_extra_stops, l.custom_reply_body AS matched_load_custom_reply_body`;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest inquiries.test.js -t "load_number and equipment"
```

Expected: PASS.

- [ ] **Step 5: Run the full inquiries suite to confirm nothing else broke**

```bash
npx jest inquiries.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/inquiryQueries.js backend/tests/inquiries.test.js
git commit -m "feat: join load_number and equipment into inquiry rows"
```

---

## Task 3: Support oldest-first ordering on `GET /api/inquiries`

**Files:**
- Modify: `backend/src/routes/inquiries.js`
- Test: `backend/tests/inquiries.test.js`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/inquiries.test.js`, near the existing "lists only the current user's own inquiries, newest first" test:

```javascript
  test('supports order=oldest for the review queue, without changing the default newest-first order', async () => {
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm1', 'a@example.com', 'Older', '2026-08-01 08:00:00', 'none', 'needs_review')`,
      [userId, accountId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm2', 'b@example.com', 'Newer', '2026-08-02 08:00:00', 'none', 'needs_review')`,
      [userId, accountId]
    );

    const defaultRes = await agent.get('/api/inquiries');
    expect(defaultRes.body.map((r) => r.subject)).toEqual(['Newer', 'Older']);

    const oldestRes = await agent.get('/api/inquiries?order=oldest');
    expect(oldestRes.body.map((r) => r.subject)).toEqual(['Older', 'Newer']);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest inquiries.test.js -t "order=oldest"
```

Expected: FAIL — the `oldestRes` assertion fails because both requests return newest-first.

- [ ] **Step 3: Add the `order` param**

In `backend/src/routes/inquiries.js`, find:

```javascript
  router.get('/', asyncHandler(async (req, res) => {
    const { reply_status } = req.query;
    const params = [req.session.userId];
    let sql = `
      SELECT ei.*, ${INQUIRY_JOIN_FIELDS}
      FROM email_inquiries ei
      LEFT JOIN loads l ON l.id = ei.matched_load_id
      WHERE ei.user_id = ?`;
    if (reply_status) {
      sql += ' AND ei.reply_status = ?';
      params.push(reply_status);
    }
    sql += ' ORDER BY ei.received_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows.map(attachLiveReplyBody));
  }));
```

Replace it with:

```javascript
  router.get('/', asyncHandler(async (req, res) => {
    const { reply_status, order } = req.query;
    const params = [req.session.userId];
    let sql = `
      SELECT ei.*, ${INQUIRY_JOIN_FIELDS}
      FROM email_inquiries ei
      LEFT JOIN loads l ON l.id = ei.matched_load_id
      WHERE ei.user_id = ?`;
    if (reply_status) {
      sql += ' AND ei.reply_status = ?';
      params.push(reply_status);
    }
    // The review queue (a work queue) requests oldest-first so the most
    // overdue inquiry sorts to the top; every other caller (the inquiry
    // log) keeps the default newest-first, since that's a log meant to be
    // read most-recent-first.
    sql += order === 'oldest' ? ' ORDER BY ei.received_at ASC' : ' ORDER BY ei.received_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows.map(attachLiveReplyBody));
  }));
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest inquiries.test.js -t "order=oldest"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/inquiries.js backend/tests/inquiries.test.js
git commit -m "feat: support order=oldest on GET /api/inquiries"
```

---

## Task 4: `PATCH /api/inquiries/:id/match` — re-assign an inquiry to a different load

**Files:**
- Modify: `backend/src/routes/inquiries.js`
- Test: `backend/tests/inquiries.test.js`

- [ ] **Step 1: Write the failing tests**

Add this whole `describe` block to `backend/tests/inquiries.test.js`, alongside the existing `describe('POST /:id/reject', ...)` block:

```javascript
  describe('PATCH /:id/match', () => {
    let inquiryId;
    let loadId;
    let otherLoadId;

    beforeEach(async () => {
      const [loadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L1', 'Dallas', 'TX', 'Chicago', 'IL', ?, 'active')",
        [userId]
      );
      loadId = loadResult.insertId;
      const [otherLoadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L2', 'Miami', 'FL', 'Atlanta', 'GA', ?, 'active')",
        [userId]
      );
      otherLoadId = otherLoadResult.insertId;
      const [result] = await pool.query(
        `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status, reply_status)
         VALUES (?, ?, 'm1', 'carrier@example.com', 'Wrong match?', '2026-08-01 08:00:00', ?, 'city', 'matched', 'pending_review')`,
        [userId, accountId, loadId]
      );
      inquiryId = result.insertId;
    });

    test('rejects unauthenticated requests', async () => {
      const res = await request(app).patch(`/api/inquiries/${inquiryId}/match`);
      expect(res.status).toBe(401);
    });

    test('re-assigns the inquiry to a different load and marks the tier manual', async () => {
      const res = await agent.patch(`/api/inquiries/${inquiryId}/match`).send({ matched_load_id: otherLoadId });
      expect(res.status).toBe(200);
      expect(res.body.matched_load_id).toBe(otherLoadId);
      expect(res.body.match_tier).toBe('manual');
      expect(res.body.status).toBe('matched');
    });

    test('detaches the match when matched_load_id is null', async () => {
      const res = await agent.patch(`/api/inquiries/${inquiryId}/match`).send({ matched_load_id: null });
      expect(res.status).toBe(200);
      expect(res.body.matched_load_id).toBeNull();
      expect(res.body.match_tier).toBe('none');
      expect(res.body.status).toBe('needs_review');
    });

    test('returns 404 when the given load belongs to another user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherUsersLoad] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L9', 'X City', 'TX', 'Y City', 'TX', ?, 'active')",
        [otherUser.insertId]
      );

      const res = await agent.patch(`/api/inquiries/${inquiryId}/match`).send({ matched_load_id: otherUsersLoad.insertId });
      expect(res.status).toBe(404);

      const [rows] = await pool.query('SELECT matched_load_id FROM email_inquiries WHERE id = ?', [inquiryId]);
      expect(rows[0].matched_load_id).toBe(loadId);
    });

    test('returns 404 for an inquiry belonging to another user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherAccount] = await pool.query(
        'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
        [otherUser.insertId, 'other@example.com', 'other-refresh']
      );
      const [otherInquiry] = await pool.query(
        `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, received_at, match_tier, status, reply_status)
         VALUES (?, ?, 'm-other', NOW(), 'none', 'needs_review', 'pending_review')`,
        [otherUser.insertId, otherAccount.insertId]
      );

      const res = await agent.patch(`/api/inquiries/${otherInquiry.insertId}/match`).send({ matched_load_id: loadId });
      expect(res.status).toBe(404);
    });

    test('returns 400 when the inquiry is not pending_review', async () => {
      await pool.query("UPDATE email_inquiries SET reply_status = 'sent' WHERE id = ?", [inquiryId]);
      const res = await agent.patch(`/api/inquiries/${inquiryId}/match`).send({ matched_load_id: otherLoadId });
      expect(res.status).toBe(400);
    });

    test('emits inquiry:updated over the websocket hub', async () => {
      const wsHub = { emitToUser: jest.fn() };
      const hubApp = createApp(pool, wsHub);
      const hubAgent = request.agent(hubApp);
      await hubAgent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });

      await hubAgent.patch(`/api/inquiries/${inquiryId}/match`).send({ matched_load_id: otherLoadId });

      expect(wsHub.emitToUser).toHaveBeenCalledTimes(1);
      const [userIdArg, event, payload] = wsHub.emitToUser.mock.calls[0];
      expect(userIdArg).toBe(userId);
      expect(event).toBe('inquiry:updated');
      expect(payload.matched_load_id).toBe(otherLoadId);
    });
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest inquiries.test.js -t "PATCH /:id/match"
```

Expected: FAIL — `404` for every request (no such route exists yet).

- [ ] **Step 3: Import `fetchInquiryWithLoad`**

At the top of `backend/src/routes/inquiries.js`, find:

```javascript
const { INQUIRY_JOIN_FIELDS, attachLiveReplyBody } = require('../lib/inquiryQueries');
```

Replace it with:

```javascript
const { INQUIRY_JOIN_FIELDS, attachLiveReplyBody, fetchInquiryWithLoad } = require('../lib/inquiryQueries');
```

- [ ] **Step 4: Add the route**

Add this route in `backend/src/routes/inquiries.js`, right after the `router.post('/:id/reject', ...)` block:

```javascript
  // Re-assigns an inquiry to a different load than whichever tier picked
  // -- the automatic matcher (see matchingEngine.js) is a heuristic and
  // sometimes picks wrong; this is how a human corrects it. 'manual' marks
  // the correction as known-correct, distinct from every automatic tier.
  router.patch('/:id/match', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM email_inquiries WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    const inquiry = rows[0];
    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    if (inquiry.reply_status !== 'pending_review') {
      return res.status(400).json({ error: 'Inquiry is not pending review' });
    }

    const { matched_load_id } = req.body;
    let loadId = null;
    if (matched_load_id !== null && matched_load_id !== undefined) {
      const [loadRows] = await pool.query('SELECT id FROM loads WHERE id = ? AND user_id = ?', [matched_load_id, req.session.userId]);
      if (loadRows.length === 0) {
        return res.status(404).json({ error: 'Load not found' });
      }
      loadId = loadRows[0].id;
    }

    const matchTier = loadId ? 'manual' : 'none';
    const status = loadId ? 'matched' : 'needs_review';
    await pool.query(
      'UPDATE email_inquiries SET matched_load_id = ?, match_tier = ?, status = ? WHERE id = ?',
      [loadId, matchTier, status, req.params.id]
    );

    const updated = await fetchInquiryWithLoad(pool, req.params.id);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'inquiry:updated', updated);
    res.json(updated);
  }));
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx jest inquiries.test.js -t "PATCH /:id/match"
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Run the full inquiries suite**

```bash
npx jest inquiries.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/inquiries.js backend/tests/inquiries.test.js
git commit -m "feat: add PATCH /api/inquiries/:id/match to re-assign a wrong match"
```

---

## Task 5: `GET /api/loads/lookup` — exact load-number lookup

**Files:**
- Modify: `backend/src/routes/loads.js`
- Test: `backend/tests/loads.test.js`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `backend/tests/loads.test.js`, right before the existing `describe('GET /stats', ...)` block:

```javascript
  describe('GET /lookup', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/loads/lookup?load_number=L1001');
      expect(res.status).toBe(401);
    });

    test('returns the matching load for the current user', async () => {
      await pool.query(
        'INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, target_pay, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['L1001', 'Dallas', 'TX', 'Chicago', 'IL', 1500, userId]
      );

      const res = await agent.get('/api/loads/lookup?load_number=L1001');
      expect(res.status).toBe(200);
      expect(res.body.origin_city).toBe('Dallas');
      expect(Number(res.body.target_pay)).toBe(1500);
    });

    test('returns null when no load matches', async () => {
      const res = await agent.get('/api/loads/lookup?load_number=NOPE');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    test('returns null for a load belonging to another user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      await pool.query(
        'INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        ['L2002', 'Miami', 'FL', 'Atlanta', 'GA', otherUser.insertId]
      );

      const res = await agent.get('/api/loads/lookup?load_number=L2002');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    test('returns 400 when load_number is missing', async () => {
      const res = await agent.get('/api/loads/lookup');
      expect(res.status).toBe(400);
    });
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend
npx jest loads.test.js -t "GET /lookup"
```

Expected: FAIL — every request 404s (no route yet) or the "L1001" request is instead parsed as `GET /:id` with `id="lookup"`, also failing.

- [ ] **Step 3: Add the route**

In `backend/src/routes/loads.js`, find `router.get('/:id', asyncHandler(async (req, res) => {` (the first occurrence, right after `POST /`). Insert this new route immediately **before** it:

```javascript
  // Exact load-number lookup for the carrier lane-history form (see
  // CarrierSheet.jsx) -- typing a load number that exists autofills the
  // lane's origin/destination/rate/date instead of retyping them.
  // Registered before GET /:id so "lookup" isn't parsed as an id, same as
  // GET /stats above.
  router.get('/lookup', asyncHandler(async (req, res) => {
    const loadNumber = String(req.query.load_number || '').trim();
    if (!loadNumber) {
      return res.status(400).json({ error: 'load_number is required' });
    }
    const isAdmin = req.session.role === 'admin';
    const conditions = ['load_number = ?'];
    const params = [loadNumber];
    if (!isAdmin) {
      conditions.push('user_id = ?');
      params.push(req.session.userId);
    }
    const [rows] = await pool.query(`SELECT * FROM loads WHERE ${conditions.join(' AND ')}`, params);
    res.json(rows[0] || null);
  }));

```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest loads.test.js -t "GET /lookup"
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full loads suite**

```bash
npx jest loads.test.js
```

Expected: all tests PASS (confirms `/lookup` isn't shadowed by, and doesn't shadow, any other route).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js
git commit -m "feat: add GET /api/loads/lookup for exact load-number lookup"
```

---

## Task 6: Add full US state names for `StateSelect`'s typeahead

**Files:**
- Modify: `frontend/src/lib/usStates.js`

- [ ] **Step 1: Add the names export**

In `frontend/src/lib/usStates.js`, keep the existing `US_STATES` export exactly as-is (other code depends on it), and append:

```javascript
// Full names for StateSelect's typeahead -- lets "Texas" find TX the same
// way "TX" does, without requiring the two-letter code.
export const US_STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};
```

- [ ] **Step 2: Verify every code in `US_STATES` has a name**

```bash
cd frontend
node -e "
const { US_STATES, US_STATE_NAMES } = require('./src/lib/usStates.js');
const missing = US_STATES.filter((code) => !US_STATE_NAMES[code]);
if (missing.length) { console.error('Missing names for:', missing); process.exit(1); }
console.log('All', US_STATES.length, 'codes have names.');
" 2>&1 || node --input-type=module -e "
import { US_STATES, US_STATE_NAMES } from './src/lib/usStates.js';
const missing = US_STATES.filter((code) => !US_STATE_NAMES[code]);
if (missing.length) { console.error('Missing names for:', missing); process.exit(1); }
console.log('All', US_STATES.length, 'codes have names.');
"
```

Expected: `All 51 codes have names.` (This file uses ES module `export` syntax, so whichever of the two commands matches your Node setup will succeed — the first will fail with a `SyntaxError` if so, which is expected; just confirm the second one prints the success line.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/usStates.js
git commit -m "feat: add US_STATE_NAMES for StateSelect's typeahead"
```

---

## Task 7: `StateSelect` component

**Files:**
- Create: `frontend/src/components/StateSelect.jsx`
- Test: `frontend/tests/components/StateSelect.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/StateSelect.test.jsx`:

```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StateSelect from '../../src/components/StateSelect';

describe('StateSelect', () => {
  test('typing a valid two-letter code commits immediately, uppercased', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    expect(onChange).toHaveBeenCalledWith('TX');
  });

  test('typing an invalid state and blurring shows an error and does not call onChange', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Texs' } });
    fireEvent.blur(screen.getByLabelText('State'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/not a valid us state/i);
    expect(screen.getByLabelText('State')).toHaveValue('Texs');
  });

  test('typing a full state name and blurring resolves to the code', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Texas' } });
    fireEvent.blur(screen.getByLabelText('State'));
    expect(onChange).toHaveBeenCalledWith('TX');
  });

  test('clicking a dropdown option commits that state', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Cali' } });
    fireEvent.click(screen.getByRole('button', { name: /CA.*California/ }));
    expect(onChange).toHaveBeenCalledWith('CA');
  });

  test('clearing the field and blurring commits an empty value without an error', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="TX" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('State'));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('reflects an externally-changed value prop', () => {
    const { rerender } = render(<StateSelect id="s" ariaLabel="State" value="TX" onChange={vi.fn()} />);
    expect(screen.getByLabelText('State')).toHaveValue('TX');
    rerender(<StateSelect id="s" ariaLabel="State" value="IL" onChange={vi.fn()} />);
    expect(screen.getByLabelText('State')).toHaveValue('IL');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/components/StateSelect.test.jsx
```

Expected: FAIL with "Failed to resolve import" (the component doesn't exist yet).

- [ ] **Step 3: Create the component**

Create `frontend/src/components/StateSelect.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { US_STATES, US_STATE_NAMES } from '../lib/usStates';

function stateMatches(code, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return code.toLowerCase().startsWith(q) || US_STATE_NAMES[code].toLowerCase().includes(q);
}

// A constrained combobox for a US state field -- same structure as
// EquipmentPicker (typeable input, filtered dropdown, onMouseDown
// preventDefault to dodge the blur race), but for the 50-state-plus-DC
// vocabulary. Unlike a plain text input, it can never leave onChange
// holding a value that isn't a real state: typing "Texs" and blurring
// leaves the field showing "Texs" in an error state instead of silently
// committing a state that will never geocode or match anything downstream.
//
// A typed value that's already an exact 2-letter code match commits on
// every keystroke, not just on blur -- both because that's the natural
// way to type a code you already know, and because several existing
// call sites simulate a single change event with no following blur.
function StateSelect({ id, ariaLabel, value, onChange, className = '', dark = false }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!invalid) setQuery(value || '');
  }, [value, invalid]);

  const results = US_STATES.filter((code) => stateMatches(code, query));

  function commit(code) {
    setQuery(code);
    setOpen(false);
    setInvalid(false);
    onChange(code);
  }

  function resolveTyped(text) {
    const trimmed = text.trim();
    if (trimmed === '') return '';
    const upper = trimmed.toUpperCase();
    if (US_STATES.includes(upper)) return upper;
    const byName = US_STATES.find((code) => US_STATE_NAMES[code].toLowerCase() === trimmed.toLowerCase());
    return byName || null;
  }

  function handleChange(e) {
    const raw = e.target.value;
    setQuery(raw);
    setInvalid(false);
    setOpen(true);
    const upper = raw.trim().toUpperCase();
    if (US_STATES.includes(upper)) {
      onChange(upper);
    }
  }

  function resolveOnBlurOrEnter() {
    const resolved = resolveTyped(query);
    if (resolved === '') {
      setInvalid(false);
      onChange('');
      return;
    }
    if (resolved) {
      commit(resolved);
      return;
    }
    setInvalid(true);
  }

  function handleBlur() {
    setOpen(false);
    resolveOnBlurOrEnter();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      resolveOnBlurOrEnter();
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full ${className} ${invalid ? 'ring-2 ring-error' : ''}`}
      />
      {invalid && (
        <p role="alert" className="mt-1 text-xs text-error">
          Not a valid US state.
        </p>
      )}
      {open && !invalid && (
        <ul
          className={`absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border shadow-lg ${
            dark ? 'border-white/10 bg-[#12141c]' : 'border-border bg-surface'
          }`}
        >
          {results.length === 0 && (
            <li className={`px-3 py-2 text-sm ${dark ? 'text-white/50' : 'text-text-muted'}`}>No matching state</li>
          )}
          {results.map((code) => (
            <li key={code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(code)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  dark ? 'text-white hover:bg-white/10' : 'text-text hover:bg-surface-alt'
                }`}
              >
                <span className="font-semibold">{code}</span> — {US_STATE_NAMES[code]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default StateSelect;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/StateSelect.test.jsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StateSelect.jsx frontend/tests/components/StateSelect.test.jsx
git commit -m "feat: add StateSelect, a constrained US-state combobox"
```

---

## Task 8: `useDirtyGuard` hook

**Files:**
- Create: `frontend/src/lib/useDirtyGuard.js`
- Test: `frontend/tests/lib/useDirtyGuard.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/lib/useDirtyGuard.test.js`:

```javascript
import { describe, test, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDirtyGuard } from '../../src/lib/useDirtyGuard';

describe('useDirtyGuard', () => {
  test('is false when the values have not changed since mount', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { name: 'a' } },
    });
    expect(result.current).toBe(false);
    rerender({ values: { name: 'a' } });
    expect(result.current).toBe(false);
  });

  test('is true once a value changes from the mount-time snapshot', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { name: 'a' } },
    });
    rerender({ values: { name: 'b' } });
    expect(result.current).toBe(true);
  });

  test('is false again if the value is restored to its original snapshot', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { name: 'a' } },
    });
    rerender({ values: { name: 'b' } });
    expect(result.current).toBe(true);
    rerender({ values: { name: 'a' } });
    expect(result.current).toBe(false);
  });

  test('compares arrays and nested objects, not just top-level primitives', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { stops: [{ city: 'Dallas' }] } },
    });
    expect(result.current).toBe(false);
    rerender({ values: { stops: [{ city: 'Dallas' }, { city: 'Waco' }] } });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/lib/useDirtyGuard.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

Create `frontend/src/lib/useDirtyGuard.js`:

```javascript
import { useRef } from 'react';

// Reports whether `values` has changed since the hook first mounted, by
// deep-equality via JSON serialization -- good enough for the plain
// string/number/array-of-plain-objects form state every modal in this app
// uses, and avoids hand-writing a field-by-field comparison per caller.
// See useCloseConfirmation for the "what to do about it" half of this.
export function useDirtyGuard(values) {
  const initialRef = useRef(JSON.stringify(values));
  return JSON.stringify(values) !== initialRef.current;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/useDirtyGuard.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useDirtyGuard.js frontend/tests/lib/useDirtyGuard.test.js
git commit -m "feat: add useDirtyGuard hook"
```

---

## Task 9: `useCloseConfirmation` hook

**Files:**
- Create: `frontend/src/lib/useCloseConfirmation.js`
- Test: `frontend/tests/lib/useCloseConfirmation.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/lib/useCloseConfirmation.test.js`:

```javascript
import { describe, test, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloseConfirmation } from '../../src/lib/useCloseConfirmation';

describe('useCloseConfirmation', () => {
  test('requestClose calls onClose immediately when not dirty', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(false, onClose));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.confirming).toBe(false);
  });

  test('requestClose does not call onClose when dirty, and sets confirming', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(true, onClose));
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.confirming).toBe(true);
  });

  test('confirmDiscard calls the pending onClose and clears confirming', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(true, onClose));
    act(() => result.current.confirmDiscard());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.confirming).toBe(false);
  });

  test('cancelDiscard clears confirming without calling onClose', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(true, onClose));
    act(() => result.current.cancelDiscard());
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.confirming).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/lib/useCloseConfirmation.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

Create `frontend/src/lib/useCloseConfirmation.js`:

```javascript
import { useRef, useState } from 'react';

// Intercepts a close action when the caller reports unsaved changes,
// surfacing an inline "discard changes?" confirmation instead of closing
// immediately -- used by every modal/sheet in the app so leaving with
// unsaved edits is never silent. Pair with useDirtyGuard for the "has
// anything changed" half of this.
export function useCloseConfirmation() {
  const [confirming, setConfirming] = useState(false);
  const pendingCloseRef = useRef(null);

  function requestClose(isDirty, onClose) {
    if (!isDirty) {
      onClose();
      return;
    }
    pendingCloseRef.current = onClose;
    setConfirming(true);
  }

  function confirmDiscard() {
    setConfirming(false);
    const close = pendingCloseRef.current;
    pendingCloseRef.current = null;
    if (close) close();
  }

  function cancelDiscard() {
    setConfirming(false);
  }

  return { confirming, requestClose, confirmDiscard, cancelDiscard };
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/useCloseConfirmation.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useCloseConfirmation.js frontend/tests/lib/useCloseConfirmation.test.js
git commit -m "feat: add useCloseConfirmation hook"
```

---

## Task 10: `UnsavedChangesBar` component

**Files:**
- Create: `frontend/src/components/UnsavedChangesBar.jsx`
- Test: `frontend/tests/components/UnsavedChangesBar.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/UnsavedChangesBar.test.jsx`:

```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UnsavedChangesBar from '../../src/components/UnsavedChangesBar';

describe('UnsavedChangesBar', () => {
  test('renders the prompt and both actions', () => {
    render(<UnsavedChangesBar onDiscard={vi.fn()} onKeepEditing={vi.fn()} />);
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument();
  });

  test('calls onDiscard when Discard is clicked', () => {
    const onDiscard = vi.fn();
    render(<UnsavedChangesBar onDiscard={onDiscard} onKeepEditing={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  test('calls onKeepEditing when Keep editing is clicked', () => {
    const onKeepEditing = vi.fn();
    render(<UnsavedChangesBar onDiscard={vi.fn()} onKeepEditing={onKeepEditing} />);
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/components/UnsavedChangesBar.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/UnsavedChangesBar.jsx`:

```jsx
// The inline "leave without saving?" prompt shown in place of a modal's
// normal footer buttons once useCloseConfirmation reports it's confirming
// -- an inline swap (matching the app's existing inline confirm/cancel
// pattern for row deletes in LoadsTable) rather than a native confirm(),
// which can't be styled and blocks the whole page.
function UnsavedChangesBar({ onDiscard, onKeepEditing }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-error">Discard changes?</span>
      <button
        type="button"
        onClick={onDiscard}
        className="rounded-lg bg-error px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onKeepEditing}
        className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
      >
        Keep editing
      </button>
    </div>
  );
}

export default UnsavedChangesBar;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/UnsavedChangesBar.test.jsx
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UnsavedChangesBar.jsx frontend/tests/components/UnsavedChangesBar.test.jsx
git commit -m "feat: add UnsavedChangesBar component"
```

---

## Task 11: `RelativeTime` component

**Files:**
- Create: `frontend/src/components/RelativeTime.jsx`
- Test: `frontend/tests/components/RelativeTime.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/RelativeTime.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RelativeTime from '../../src/components/RelativeTime';

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders nothing for a falsy value', () => {
    const { container } = render(<RelativeTime value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows "just now" for a timestamp under a minute old, muted', () => {
    render(<RelativeTime value="2026-08-01T11:59:45Z" />);
    const el = screen.getByText('just now');
    expect(el.className).toMatch(/text-text-muted/);
  });

  test('shows minutes ago, normal text, between 15 and 30 minutes', () => {
    render(<RelativeTime value="2026-08-01T11:40:00Z" />); // 20 min ago
    const el = screen.getByText('20m ago');
    expect(el.className).toMatch(/text-text\b/);
  });

  test('shows amber between 30 and 60 minutes', () => {
    render(<RelativeTime value="2026-08-01T11:20:00Z" />); // 40 min ago
    const el = screen.getByText('40m ago');
    expect(el.className).toMatch(/text-warning/);
  });

  test('shows red past 60 minutes, with hours and minutes', () => {
    render(<RelativeTime value="2026-08-01T10:15:00Z" />); // 1h 45m ago
    const el = screen.getByText('1h 45m ago');
    expect(el.className).toMatch(/text-error/);
  });

  test('updates live as time passes, without a per-instance interval', async () => {
    render(<RelativeTime value="2026-08-01T11:59:00Z" />); // 1 min ago
    expect(screen.getByText('1m ago')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(30000);
    expect(screen.getByText('1m ago')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(30000);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/components/RelativeTime.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/RelativeTime.jsx`:

```jsx
import { useEffect, useState } from 'react';

const TICK_MS = 30000;
const listeners = new Set();
let intervalId = null;

function ensureTicking() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    listeners.forEach((listener) => listener());
  }, TICK_MS);
}

// One shared 30-second ticker for every mounted RelativeTime instance,
// rather than each row running its own timer -- doesn't scale to a busy
// inquiry log. The interval itself only exists while at least one
// instance is mounted.
function subscribeTick(listener) {
  listeners.add(listener);
  ensureTicking();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function formatRelative(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes === 0 ? `${hours}h ago` : `${hours}h ${remainderMinutes}m ago`;
}

function severityClass(minutes) {
  if (minutes < 15) return 'text-text-muted';
  if (minutes < 30) return 'text-text';
  if (minutes < 60) return 'text-warning';
  return 'text-error';
}

// Renders a live-ticking "N ago" for a timestamp, colored by age -- muted
// under 15 minutes, normal text 15-30, amber 30-60, red past an hour. A
// carrier's inquiry sitting unanswered for an hour should look urgent,
// not identical to one that just arrived.
function RelativeTime({ value, className = '' }) {
  const [, forceTick] = useState(0);

  useEffect(() => subscribeTick(() => forceTick((n) => n + 1)), []);

  if (!value) return null;

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const elapsedMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(elapsedMs / 60000);

  return (
    <span className={`${severityClass(minutes)} ${className}`} title={new Date(value).toLocaleString()}>
      {formatRelative(elapsedMs)}
    </span>
  );
}

export default RelativeTime;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/RelativeTime.test.jsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RelativeTime.jsx frontend/tests/components/RelativeTime.test.jsx
git commit -m "feat: add RelativeTime, a live-ticking age indicator"
```

---

## Task 12: `LoadPicker` component

**Files:**
- Create: `frontend/src/components/LoadPicker.jsx`
- Test: `frontend/tests/components/LoadPicker.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/LoadPicker.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoadPicker from '../../src/components/LoadPicker';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const LOAD_A = { id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' };
const LOAD_B = { id: 2, load_number: 'L2002', origin_city: 'Miami', origin_state: 'FL', dest_city: 'Atlanta', dest_state: 'GA' };

describe('LoadPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('fetches and lists the current user\'s active loads', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD_A, LOAD_B]);
    render(<LoadPicker ariaLabel="Search loads" onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/L1001/)).toBeInTheDocument();
      expect(screen.getByText(/L2002/)).toBeInTheDocument();
    });
    expect(loadsApi.listLoads).toHaveBeenCalledWith('active');
  });

  test('filters results by load number, city, or state as the user types', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD_A, LOAD_B]);
    render(<LoadPicker ariaLabel="Search loads" onSelect={vi.fn()} />);
    await waitFor(() => screen.getByText(/L1001/));

    fireEvent.change(screen.getByLabelText('Search loads'), { target: { value: 'miami' } });

    expect(screen.queryByText(/L1001/)).not.toBeInTheDocument();
    expect(screen.getByText(/L2002/)).toBeInTheDocument();
  });

  test('calls onSelect with the chosen load', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD_A]);
    const onSelect = vi.fn();
    render(<LoadPicker ariaLabel="Search loads" onSelect={onSelect} />);
    await waitFor(() => screen.getByText(/L1001/));

    fireEvent.click(screen.getByRole('button', { name: /L1001/ }));

    expect(onSelect).toHaveBeenCalledWith(LOAD_A);
  });

  test('shows an error message when the fetch fails', async () => {
    loadsApi.listLoads.mockRejectedValue(new Error('network error'));
    render(<LoadPicker ariaLabel="Search loads" onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/components/LoadPicker.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/LoadPicker.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';

function loadLabel(load) {
  const lane = load.origin_city && load.dest_city
    ? `${load.origin_city}, ${load.origin_state} → ${load.dest_city}, ${load.dest_state}`
    : 'No lane on file';
  return `${load.load_number} — ${lane}`;
}

function matchesQuery(load, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const haystack = `${load.load_number} ${load.origin_city || ''} ${load.origin_state || ''} ${load.dest_city || ''} ${load.dest_state || ''}`.toLowerCase();
  return haystack.includes(q);
}

// A searchable dropdown over the current user's active loads, matching on
// load number, origin, or destination -- used by ReviewQueue to re-assign
// an inquiry to a different load when the automatic match picked the
// wrong one.
function LoadPicker({ ariaLabel, onSelect, autoFocus = false }) {
  const [loads, setLoads] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [query, setQuery] = useState('');

  useEffect(() => {
    let ignore = false;
    listLoads('active')
      .then((data) => {
        if (!ignore) {
          setLoads(data);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!ignore) setStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, []);

  const results = loads.filter((load) => matchesQuery(load, query));

  return (
    <div>
      <input
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by load #, city, or state"
        className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
      />
      {status === 'loading' && <p className="mt-1 text-xs text-text-muted">Loading loads...</p>}
      {status === 'error' && <p className="mt-1 text-xs text-error">Failed to load your active loads.</p>}
      {status === 'ready' && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">No matching loads</li>}
          {results.map((load) => (
            <li key={load.id}>
              <button
                type="button"
                onClick={() => onSelect(load)}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-alt"
              >
                {loadLabel(load)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LoadPicker;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/LoadPicker.test.jsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LoadPicker.jsx frontend/tests/components/LoadPicker.test.jsx
git commit -m "feat: add LoadPicker component"
```

---

## Task 13: Frontend API — `reassignInquiry` and `order` support

**Files:**
- Modify: `frontend/src/api/inquiries.js`
- Test: `frontend/tests/api/inquiries.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `frontend/tests/api/inquiries.test.js`:

```javascript
  test('listInquiries adds &order=oldest when given an order option', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listInquiries('pending_review', { order: 'oldest' });
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries?reply_status=pending_review&order=oldest');
  });

  test('reassignInquiry patches /api/inquiries/:id/match with the new load id', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await reassignInquiry(1, 42);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries/1/match');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ matched_load_id: 42 });
  });

  test('reassignInquiry can detach the match by passing null', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await reassignInquiry(1, null);
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ matched_load_id: null });
  });
```

Update the import line at the top of the same file from:

```javascript
import { listInquiries, sendInquiryReply, rejectInquiry } from '../../src/api/inquiries';
```

to:

```javascript
import { listInquiries, sendInquiryReply, rejectInquiry, reassignInquiry } from '../../src/api/inquiries';
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/api/inquiries.test.js
```

Expected: FAIL — `reassignInquiry` is not exported, and the `order` test fails since the URL has no `order` param yet.

- [ ] **Step 3: Update the API module**

Replace the full contents of `frontend/src/api/inquiries.js` with:

```javascript
import { get, post, patch } from './client';

export function listInquiries(replyStatus, { order } = {}) {
  const params = new URLSearchParams();
  if (replyStatus) params.set('reply_status', replyStatus);
  if (order) params.set('order', order);
  const query = params.toString();
  return get(`/api/inquiries${query ? `?${query}` : ''}`);
}

export function sendInquiryReply(id, body) {
  return post(`/api/inquiries/${id}/send`, body ? { body } : {});
}

export function rejectInquiry(id) {
  return post(`/api/inquiries/${id}/reject`, {});
}

export function bulkSendInquiries(items) {
  return post('/api/inquiries/bulk-send', { items });
}

export function bulkRejectInquiries(ids) {
  return post('/api/inquiries/bulk-reject', { ids });
}

// Re-assigns an inquiry to a different load than whichever tier picked --
// pass null to detach the match entirely. See ReviewQueue's "Change
// match" control.
export function reassignInquiry(id, loadId) {
  return patch(`/api/inquiries/${id}/match`, { matched_load_id: loadId });
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/api/inquiries.test.js
```

Expected: all tests PASS (5 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/inquiries.js frontend/tests/api/inquiries.test.js
git commit -m "feat: add reassignInquiry and order support to the inquiries API client"
```

---

## Task 14: Frontend API — `lookupLoadByNumber`

**Files:**
- Modify: `frontend/src/api/loads.js`
- Test: `frontend/tests/api/loads.test.js`

- [ ] **Step 1: Write the failing test**

Check the existing import style at the top of `frontend/tests/api/loads.test.js` first (it likely imports individual named functions the same way `inquiries.test.js` does) and add `lookupLoadByNumber` to that import list. Then add:

```javascript
  test('lookupLoadByNumber gets /api/loads/lookup with the load number', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    await lookupLoadByNumber('L1001');
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/lookup?load_number=L1001');
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/api/loads.test.js
```

Expected: FAIL — `lookupLoadByNumber` is not exported.

- [ ] **Step 3: Add the function**

In `frontend/src/api/loads.js`, add (near `previewLoadReply`, since both are single-load GETs):

```javascript
export function lookupLoadByNumber(loadNumber) {
  return get(`/api/loads/lookup?load_number=${encodeURIComponent(loadNumber)}`);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/api/loads.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/loads.js frontend/tests/api/loads.test.js
git commit -m "feat: add lookupLoadByNumber to the loads API client"
```

---

## Task 15: Guard `buildLookupMessage` against a load with no lane (B20)

**Files:**
- Modify: `frontend/src/lib/lookupMessage.js`
- Test: `frontend/tests/lib/lookupMessage.test.js`

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/lib/lookupMessage.test.js`, inside the `describe('buildLookupMessage', ...)` block:

```javascript
  test('omits the PU/DEL line entirely for a side with no city, rather than printing "undefined"', () => {
    const msg = buildLookupMessage(load({ origin_city: '', origin_state: '', dest_city: '', dest_state: '' }), true);
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('PU:');
    expect(msg).not.toContain('DEL:');
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/lib/lookupMessage.test.js -t "printing"
```

Expected: FAIL — the message contains `PU: , ` and `DEL: , ` (empty but present, not literally "undefined" since the test load helper always supplies string fields — but the line is still wrongly present).

- [ ] **Step 3: Add a city/state formatting helper and use it**

In `frontend/src/lib/lookupMessage.js`, find `export function buildLookupMessage(load, showRate) {` and everything up through the two `lines.push(...)` calls for `puLine` and `delLine`:

```javascript
export function buildLookupMessage(load, showRate) {
  const lines = [];
  const comment = load.comment || '';

  let puLine = `PU: ${load.origin_city}, ${load.origin_state}${load.origin_zip ? ' ' + load.origin_zip : ''}`;
  if (load.early_pu || load.late_pu) {
    const puSched = buildPUSched(load.early_pu, load.late_pu);
    if (puSched) puLine += ' – ' + puSched;
  } else {
    const puDate = formatShortDateRange(formatDateOnly(load.early_pu), formatDateOnly(load.late_pu));
    const puSchedAlt = extractSched(comment, 'pu');
    if (puDate) puLine += ' – ' + puDate;
    if (puSchedAlt) puLine += ' – ' + puSchedAlt;
  }
  lines.push(puLine);

  let delLine = `DEL: ${load.dest_city}, ${load.dest_state}${load.dest_zip ? ' ' + load.dest_zip : ''}`;
  if (load.early_del || load.late_del) {
    const delSched = buildDELSched(load.early_del, load.late_del);
    if (delSched) delLine += ' – ' + delSched;
  } else {
    const delSchedAlt = extractSched(comment, 'del');
    if (delSchedAlt) delLine += ' – ' + delSchedAlt;
  }
  lines.push(delLine);
```

Replace it with:

```javascript
function formatLookupCityState(city, state, zip) {
  if (!city && !state) return null;
  const parts = [city, state].filter(Boolean);
  return `${parts.join(', ')}${zip ? ' ' + zip : ''}`;
}

export function buildLookupMessage(load, showRate) {
  const lines = [];
  const comment = load.comment || '';

  const originLoc = formatLookupCityState(load.origin_city, load.origin_state, load.origin_zip);
  if (originLoc) {
    let puLine = `PU: ${originLoc}`;
    if (load.early_pu || load.late_pu) {
      const puSched = buildPUSched(load.early_pu, load.late_pu);
      if (puSched) puLine += ' – ' + puSched;
    } else {
      const puDate = formatShortDateRange(formatDateOnly(load.early_pu), formatDateOnly(load.late_pu));
      const puSchedAlt = extractSched(comment, 'pu');
      if (puDate) puLine += ' – ' + puDate;
      if (puSchedAlt) puLine += ' – ' + puSchedAlt;
    }
    lines.push(puLine);
  }

  const destLoc = formatLookupCityState(load.dest_city, load.dest_state, load.dest_zip);
  if (destLoc) {
    let delLine = `DEL: ${destLoc}`;
    if (load.early_del || load.late_del) {
      const delSched = buildDELSched(load.early_del, load.late_del);
      if (delSched) delLine += ' – ' + delSched;
    } else {
      const delSchedAlt = extractSched(comment, 'del');
      if (delSchedAlt) delLine += ' – ' + delSchedAlt;
    }
    lines.push(delLine);
  }
```

Leave everything after this (commodity, weight, temp, rate) exactly as it is — `formatLookupCityState` is declared just above `buildLookupMessage` in the same module, not exported (nothing outside this file needs it).

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/lib/lookupMessage.test.js
```

Expected: all tests PASS, including every pre-existing one (the default `load()` helper always has both cities set, so its output is unchanged).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/lookupMessage.js frontend/tests/lib/lookupMessage.test.js
git commit -m "fix: omit PU/DEL lines for a missing lane instead of printing blank fields"
```

---

## Task 16: Wire `StateSelect` and the unsaved-changes guard into `AddLoadModal`

**Files:**
- Modify: `frontend/src/components/AddLoadModal.jsx`
- Test: `frontend/tests/components/AddLoadModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/components/AddLoadModal.test.jsx`:

```jsx
  test('typing into a field then clicking Cancel asks to discard before closing', () => {
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('"Keep editing" dismisses the discard prompt without closing', () => {
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/load #/i)).toHaveValue('L1001');
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/components/AddLoadModal.test.jsx -t "discard"
```

Expected: FAIL — `onClose` is called immediately on Cancel today, with no discard prompt.

- [ ] **Step 3: Wire in `StateSelect`, `useDirtyGuard`, and `useCloseConfirmation`**

In `frontend/src/components/AddLoadModal.jsx`, update the imports at the top from:

```jsx
import ModalCard from './ModalCard';
import CityStateAutocomplete from './CityStateAutocomplete';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import EquipmentPicker from './EquipmentPicker';
import DateRangeField from './DateRangeField';
```

to:

```jsx
import ModalCard from './ModalCard';
import CityStateAutocomplete from './CityStateAutocomplete';
import StateSelect from './StateSelect';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import EquipmentPicker from './EquipmentPicker';
import DateRangeField from './DateRangeField';
import UnsavedChangesBar from './UnsavedChangesBar';
import { useDirtyGuard } from '../lib/useDirtyGuard';
import { useCloseConfirmation } from '../lib/useCloseConfirmation';
```

Inside the `AddLoadModal` function, right after all the existing `useState` declarations (after `const [saving, setSaving] = useState(false);`) and before `function handleFieldChange(field, value) {`, add:

```jsx
  const isDirty = useDirtyGuard({ ...fields, targetPay, earlyPu, latePu, earlyDel, lateDel, includeRate });
  const closeConfirmation = useCloseConfirmation();

  function handleRequestClose() {
    closeConfirmation.requestClose(isDirty, onClose);
  }
```

Find the two `origin_state` and `dest_state` blocks:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_state">
              State
            </label>
            <input id="origin_state" value={fields.origin_state} onChange={(e) => handleFieldChange('origin_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
```

Replace with:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_state">
              State
            </label>
            <StateSelect
              id="origin_state"
              ariaLabel="Origin state"
              value={fields.origin_state}
              onChange={(state) => handleFieldChange('origin_state', state)}
              className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
```

And:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_state">
              State
            </label>
            <input id="dest_state" value={fields.dest_state} onChange={(e) => handleFieldChange('dest_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text" />
          </div>
```

Replace with:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_state">
              State
            </label>
            <StateSelect
              id="dest_state"
              ariaLabel="Destination state"
              value={fields.dest_state}
              onChange={(state) => handleFieldChange('dest_state', state)}
              className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
```

Finally, find the footer:

```jsx
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Adding...' : 'Add load'}
          </PrimaryButton>
        </div>
```

Replace with:

```jsx
        {closeConfirmation.confirming ? (
          <UnsavedChangesBar onDiscard={closeConfirmation.confirmDiscard} onKeepEditing={closeConfirmation.cancelDiscard} />
        ) : (
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={handleRequestClose}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSave} disabled={saving}>
              {saving ? 'Adding...' : 'Add load'}
            </PrimaryButton>
          </div>
        )}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/AddLoadModal.test.jsx
```

Expected: all tests PASS, including the two new ones and every pre-existing one (the "calls onClose without creating when Cancel is clicked" test clicks Cancel on a still-blank form, so `isDirty` is `false` and `onClose` still fires immediately).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AddLoadModal.jsx frontend/tests/components/AddLoadModal.test.jsx
git commit -m "feat: add StateSelect and an unsaved-changes guard to AddLoadModal"
```

---

## Task 17: Wire `StateSelect` and the unsaved-changes guard into `RateModal`

**Files:**
- Modify: `frontend/src/components/RateModal.jsx`
- Test: `frontend/tests/components/RateModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/components/RateModal.test.jsx` (use whichever load fixture the file's other tests use for `load={LOAD}`):

```jsx
  test('editing a field then clicking Cancel asks to discard before closing', () => {
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^weight$/i), { target: { value: '48000' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('editing a field then pressing Escape asks to discard before closing', () => {
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^weight$/i), { target: { value: '48000' } });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/components/RateModal.test.jsx -t "discard"
```

Expected: FAIL — both close paths still call `onClose` immediately.

- [ ] **Step 3: Wire in the guard and `StateSelect`**

Update the imports at the top of `frontend/src/components/RateModal.jsx` from:

```jsx
import ModalCard from './ModalCard';
import CityStateAutocomplete from './CityStateAutocomplete';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import ExtraStopsEditor from './ExtraStopsEditor';
import EquipmentPicker from './EquipmentPicker';
import DateRangeField from './DateRangeField';
import BookingCarrierFields from './BookingCarrierFields';
```

to:

```jsx
import ModalCard from './ModalCard';
import CityStateAutocomplete from './CityStateAutocomplete';
import StateSelect from './StateSelect';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import ExtraStopsEditor from './ExtraStopsEditor';
import EquipmentPicker from './EquipmentPicker';
import DateRangeField from './DateRangeField';
import BookingCarrierFields from './BookingCarrierFields';
import UnsavedChangesBar from './UnsavedChangesBar';
import { useDirtyGuard } from '../lib/useDirtyGuard';
import { useCloseConfirmation } from '../lib/useCloseConfirmation';
```

Right after the existing `const isMountedRef = useRef(true);` line (before the first `useEffect`), add:

```jsx
  const isDirty = useDirtyGuard({
    ...fields, stops, targetPay, earlyPu, latePu, earlyDel, lateDel,
    extraStops, status, useCustomReply, customReplyText,
  });
  const closeConfirmation = useCloseConfirmation();

  function handleRequestClose() {
    closeConfirmation.requestClose(isDirty, onClose);
  }
```

Find the Escape-key effect:

```jsx
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);
```

Replace it with:

```jsx
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        closeConfirmation.requestClose(isDirty, onClose);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, onClose]);
```

Find the `origin_state` input:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_state">
              State
            </label>
            <input
              id="origin_state"
              value={fields.origin_state}
              onChange={(e) => handleFieldChange('origin_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
```

Replace with:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="origin_state">
              State
            </label>
            <StateSelect
              id="origin_state"
              ariaLabel="Origin state"
              value={fields.origin_state}
              onChange={(state) => handleFieldChange('origin_state', state)}
              className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
```

Find the `dest_state` input:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_state">
              State
            </label>
            <input
              id="dest_state"
              value={fields.dest_state}
              onChange={(e) => handleFieldChange('dest_state', e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
```

Replace with:

```jsx
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="dest_state">
              State
            </label>
            <StateSelect
              id="dest_state"
              ariaLabel="Destination state"
              value={fields.dest_state}
              onChange={(state) => handleFieldChange('dest_state', state)}
              className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            />
          </div>
```

Find the footer:

```jsx
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </PrimaryButton>
        </div>
```

Replace with:

```jsx
        {closeConfirmation.confirming ? (
          <UnsavedChangesBar onDiscard={closeConfirmation.confirmDiscard} onKeepEditing={closeConfirmation.cancelDiscard} />
        ) : (
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={handleRequestClose}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </PrimaryButton>
          </div>
        )}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/RateModal.test.jsx
```

Expected: all tests PASS, including the two new ones and the pre-existing "closes when the Escape key is pressed" / "calls onClose without saving when Cancel is clicked" tests (both operate on an untouched form, so `isDirty` is `false`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RateModal.jsx frontend/tests/components/RateModal.test.jsx
git commit -m "feat: add StateSelect and an unsaved-changes guard to RateModal"
```

---

## Task 18: Wire the unsaved-changes guard and the missing-lane guard into `BlastModal`

**Files:**
- Modify: `frontend/src/components/BlastModal.jsx`
- Test: `frontend/tests/components/BlastModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to `frontend/tests/components/BlastModal.test.jsx`:

```jsx
  test('editing the subject then clicking Cancel asks to discard before closing', () => {
    const onClose = vi.fn();
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Edited subject' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('editing the subject then clicking the backdrop asks to discard before closing', () => {
    const onClose = vi.fn();
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Edited subject' } });
    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('refuses to build a blast for a load with no origin or destination', () => {
    const onClose = vi.fn();
    const bareLoad = { ...LOAD, origin_city: '', origin_state: '', dest_city: '', dest_state: '' };
    render(<BlastModal load={bareLoad} initialShowRate={false} onClose={onClose} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/missing its origin or destination/i);
    expect(screen.queryByLabelText(/subject/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/components/BlastModal.test.jsx -t "discard"
npx vitest run tests/components/BlastModal.test.jsx -t "missing its origin"
```

Expected: FAIL on both — `onClose` fires immediately today, and there's no missing-lane guard.

- [ ] **Step 3: Update `BlastModal.jsx`**

Update the imports at the top from:

```jsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { buildLookupMessage } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import Card from './Card';
import SecondaryButton from './SecondaryButton';
```

to:

```jsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { buildLookupMessage } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import { useDirtyGuard } from '../lib/useDirtyGuard';
import { useCloseConfirmation } from '../lib/useCloseConfirmation';
import Card from './Card';
import SecondaryButton from './SecondaryButton';
import UnsavedChangesBar from './UnsavedChangesBar';
```

Find the component body from its opening line through the end of the `handleDrop` function:

```jsx
function BlastModal({ load, initialShowRate, onClose }) {
  const preset = useMotionPreset();
  const [showRate, setShowRate] = useState(Boolean(initialShowRate));
  const [subject, setSubject] = useState(
    `Load Available | ${load.origin_city} ${load.origin_state} → ${load.dest_city} ${load.dest_state} | ${load.equipment}`
  );
  const [body, setBody] = useState(buildLookupMessage(load, Boolean(initialShowRate)));
  const [emailsText, setEmailsText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [invalidFlash, setInvalidFlash] = useState(false);
  const [fileError, setFileError] = useState(null);

  const validEmails = parseBlastEmails(emailsText);

  function handleRateToggle(e) {
    setShowRate(e.target.checked);
    setBody(buildLookupMessage(load, e.target.checked));
  }

  function handleOpenGmail() {
```

Replace it with:

```jsx
function BlastModal({ load, initialShowRate, onClose }) {
  const preset = useMotionPreset();
  const [showRate, setShowRate] = useState(Boolean(initialShowRate));
  const [subject, setSubject] = useState(
    `Load Available | ${load.origin_city} ${load.origin_state} → ${load.dest_city} ${load.dest_state} | ${load.equipment}`
  );
  const [body, setBody] = useState(buildLookupMessage(load, Boolean(initialShowRate)));
  const [emailsText, setEmailsText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [invalidFlash, setInvalidFlash] = useState(false);
  const [fileError, setFileError] = useState(null);

  const isDirty = useDirtyGuard({ subject, body, showRate, emailsText });
  const closeConfirmation = useCloseConfirmation();

  function handleRequestClose() {
    closeConfirmation.requestClose(isDirty, onClose);
  }

  const validEmails = parseBlastEmails(emailsText);

  // A load with no city on either end (e.g. quick-added with just a load
  // number) has nothing to build a real blast message from -- refuse to
  // open the normal form rather than send something reading
  // "PU: undefined, undefined" to a whole carrier list.
  const missingLane = !load.origin_city || !load.origin_state || !load.dest_city || !load.dest_state;

  function handleRateToggle(e) {
    setShowRate(e.target.checked);
    setBody(buildLookupMessage(load, e.target.checked));
  }

  function handleOpenGmail() {
```

Immediately after the closing brace of `handleDrop` (right before the component's `return (` for the main dialog), add the early-return branch:

```jsx
  if (missingLane) {
    return (
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="blast-modal-title"
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        {...preset.modal.backdrop}
      >
        <MotionCard className="w-full max-w-md" {...preset.modal.card}>
          <h2 id="blast-modal-title" className="mb-3 text-lg font-semibold text-text">
            Blast Email
          </h2>
          <p role="alert" className="text-sm text-error">
            Load {load.load_number} is missing its origin or destination, so a blast message can't be built yet. Add
            the lane in Edit before blasting this load.
          </p>
          <div className="mt-4 flex justify-end">
            <SecondaryButton onClick={onClose}>Close</SecondaryButton>
          </div>
        </MotionCard>
      </motion.div>
    );
  }

```

Find the main dialog's backdrop and close-button wiring:

```jsx
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      {...preset.modal.backdrop}
    >
      <MotionCard className="w-full max-w-lg" {...preset.modal.card}>
        <div className="mb-1 flex items-start justify-between">
          <h2 id="blast-modal-title" className="text-lg font-semibold text-text">
            Blast Email
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text">
            ✕
          </button>
        </div>
```

Replace with:

```jsx
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
      {...preset.modal.backdrop}
    >
      <MotionCard className="w-full max-w-lg" {...preset.modal.card}>
        <div className="mb-1 flex items-start justify-between">
          <h2 id="blast-modal-title" className="text-lg font-semibold text-text">
            Blast Email
          </h2>
          <button onClick={handleRequestClose} aria-label="Close" className="text-text-muted hover:text-text">
            ✕
          </button>
        </div>
```

Finally, find the footer:

```jsx
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          {/* Gmail's own brand blue, deliberately not the app's lime accent — matches the original tool's identical choice for this one external-service button. */}
          <button
            onClick={handleOpenGmail}
            className="rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Open in Gmail →
          </button>
        </div>
```

Replace with:

```jsx
        <div className="mt-5 flex justify-end gap-2">
          {closeConfirmation.confirming ? (
            <UnsavedChangesBar onDiscard={closeConfirmation.confirmDiscard} onKeepEditing={closeConfirmation.cancelDiscard} />
          ) : (
            <>
              <SecondaryButton onClick={handleRequestClose}>Cancel</SecondaryButton>
              {/* Gmail's own brand blue, deliberately not the app's lime accent — matches the original tool's identical choice for this one external-service button. */}
              <button
                onClick={handleOpenGmail}
                className="rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Open in Gmail →
              </button>
            </>
          )}
        </div>
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/BlastModal.test.jsx
```

Expected: all tests PASS, including the three new ones. The pre-existing "calls onClose when Cancel or the close button is clicked" and "calls onClose when clicking the modal backdrop" tests both click without editing anything first, so `isDirty` is `false` and `onClose` still fires immediately both times.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BlastModal.jsx frontend/tests/components/BlastModal.test.jsx
git commit -m "feat: add an unsaved-changes guard and a missing-lane guard to BlastModal"
```

---

## Task 19: Swap `StateSelect` into `CarrierMapPage`'s lane search

**Files:**
- Modify: `frontend/src/pages/CarrierMapPage.jsx`

No test changes in this task — `CarrierMapPage.test.jsx` already exercises the origin/destination state fields with `fireEvent.change(..., { target: { value: 'TX' } })` (an exact 2-letter code), which `StateSelect`'s live-commit-on-exact-match behavior (Task 7) satisfies without any test modification. This task is a verify-then-swap, not TDD, because there's no new behavior to drive out — just confirm the existing suite stays green.

- [ ] **Step 1: Confirm the current suite passes before changing anything**

```bash
cd frontend
npx vitest run tests/pages/CarrierMapPage.test.jsx
```

Expected: all tests PASS (baseline).

- [ ] **Step 2: Add the import**

In `frontend/src/pages/CarrierMapPage.jsx`, find:

```jsx
import CityStateAutocomplete from '../components/CityStateAutocomplete';
```

Add right after it:

```jsx
import StateSelect from '../components/StateSelect';
```

- [ ] **Step 3: Replace the origin state input**

Find:

```jsx
            <input
              aria-label="Origin state"
              placeholder="Origin state"
              value={lane.originState}
              onChange={(e) => setLane((prev) => ({ ...prev, originState: e.target.value }))}
              className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
            />
```

Replace with:

```jsx
            <StateSelect
              ariaLabel="Origin state"
              value={lane.originState}
              onChange={(state) => setLane((prev) => ({ ...prev, originState: state }))}
              className="border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
              dark
            />
```

- [ ] **Step 4: Replace the destination state input**

Find:

```jsx
            <input
              aria-label="Destination state"
              placeholder="Destination state"
              value={lane.destState}
              onChange={(e) => setLane((prev) => ({ ...prev, destState: e.target.value }))}
              className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
            />
```

Replace with:

```jsx
            <StateSelect
              ariaLabel="Destination state"
              value={lane.destState}
              onChange={(state) => setLane((prev) => ({ ...prev, destState: state }))}
              className="border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
              dark
            />
```

- [ ] **Step 5: Run the suite and confirm it still passes**

```bash
npx vitest run tests/pages/CarrierMapPage.test.jsx
```

Expected: all tests PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CarrierMapPage.jsx
git commit -m "feat: use StateSelect for the carrier map's lane search"
```

---

## Task 20: Swap `StateSelect` into `ExtraStopsEditor`

**Files:**
- Modify: `frontend/src/components/ExtraStopsEditor.jsx`

No test changes — `ExtraStopsEditor.test.jsx` never simulates typing into the state field (stops are passed in fully-formed as props), so this is a verify-then-swap like Task 19.

- [ ] **Step 1: Confirm the current suite passes**

```bash
cd frontend
npx vitest run tests/components/ExtraStopsEditor.test.jsx
```

Expected: all tests PASS (baseline).

- [ ] **Step 2: Add the import**

In `frontend/src/components/ExtraStopsEditor.jsx`, find:

```jsx
import DateTimePopover from './DateTimePopover';
```

Add right after it:

```jsx
import StateSelect from './StateSelect';
```

- [ ] **Step 3: Replace the state input**

Find:

```jsx
            <div className="w-16">
              <label className="mb-1 block text-[10px] text-text-muted" htmlFor={`extra-stop-state-${index}`}>
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
```

Replace with:

```jsx
            <div className="w-16">
              <label className="mb-1 block text-[10px] text-text-muted" htmlFor={`extra-stop-state-${index}`}>
                State
              </label>
              <StateSelect
                id={`extra-stop-state-${index}`}
                ariaLabel={`Stop ${index + 1} state`}
                value={stop.state}
                onChange={(state) => updateStop(index, 'state', state)}
                className="rounded-lg border border-border bg-surface-alt px-2 py-2 text-sm text-text"
              />
            </div>
```

- [ ] **Step 4: Run the suite and confirm it still passes**

```bash
npx vitest run tests/components/ExtraStopsEditor.test.jsx
```

Expected: all tests PASS, unchanged.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ExtraStopsEditor.jsx
git commit -m "feat: use StateSelect for extra-stop state fields"
```

---

## Task 21: `CarrierSheet` — city/state pickers, the F3 color fix, F4's load-number lookup, and the unsaved-changes guard

This is the largest task in the plan. Do it in the sub-steps below, in order, running the suite after each one.

**Files:**
- Modify: `frontend/src/components/CarrierSheet.jsx`
- Test: `frontend/tests/components/CarrierSheet.test.jsx`

- [ ] **Step 1: Baseline**

```bash
cd frontend
npx vitest run tests/components/CarrierSheet.test.jsx
```

Expected: all tests PASS (confirm this before touching anything).

### 21a — F3: fix the invisible lane text

- [ ] **Step 2: Write the failing test**

Add to `frontend/tests/components/CarrierSheet.test.jsx`:

```jsx
  test('a listed lane\'s text has an explicit color class (regression: it rendered invisible)', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([
      { id: 10, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: '1500.00' },
    ]);
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/Dallas, TX.*Chicago, IL/));
    expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toHaveClass('text-text');
  });
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run tests/components/CarrierSheet.test.jsx -t "invisible"
```

Expected: FAIL — the `<span>` has no `text-text` class.

- [ ] **Step 4: Fix it**

In `frontend/src/components/CarrierSheet.jsx`, find:

```jsx
                <li key={entry.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
                  <span>
                    {entry.origin_city}, {entry.origin_state} → {entry.dest_city}, {entry.dest_state}
                    {entry.rate ? ` — $${Number(entry.rate).toLocaleString()}` : ''}
                  </span>
```

Replace with:

```jsx
                <li key={entry.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm">
                  <span className="text-text">
                    {entry.origin_city}, {entry.origin_state} → {entry.dest_city}, {entry.dest_state}
                    {entry.rate ? ` — $${Number(entry.rate).toLocaleString()}` : ''}
                  </span>
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx vitest run tests/components/CarrierSheet.test.jsx -t "invisible"
```

Expected: PASS.

### 21b — Swap in `CityStateAutocomplete` and `StateSelect` for the lane draft

- [ ] **Step 6: Update imports**

Find:

```jsx
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';
import { US_STATES } from '../lib/usStates';
import BottomSheet from './BottomSheet';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
```

Replace with:

```jsx
import { EQUIPMENT_OPTIONS } from '../lib/equipmentOptions';
import { US_STATES } from '../lib/usStates';
import { useDirtyGuard } from '../lib/useDirtyGuard';
import { useCloseConfirmation } from '../lib/useCloseConfirmation';
import { lookupLoadByNumber } from '../api/loads';
import BottomSheet from './BottomSheet';
import CityStateAutocomplete from './CityStateAutocomplete';
import StateSelect from './StateSelect';
import UnsavedChangesBar from './UnsavedChangesBar';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
```

- [ ] **Step 7: Add `load_number`/`load_id` to the blank lane draft**

Find:

```jsx
function blankHistoryEntry() {
  return { origin_city: '', origin_state: '', dest_city: '', dest_state: '', rate: '', gp: '', driver_name: '', driver_phone: '', comment: '', ran_at: '' };
}
```

Replace with:

```jsx
function blankHistoryEntry() {
  return {
    load_number: '', load_id: null,
    origin_city: '', origin_state: '', dest_city: '', dest_state: '',
    rate: '', gp: '', driver_name: '', driver_phone: '', comment: '', ran_at: '',
  };
}
```

- [ ] **Step 8: Replace the city/state grid**

Find:

```jsx
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
```

Replace with:

```jsx
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <CityStateAutocomplete
                    id="lane-origin-city"
                    ariaLabel="Origin city"
                    placeholder="Origin city"
                    value={historyDraft.origin_city}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, origin_city: e.target.value }))}
                    onPlaceSelected={({ city, state }) => setHistoryDraft((prev) => ({ ...prev, origin_city: city, origin_state: state }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <StateSelect
                    id="lane-origin-state"
                    ariaLabel="Origin state"
                    value={historyDraft.origin_state}
                    onChange={(state) => setHistoryDraft((prev) => ({ ...prev, origin_state: state }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <CityStateAutocomplete
                    id="lane-dest-city"
                    ariaLabel="Destination city"
                    placeholder="Destination city"
                    value={historyDraft.dest_city}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, dest_city: e.target.value }))}
                    onPlaceSelected={({ city, state }) => setHistoryDraft((prev) => ({ ...prev, dest_city: city, dest_state: state }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  <StateSelect
                    id="lane-dest-state"
                    ariaLabel="Destination state"
                    value={historyDraft.dest_state}
                    onChange={(state) => setHistoryDraft((prev) => ({ ...prev, dest_state: state }))}
                    className="rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
```

- [ ] **Step 9: Run the suite**

```bash
npx vitest run tests/components/CarrierSheet.test.jsx
```

Expected: all tests PASS (the existing lane-add tests use exact 2-letter codes via `fireEvent.change`, which `StateSelect` commits immediately, and `CityStateAutocomplete` behaves the same as a plain input when Google Maps isn't configured in tests — it already falls back to a plain text field per its own design).

- [ ] **Step 10: Commit this sub-step**

```bash
git add frontend/src/components/CarrierSheet.jsx frontend/tests/components/CarrierSheet.test.jsx
git commit -m "fix: give CarrierSheet's lane text a visible color, and use city/state pickers for the lane draft"
```

### 21c — F4: load-number lookup autofills the lane draft

- [ ] **Step 11: Write the failing tests**

At the top of `frontend/tests/components/CarrierSheet.test.jsx`, find:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierSheet from '../../src/components/CarrierSheet';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carriers');
```

Replace it with:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierSheet from '../../src/components/CarrierSheet';
import * as carriersApi from '../../src/api/carriers';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/carriers');
vi.mock('../../src/api/loads');
```

Then add these tests:

```jsx
  test('edit mode: entering a load number that exists autofills the lane draft', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue({
      id: 99, load_number: 'L4521', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', target_pay: 1800, early_pu: '2026-08-10T08:00:00.000Z',
    });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'L4521' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));

    await waitFor(() => {
      expect(screen.getByText(/load found/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^origin city$/i)).toHaveValue('Dallas');
    expect(screen.getByLabelText(/^origin state$/i)).toHaveValue('TX');
    expect(screen.getByLabelText(/^destination city$/i)).toHaveValue('Chicago');
    expect(screen.getByLabelText(/^destination state$/i)).toHaveValue('IL');
    expect(screen.getByLabelText(/^rate$/i)).toHaveValue('1800');
  });

  test('edit mode: an unrecognized load number shows "new" instead of autofilling', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue(null);
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'NOPE' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));

    await waitFor(() => {
      expect(screen.getByText(/no load with that number/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^origin city$/i)).toHaveValue('');
  });

  test('edit mode: autofill never overwrites a field the user already typed', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue({
      id: 99, load_number: 'L4521', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', target_pay: 1800, early_pu: null,
    });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^rate$/i), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'L4521' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));

    await waitFor(() => screen.getByText(/load found/i));
    expect(screen.getByLabelText(/^rate$/i)).toHaveValue('2000');
  });

  test('edit mode: a found load\'s id is sent as load_id when the lane is saved', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    loadsApi.lookupLoadByNumber.mockResolvedValue({
      id: 99, load_number: 'L4521', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', target_pay: 1800, early_pu: null,
    });
    carriersApi.createCarrierHistory.mockResolvedValue({ id: 11, origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' });
    render(<CarrierSheet carrier={carrier} onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/load number/i), { target: { value: 'L4521' } });
    fireEvent.blur(screen.getByLabelText(/load number/i));
    await waitFor(() => screen.getByText(/load found/i));
    fireEvent.click(screen.getByRole('button', { name: /^add lane$/i }));

    await waitFor(() => {
      expect(carriersApi.createCarrierHistory).toHaveBeenCalledWith(5, expect.objectContaining({ load_id: 99 }));
    });
  });
```

- [ ] **Step 12: Run it and watch it fail**

```bash
npx vitest run tests/components/CarrierSheet.test.jsx -t "load number"
npx vitest run tests/components/CarrierSheet.test.jsx -t "load_id"
```

Expected: FAIL — there's no load-number field yet.

- [ ] **Step 13: Add the lookup state and handler**

Find (inside the `CarrierSheet` function, right after `const [historyBusy, setHistoryBusy] = useState(false);`):

```jsx
  const [historyBusy, setHistoryBusy] = useState(false);
  const isMountedRef = useRef(true);
```

Replace with:

```jsx
  const [historyBusy, setHistoryBusy] = useState(false);
  const [loadLookupStatus, setLoadLookupStatus] = useState('idle'); // 'idle' | 'checking' | 'found' | 'new'
  const isMountedRef = useRef(true);
```

Find `function handleAddHistory() {` and, right before it, add:

```jsx
  // Typing a load number and tabbing out looks it up against the loads
  // database: an existing load autofills the rest of the draft instead of
  // making the user retype it -- the same "don't fight what they typed"
  // rule BookingCarrierFields' MC lookup already follows, so only blank
  // fields are ever filled in.
  function handleLoadNumberBlur() {
    const loadNumber = historyDraft.load_number.trim();
    if (!loadNumber) {
      setLoadLookupStatus('idle');
      return;
    }
    setLoadLookupStatus('checking');
    lookupLoadByNumber(loadNumber)
      .then((load) => {
        if (!isMountedRef.current) return;
        if (load) {
          setHistoryDraft((prev) => ({
            ...prev,
            load_id: load.id,
            origin_city: prev.origin_city || load.origin_city || '',
            origin_state: prev.origin_state || load.origin_state || '',
            dest_city: prev.dest_city || load.dest_city || '',
            dest_state: prev.dest_state || load.dest_state || '',
            rate: prev.rate || (load.target_pay !== null && load.target_pay !== undefined ? String(load.target_pay) : ''),
            ran_at: prev.ran_at || (load.early_pu ? String(load.early_pu).slice(0, 10) : ''),
          }));
          setLoadLookupStatus('found');
        } else {
          setLoadLookupStatus('new');
        }
      })
      .catch(() => {
        if (isMountedRef.current) setLoadLookupStatus('idle');
      });
  }

```

- [ ] **Step 14: Add the field to the JSX**

Find the start of the `addingHistory` block's content:

```jsx
            {addingHistory && (
              <div className="mt-3 rounded-lg border border-border p-3">
                {historyError && (
                  <p role="alert" className="mb-2 text-xs text-error">
                    {historyError}
                  </p>
                )}
                <div className="mb-2 grid grid-cols-2 gap-2">
```

Replace with:

```jsx
            {addingHistory && (
              <div className="mt-3 rounded-lg border border-border p-3">
                {historyError && (
                  <p role="alert" className="mb-2 text-xs text-error">
                    {historyError}
                  </p>
                )}
                <div className="mb-2">
                  <label className="mb-1 block text-[10px] text-text-muted" htmlFor="lane-load-number">
                    Load # (optional — autofills the lane below)
                  </label>
                  <input
                    id="lane-load-number"
                    aria-label="Load number"
                    placeholder="Load #"
                    value={historyDraft.load_number}
                    onChange={(e) => {
                      setHistoryDraft((prev) => ({ ...prev, load_number: e.target.value, load_id: null }));
                      setLoadLookupStatus('idle');
                    }}
                    onBlur={handleLoadNumberBlur}
                    className="w-full rounded-lg border border-border bg-surface-alt px-2 py-1.5 text-sm text-text"
                  />
                  {loadLookupStatus === 'checking' && (
                    <p className="mt-1 text-xs text-text-muted">Checking load {historyDraft.load_number.trim()}...</p>
                  )}
                  {loadLookupStatus === 'found' && (
                    <p className="mt-1 text-xs font-medium text-success">Load found — lane details filled in below.</p>
                  )}
                  {loadLookupStatus === 'new' && (
                    <p className="mt-1 text-xs text-text-muted">No load with that number on file.</p>
                  )}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
```

- [ ] **Step 15: Include `load_id` when saving the lane**

Find:

```jsx
    createCarrierHistory(carrier.id, {
      origin_city: historyDraft.origin_city.trim(),
      origin_state: historyDraft.origin_state.trim(),
      dest_city: historyDraft.dest_city.trim(),
      dest_state: historyDraft.dest_state.trim(),
      rate: blankToNull(historyDraft.rate) === null ? null : Number(historyDraft.rate),
      gp: blankToNull(historyDraft.gp) === null ? null : Number(historyDraft.gp),
      driver_name: blankToNull(historyDraft.driver_name),
      driver_phone: blankToNull(historyDraft.driver_phone),
      comment: blankToNull(historyDraft.comment),
      ran_at: blankToNull(historyDraft.ran_at),
    })
```

Replace with:

```jsx
    createCarrierHistory(carrier.id, {
      load_id: historyDraft.load_id || null,
      origin_city: historyDraft.origin_city.trim(),
      origin_state: historyDraft.origin_state.trim(),
      dest_city: historyDraft.dest_city.trim(),
      dest_state: historyDraft.dest_state.trim(),
      rate: blankToNull(historyDraft.rate) === null ? null : Number(historyDraft.rate),
      gp: blankToNull(historyDraft.gp) === null ? null : Number(historyDraft.gp),
      driver_name: blankToNull(historyDraft.driver_name),
      driver_phone: blankToNull(historyDraft.driver_phone),
      comment: blankToNull(historyDraft.comment),
      ran_at: blankToNull(historyDraft.ran_at),
    })
```

- [ ] **Step 16: Reset lookup status when the lane draft is discarded or a lane is added**

Find `setHistoryDraft(blankHistoryEntry());` — it appears in two places (the lane's own Cancel handler, and after a successful add). After **each** occurrence, add a line resetting the lookup status. For example, the Cancel handler:

```jsx
                    onClick={() => {
                      setAddingHistory(false);
                      setHistoryDraft(blankHistoryEntry());
                      setHistoryError(null);
                    }}
```

becomes:

```jsx
                    onClick={() => {
                      setAddingHistory(false);
                      setHistoryDraft(blankHistoryEntry());
                      setHistoryError(null);
                      setLoadLookupStatus('idle');
                    }}
```

And in `handleAddHistory`'s success handler:

```jsx
      .then((created) => {
        if (isMountedRef.current) {
          setHistory((prev) => [created, ...prev]);
          setHistoryDraft(blankHistoryEntry());
          setAddingHistory(false);
        }
      })
```

becomes:

```jsx
      .then((created) => {
        if (isMountedRef.current) {
          setHistory((prev) => [created, ...prev]);
          setHistoryDraft(blankHistoryEntry());
          setAddingHistory(false);
          setLoadLookupStatus('idle');
        }
      })
```

- [ ] **Step 17: Run it and watch it pass**

```bash
npx vitest run tests/components/CarrierSheet.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 18: Commit this sub-step**

```bash
git add frontend/src/components/CarrierSheet.jsx frontend/tests/components/CarrierSheet.test.jsx
git commit -m "feat: F4 -- load-number lookup autofills a manually-added lane"
```

### 21d — Unsaved-changes guard across both dirty scopes

- [ ] **Step 19: Write the failing test**

Add:

```jsx
  test('editing a field then clicking Cancel asks to discard before closing', async () => {
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'New Carrier LLC' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('editing a field then clicking the backdrop asks to discard before closing', async () => {
    const onClose = vi.fn();
    render(<CarrierSheet carrier={null} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'New Carrier LLC' } });
    fireEvent.click(screen.getByRole('presentation'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });

  test('an in-progress, unsaved lane draft also triggers the discard prompt on Cancel', async () => {
    const carrier = { id: 5, company_name: 'ABC Trucking' };
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    const onClose = vi.fn();
    render(<CarrierSheet carrier={carrier} onClose={onClose} onSaved={vi.fn()} />);

    await waitFor(() => screen.getByText(/no lanes logged yet/i));
    fireEvent.click(screen.getByRole('button', { name: /\+ add a lane/i }));
    fireEvent.change(screen.getByLabelText(/^origin city$/i), { target: { value: 'Dallas' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
  });
```

- [ ] **Step 20: Run it and watch it fail**

```bash
npx vitest run tests/components/CarrierSheet.test.jsx -t "discard"
```

Expected: FAIL — `onClose` still fires immediately on all three.

- [ ] **Step 21: Wire in the two dirty scopes**

Find (right after all the `useState` declarations, before the first `useEffect`):

```jsx
  const isMountedRef = useRef(true);

  useEffect(() => {
```

Replace with:

```jsx
  const isMountedRef = useRef(true);

  const carrierDirty = useDirtyGuard({
    companyName, mcNumber, dispatcherName, dispatcherPhone, dispatcherEmail,
    equipmentTypes, equipmentNotes, operatingStatesText, operatingNotes, comment,
  });
  const laneDraftDirty = useDirtyGuard(historyDraft);
  const isDirty = carrierDirty || (addingHistory && laneDraftDirty);
  const closeConfirmation = useCloseConfirmation();

  function handleRequestClose() {
    closeConfirmation.requestClose(isDirty, onClose);
  }

  useEffect(() => {
```

Find the render's `BottomSheet` and footer:

```jsx
  return (
    <AnimatePresence>
      <BottomSheet onClose={onClose}>
```

Replace with:

```jsx
  return (
    <AnimatePresence>
      <BottomSheet onClose={handleRequestClose}>
```

Find:

```jsx
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </PrimaryButton>
        </div>
```

Replace with:

```jsx
        {closeConfirmation.confirming ? (
          <UnsavedChangesBar onDiscard={closeConfirmation.confirmDiscard} onKeepEditing={closeConfirmation.cancelDiscard} />
        ) : (
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={handleRequestClose}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </PrimaryButton>
          </div>
        )}
```

- [ ] **Step 22: Run it and watch it pass**

```bash
npx vitest run tests/components/CarrierSheet.test.jsx
```

Expected: all tests PASS, including the pre-existing "calls onClose when the backdrop is clicked" test (fresh `carrier={null}`, nothing edited, so `isDirty` is `false`).

- [ ] **Step 23: Run the full frontend suite**

```bash
npx vitest run
```

Expected: all tests PASS across the whole project — this is the last CarrierSheet change and a good checkpoint before moving to ReviewQueue.

- [ ] **Step 24: Commit**

```bash
git add frontend/src/components/CarrierSheet.jsx frontend/tests/components/CarrierSheet.test.jsx
git commit -m "feat: add an unsaved-changes guard covering both of CarrierSheet's dirty scopes"
```

---

## Task 22: `ReviewQueue` — show the message and load, allow re-assignment, add a live age indicator, sort oldest-first

**Files:**
- Modify: `frontend/src/components/ReviewQueue.jsx`
- Test: `frontend/tests/components/ReviewQueue.test.jsx`

### 22a — Fetch oldest-first, and append (not prepend) live-pushed inquiries

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/components/ReviewQueue.test.jsx`:

```jsx
  test('fetches the queue oldest-first', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

    expect(inquiriesApi.listInquiries).toHaveBeenCalledWith('pending_review', { order: 'oldest' });
  });

  test('a live-pushed new inquiry is appended to the end, not the front (it is the newest, and the queue is oldest-first)', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));
    await waitFor(() => expect(liveHandlers['inquiry:new']).toBeDefined());

    act(() => {
      liveHandlers['inquiry:new'](INQUIRY_2);
    });

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    const rows = screen.getAllByRole('listitem');
    const rowTexts = rows.map((row) => row.textContent);
    expect(rowTexts[0]).toContain('carrierA@example.com');
    expect(rowTexts[1]).toContain('carrierB@example.com');
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/components/ReviewQueue.test.jsx -t "oldest-first"
npx vitest run tests/components/ReviewQueue.test.jsx -t "appended to the end"
```

Expected: FAIL — `listInquiries` is called with just `'pending_review'` (no options), and the new inquiry is prepended.

- [ ] **Step 3: Update the fetch call and the `inquiry:new` handler**

In `frontend/src/components/ReviewQueue.jsx`, find:

```javascript
  function fetchQueue() {
    setStatus('loading');
    setError(null);
    listInquiries('pending_review')
```

Replace with:

```javascript
  function fetchQueue() {
    setStatus('loading');
    setError(null);
    listInquiries('pending_review', { order: 'oldest' })
```

Find:

```javascript
    const unsubscribeNew = subscribe('inquiry:new', (inquiry) => {
      if (inquiry.reply_status !== 'pending_review') return;
      setInquiries((prev) => [inquiry, ...prev]);
      setDrafts((prev) => ({ ...prev, [inquiry.id]: draftTextFor(inquiry) }));
    });
```

Replace with:

```javascript
    const unsubscribeNew = subscribe('inquiry:new', (inquiry) => {
      if (inquiry.reply_status !== 'pending_review') return;
      // Appended, not prepended -- a newly-arrived inquiry is by
      // definition the newest one, and this queue sorts oldest-first so
      // the most overdue inquiry stays at the top.
      setInquiries((prev) => [...prev, inquiry]);
      setDrafts((prev) => ({ ...prev, [inquiry.id]: draftTextFor(inquiry) }));
    });
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/components/ReviewQueue.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReviewQueue.jsx frontend/tests/components/ReviewQueue.test.jsx
git commit -m "feat: sort the review queue oldest-first"
```

### 22b — B23/B24: show the carrier's message and the matched load's header

- [ ] **Step 6: Write the failing tests**

Add to the same test file. First, extend the two inquiry fixtures near the top of the file — find:

```jsx
const INQUIRY_1 = {
  id: 1, from_address: 'carrierA@example.com', subject: 'Dallas load?',
  reply_status: 'pending_review', reply_body: null, live_reply_body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL',
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
};

const INQUIRY_2 = {
  id: 2, from_address: 'carrierB@example.com', subject: 'Chicago load?',
  reply_status: 'pending_review', reply_body: 'stale draft', live_reply_body: 'PU: CHICAGO, IL\nDEL: MIAMI, FL',
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
};
```

Replace with (adding the fields B24's header needs, plus a matched load id and tier, plus a body snippet for B23 — kept undefined on `INQUIRY_2` deliberately, to cover the no-load / no-snippet fallback paths):

```jsx
const INQUIRY_1 = {
  id: 1, from_address: 'carrierA@example.com', subject: 'Dallas load?',
  body_snippet: 'Hey, is the Dallas to Chicago van load still available?',
  reply_status: 'pending_review', reply_body: null, live_reply_body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL',
  matched_load_id: 5, match_tier: 'city_state',
  matched_load_load_number: 'L1001', matched_load_equipment: 'V',
  matched_load_origin_city: 'Dallas', matched_load_origin_state: 'TX',
  matched_load_dest_city: 'Chicago', matched_load_dest_state: 'IL',
  matched_load_early_pu: null, matched_load_late_pu: null,
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
};

const INQUIRY_2 = {
  id: 2, from_address: 'carrierB@example.com', subject: 'Chicago load?',
  body_snippet: null,
  reply_status: 'pending_review', reply_body: 'stale draft', live_reply_body: 'PU: CHICAGO, IL\nDEL: MIAMI, FL',
  matched_load_id: null, match_tier: 'none',
  matched_load_load_number: null, matched_load_equipment: null,
  matched_load_origin_city: null, matched_load_origin_state: null,
  matched_load_dest_city: null, matched_load_dest_state: null,
  matched_load_early_pu: null, matched_load_late_pu: null,
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
};
```

Now add the new tests:

```jsx
  test('shows the carrier\'s own message text on the card', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText(/is the dallas to chicago van load still available/i));
  });

  test('shows a fallback when there is no captured message text', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_2]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    expect(screen.getByText(/no message text captured/i)).toBeInTheDocument();
  });

  test('shows the matched load\'s number, lane, and equipment', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText(/L1001/));
    expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toBeInTheDocument();
    expect(screen.getByText('V')).toBeInTheDocument();
  });

  test('shows a "no load matched" message when nothing matched', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_2]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    expect(screen.getByText(/no load matched/i)).toBeInTheDocument();
  });
```

- [ ] **Step 7: Run it and watch it fail**

```bash
npx vitest run tests/components/ReviewQueue.test.jsx -t "message"
npx vitest run tests/components/ReviewQueue.test.jsx -t "matched load"
```

Expected: FAIL — none of this is rendered yet.

- [ ] **Step 8: Add the imports and the two header components**

In `frontend/src/components/ReviewQueue.jsx`, find:

```jsx
import { listInquiries, sendInquiryReply, rejectInquiry, bulkSendInquiries, bulkRejectInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { detectMultiStop, multiStopTagVariant } from '../lib/lookupMessage';
import { useMotionPreset } from '../lib/motionConfig';
import { useSelectionMode } from '../lib/useSelectionMode';
import Badge from './Badge';
import BottomActionBar from './BottomActionBar';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';
import SelectionCircle from './SelectionCircle';
```

Replace with:

```jsx
import { listInquiries, sendInquiryReply, rejectInquiry, reassignInquiry, bulkSendInquiries, bulkRejectInquiries } from '../api/inquiries';
import { subscribe } from '../lib/liveSocket';
import { detectMultiStop, multiStopTagVariant } from '../lib/lookupMessage';
import { buildPUSched } from '../lib/datExport';
import { useMotionPreset } from '../lib/motionConfig';
import { useSelectionMode } from '../lib/useSelectionMode';
import Badge from './Badge';
import BottomActionBar from './BottomActionBar';
import Card from './Card';
import LoadPicker from './LoadPicker';
import RelativeTime from './RelativeTime';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import Skeleton from './Skeleton';
import SelectionCircle from './SelectionCircle';
```

Find `function draftTextFor(inquiry) {` and its closing brace:

```javascript
function draftTextFor(inquiry) {
  return inquiry.live_reply_body ?? inquiry.reply_body ?? '';
}
```

Add two new helper components and a label map right after it (leave the existing `draftTextFor` function itself untouched):

```javascript
const MATCH_TIER_LABELS = {
  load_number: 'Load #', city_state: 'City + state', city: 'City', state: 'State', manual: 'Manually matched', none: 'No match',
};

// The matched load's number, lane, PU window, equipment, and target pay
// -- shown on every card so a match can be verified at a glance instead
// of being trusted blind or looked up in another tab.
function MatchedLoadHeader({ inquiry }) {
  if (!inquiry.matched_load_id) {
    return (
      <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-text-muted">
        No load matched — pick one below if you can tell which load this is about.
      </p>
    );
  }
  const lane = inquiry.matched_load_origin_city && inquiry.matched_load_dest_city
    ? `${inquiry.matched_load_origin_city}, ${inquiry.matched_load_origin_state} → ${inquiry.matched_load_dest_city}, ${inquiry.matched_load_dest_state}`
    : 'No lane on file';
  const puWindow = buildPUSched(inquiry.matched_load_early_pu, inquiry.matched_load_late_pu);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2 text-xs text-text-muted">
      <span className="font-semibold text-text">Load {inquiry.matched_load_load_number}</span>
      <span>{lane}</span>
      {puWindow && <span>PU {puWindow}</span>}
      {inquiry.matched_load_equipment && <span>{inquiry.matched_load_equipment}</span>}
      {inquiry.matched_load_target_pay !== null && inquiry.matched_load_target_pay !== undefined && (
        <span>${Number(inquiry.matched_load_target_pay).toLocaleString()}</span>
      )}
      <Badge variant="default">{MATCH_TIER_LABELS[inquiry.match_tier] || inquiry.match_tier}</Badge>
    </div>
  );
}

// The carrier's own message, shown above the reply draft -- previously
// stored (body_snippet) and never displayed anywhere, so every reply was
// approved having seen a sender address and a subject line but never the
// actual question being answered.
function InquiryMessage({ bodySnippet }) {
  return (
    <div className="mb-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Their message</p>
      <p className="whitespace-pre-wrap">{bodySnippet || 'No message text captured for this inquiry.'}</p>
      {bodySnippet && bodySnippet.length >= 500 && (
        <p className="mt-1 text-[10px] text-text-muted">May be truncated at 500 characters, and can include quoted reply text.</p>
      )}
    </div>
  );
}
```

Now find where the card renders its top line, so the two new components render right above the reply textarea. Find:

```jsx
                  <span className="font-medium text-text">{inquiry.from_address}</span> — {inquiry.subject}
                  {Boolean(inquiry.ref_mismatch) && (
                    <Badge variant="warning">Different load? — reference # didn't match, verify</Badge>
                  )}
                  {multiStopVariant === 'error' && (
                    <Badge variant="error">{multiStopFlag} — add extra stops manually</Badge>
                  )}
                  {multiStopVariant === 'info' && <Badge variant="info">Extra stops already added</Badge>}
                </div>
```

Replace with (adding `RelativeTime` next to the sender/subject line — this is F5's age indicator):

```jsx
                  <span className="font-medium text-text">{inquiry.from_address}</span> — {inquiry.subject}
                  <RelativeTime value={inquiry.received_at} className="text-xs" />
                  {Boolean(inquiry.ref_mismatch) && (
                    <Badge variant="warning">Different load? — reference # didn't match, verify</Badge>
                  )}
                  {multiStopVariant === 'error' && (
                    <Badge variant="error">{multiStopFlag} — add extra stops manually</Badge>
                  )}
                  {multiStopVariant === 'info' && <Badge variant="info">Extra stops already added</Badge>}
                </div>
                <MatchedLoadHeader inquiry={inquiry} />
                <InquiryMessage bodySnippet={inquiry.body_snippet} />
```

- [ ] **Step 9: Run it and watch it pass**

```bash
npx vitest run tests/components/ReviewQueue.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ReviewQueue.jsx frontend/tests/components/ReviewQueue.test.jsx
git commit -m "feat: show the carrier's message, the matched load, and its age on every review queue card"
```

### 22c — B25: re-assign a wrong match

- [ ] **Step 11: Write the failing tests**

Add to the test file:

```jsx
  test('"Change match" opens a load picker; selecting a load re-assigns the inquiry', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    loadsApi.listLoads.mockResolvedValue([
      { id: 5, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' },
      { id: 7, load_number: 'L2002', origin_city: 'Miami', origin_state: 'FL', dest_city: 'Atlanta', dest_state: 'GA' },
    ]);
    inquiriesApi.reassignInquiry.mockResolvedValue({
      ...INQUIRY_1, matched_load_id: 7, match_tier: 'manual',
      matched_load_load_number: 'L2002', matched_load_origin_city: 'Miami', matched_load_origin_state: 'FL',
      matched_load_dest_city: 'Atlanta', matched_load_dest_state: 'GA',
      live_reply_body: 'PU: MIAMI, FL\nDEL: ATLANTA, GA',
    });
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText(/L1001/));

    fireEvent.click(screen.getByRole('button', { name: /change match/i }));
    await waitFor(() => screen.getByText(/L2002/, { selector: 'button *, button' }));
    fireEvent.click(screen.getByRole('button', { name: /L2002/ }));

    await waitFor(() => {
      expect(inquiriesApi.reassignInquiry).toHaveBeenCalledWith(1, 7);
    });
    await waitFor(() => screen.getByText(/Miami, FL.*Atlanta, GA/));
    expect(screen.getByLabelText('Reply').value).toBe('PU: MIAMI, FL\nDEL: ATLANTA, GA');
  });

  test('clicking "Change match" or interacting with the picker does not toggle row selection', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    loadsApi.listLoads.mockResolvedValue([]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText(/L1001/));

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: /change match/i }));

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
```

At the top of the test file, add the loads API mock alongside the existing ones:

```jsx
import * as loadsApi from '../../src/api/loads';
```

and `vi.mock('../../src/api/loads');` next to the other `vi.mock(...)` calls, and `loadsApi.listLoads` reset via the existing `vi.resetAllMocks()` in `beforeEach` (already covers it — no change needed there).

- [ ] **Step 12: Run it and watch it fail**

```bash
cd frontend
npx vitest run tests/components/ReviewQueue.test.jsx -t "Change match"
```

Expected: FAIL — there's no "Change match" control yet.

- [ ] **Step 13: Add the re-assign state and handler**

Find (near the top of the `ReviewQueue` function, after `const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);`):

```javascript
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);
  const isMountedRef = useRef(true);
```

Replace with:

```javascript
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);
  const [reassigningId, setReassigningId] = useState(null);
  const isMountedRef = useRef(true);
```

Find `function handleReject(id) {` and, right before it, add:

```javascript
  function handleReassign(inquiryId, loadId) {
    setError(null);
    reassignInquiry(inquiryId, loadId)
      .then((updated) => {
        if (!isMountedRef.current) return;
        setInquiries((prev) => prev.map((inquiry) => (inquiry.id === inquiryId ? updated : inquiry)));
        setDrafts((prev) => ({ ...prev, [inquiryId]: draftTextFor(updated) }));
        setReassigningId(null);
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to change the matched load.');
        }
      });
  }

```

- [ ] **Step 14: Add the control to the card**

Find the spot right after `<InquiryMessage bodySnippet={inquiry.body_snippet} />` (added in the previous sub-task) and add, immediately after it:

```jsx
                <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                  {reassigningId === inquiry.id ? (
                    <div className="rounded-lg border border-border p-2">
                      <LoadPicker
                        ariaLabel={`Search loads to re-assign the inquiry from ${inquiry.from_address}`}
                        autoFocus
                        onSelect={(load) => handleReassign(inquiry.id, load.id)}
                      />
                      <button
                        type="button"
                        onClick={() => setReassigningId(null)}
                        className="mt-2 text-xs text-text-muted hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReassigningId(inquiry.id)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Wrong load? Change match
                    </button>
                  )}
                </div>
```

- [ ] **Step 15: Run it and watch it pass**

```bash
npx vitest run tests/components/ReviewQueue.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 16: Run the full frontend suite**

```bash
npx vitest run
```

Expected: all tests PASS across the whole project.

- [ ] **Step 17: Commit**

```bash
git add frontend/src/components/ReviewQueue.jsx frontend/tests/components/ReviewQueue.test.jsx
git commit -m "feat: B25 -- let a wrong match be re-assigned from the review queue"
```

---

## Final verification

- [ ] **Run the full backend suite**

```bash
cd backend
npx jest
```

Expected: all tests PASS.

- [ ] **Run the full frontend suite**

```bash
cd frontend
npx vitest run
```

Expected: all tests PASS.

- [ ] **Manual smoke test**

Start both dev servers (`npm run dev` in `frontend/`, `npm start` in `backend/`) and walk through:

1. Open a load's "Edit" modal, change a field, click Cancel — confirm the discard prompt appears, "Keep editing" returns you to your edit, "Discard" closes without saving.
2. Open Carriers → Edit a carrier → "+ Add a lane". Type a real load number from your test data into the new "Load #" field and tab out — confirm origin/destination/rate autofill. Type an origin/destination state as lowercase (`tx`) and confirm it uppercases; type `zz` and blur — confirm the red error state.
3. In the Inquiries tab, open the review queue with at least one pending inquiry. Confirm you can see the carrier's actual message text and the matched load's number/lane/equipment. Click "Wrong load? Change match", search, and pick a different load — confirm the draft reply updates to match the new load.
4. Confirm each inquiry card shows a relative age ("Xm ago") that visibly changes color as time passes (or fake a longer wait by checking a card for an inquiry received over an hour ago, if your test data has one — it should render red).

---

## Self-review notes

Checked against the design spec section by section:

- **F1–F5**: F1 (city dropdown) and the state-validation half of the design → Tasks 7, 19–21. F2 (dirty guard) → Tasks 8, 9, 10, 16–18, 21d. F3 (invisible lane text) → Task 21a. F4 (load-number lookup) → Task 21c. F5 (relative time) → Task 22b.
- **B20, B21, B23, B24, B25**: B20 → Task 15 (and BlastModal's missing-lane guard, Task 18). B21 → Tasks 7, 16, 17, 19–21 (every state field in scope). B23 → Task 22b. B24 → Task 22b. B25 → Task 22c.
- **Data model**: the `match_tier` ENUM widening → Task 1.
- **API surface**: `GET /api/loads/lookup` → Task 5. `PATCH /api/inquiries/:id/match` → Task 4. `INQUIRY_JOIN_FIELDS` additions → Task 2.
- **Out of scope items** (quoted-text stripping, HTML body extraction, `body_snippet` widening, carrier `operating_states` validation): none touched by this plan, as specified.

One deviation from a literal reading of the design spec is called out at the top of this plan (the "Before you start" section): `LoadPicker` is used only by B25, not by F4, since the spec's own UI section describes F4 as a typed-field-plus-blur lookup rather than a browsing dropdown.

No placeholders, no "TODO"s, no unshown code in any step above — every step either shows the exact diff or the exact command and its expected output.
