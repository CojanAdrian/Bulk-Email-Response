# Backend Multi-User Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-seeded-admin, shared-loads model with self-service registration and per-user private loads: anyone can create their own account, each user only sees the loads they've uploaded, and a separate `admin` role can see and manage everyone's loads.

**Architecture:** Add a `role` column to `users` (`admin`/`user`, default `user`) and a `user_id` column to `loads`, with the load-number uniqueness constraint changed from global (`load_number` alone) to per-user (`user_id` + `load_number` composite), so two different users can each have a load numbered e.g. `0078033` without colliding. Session now carries `role` alongside `userId`/`username`, set at login/registration. Every loads route filters by `req.session.userId` unless `req.session.role === 'admin'`, in which case it sees/edits everything. A new open `POST /api/auth/register` endpoint creates `role: 'user'` accounts and auto-logs-in on success (matching the login response shape).

**Tech Stack:** Same as the existing backend (Express, mysql2, bcrypt, express-session, Jest + Supertest).

**Relationship to other plans:** Builds on `docs/superpowers/plans/2026-08-04-backend-foundation-api.md` (already merged). A follow-up frontend plan (registration page, role-aware UI) depends on this one and will be written after this is verified working.

**Prerequisite:** MySQL running locally (the `bulkposting-mysql` Docker container, or your own MySQL 8.0.29+ — the migration in Task 1 uses `information_schema` introspection rather than `ADD COLUMN IF NOT EXISTS` syntax specifically so it works on any 8.0.x version, not just 8.0.29+).

---

## Task 1: Schema migration — roles and per-user load ownership

**Files:**
- Modify: `backend/scripts/setup-db.js`
- Test: manual verification against the real database (schema migrations aren't unit-testable in isolation the way route logic is — this task's "test" is running the script twice against real data and inspecting the result)

- [ ] **Step 1: Add the migration function**

In `backend/scripts/setup-db.js`, add this function (place it after `ensureAdminUser` and before `main`):

```js
async function migrateSchema(databaseName) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
  });

  const [roleCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
    [databaseName]
  );
  if (roleCol[0].count === 0) {
    await conn.query(`ALTER TABLE users ADD COLUMN role ENUM('admin','user') NOT NULL DEFAULT 'user'`);
  }

  const [userIdCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'user_id'`,
    [databaseName]
  );
  if (userIdCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN user_id INT NULL`);
  }

  const [indexRows] = await conn.query(`SHOW INDEX FROM loads WHERE Key_name != 'PRIMARY'`);
  const indexMap = {};
  indexRows.forEach((row) => {
    if (!indexMap[row.Key_name]) indexMap[row.Key_name] = { unique: row.Non_unique === 0, columns: [] };
    indexMap[row.Key_name].columns[row.Seq_in_index - 1] = row.Column_name;
  });

  for (const [name, info] of Object.entries(indexMap)) {
    if (info.unique && info.columns.length === 1 && info.columns[0] === 'load_number') {
      await conn.query(`ALTER TABLE loads DROP INDEX \`${name}\``);
      delete indexMap[name];
    }
  }

  const hasComposite = Object.values(indexMap).some(
    (info) => info.unique && info.columns.join(',') === 'user_id,load_number'
  );
  if (!hasComposite) {
    await conn.query(`ALTER TABLE loads ADD UNIQUE KEY uniq_user_load_number (user_id, load_number)`);
  }

  await conn.query(
    `UPDATE loads l JOIN users u ON u.username = ? SET l.user_id = u.id WHERE l.user_id IS NULL`,
    [process.env.ADMIN_USERNAME]
  );
  await conn.query(`UPDATE users SET role = 'admin' WHERE username = ?`, [process.env.ADMIN_USERNAME]);

  await conn.end();
}
```

- [ ] **Step 2: Call it from `main()`**

In `backend/scripts/setup-db.js`, change `main()` from:
```js
async function main() {
  assertRequiredEnvVars();
  await setupDatabase(process.env.DB_NAME);
  await setupDatabase(process.env.DB_NAME_TEST);
  await ensureAdminUser();
  console.log('Database setup complete.');
}
```
to:
```js
async function main() {
  assertRequiredEnvVars();
  await setupDatabase(process.env.DB_NAME);
  await setupDatabase(process.env.DB_NAME_TEST);
  await ensureAdminUser();
  await migrateSchema(process.env.DB_NAME);
  await migrateSchema(process.env.DB_NAME_TEST);
  console.log('Database setup complete.');
}
```
(`migrateSchema` runs AFTER `ensureAdminUser` so the admin-promotion/backfill queries have a real admin row to target in `DB_NAME`. For `DB_NAME_TEST`, which has no seeded admin, those two queries simply affect 0 rows — harmless.)

- [ ] **Step 3: Run it and verify against the real database**

Run (from `backend/`):
```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm run setup-db
```
Expected: no errors, ends with "Database setup complete."

Then verify directly:
```bash
docker exec bulkposting-mysql mysql -uroot -pbulkposting_root_pw -e "
  DESCRIBE bulkposting_dev.users;
  DESCRIBE bulkposting_dev.loads;
  SHOW INDEX FROM bulkposting_dev.loads WHERE Key_name != 'PRIMARY';
  SELECT username, role FROM bulkposting_dev.users;
  SELECT COUNT(*) AS total, COUNT(user_id) AS with_owner FROM bulkposting_dev.loads;
"
```
Expected: `users` has a `role` column (`admin`/`user`, default `user`); `loads` has a `user_id` column; the index list shows `uniq_user_load_number` covering `user_id, load_number` and NO remaining single-column unique index on `load_number` alone; the admin user's `role` is `admin`; every existing load row has a non-null `user_id` (backfilled to the admin).

- [ ] **Step 4: Run it a SECOND time to confirm idempotency**

Run `npm run setup-db` again. Expected: still no errors — every `ALTER TABLE`/index change is guarded by an existence check, so re-running is a no-op past the first time. This is the actual "test" for a migration script: it must be safe to re-run, since `npm run setup-db` is documented as safe-to-re-run and every future `docker` restart or fresh clone will call it.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/setup-db.js
git commit -m "feat: add schema migration for user roles and per-user load ownership"
```

---

## Task 2: Registration endpoint, and role carried through login/session

**Files:**
- Modify: `backend/src/routes/auth.js`
- Modify: `backend/tests/auth.test.js`

- [ ] **Step 1: Add the failing tests**

Append to the `describe('auth routes', ...)` block in `backend/tests/auth.test.js` (this file already has `pool`/`resetTables` set up from earlier tasks — no new imports needed):

```js
  test('POST /api/auth/register creates a new user with role "user" and logs them in', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'newuser', password: 'longenough' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'newuser', role: 'user' });
    expect(res.headers['set-cookie']).toBeDefined();

    const [rows] = await pool.query('SELECT username, role FROM users WHERE username = ?', ['newuser']);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('user');
  });

  test('register rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'shortpw', password: 'abc123' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Password must be at least 8 characters' });

    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', ['shortpw']);
    expect(rows).toHaveLength(0);
  });

  test('register rejects a username that is already taken', async () => {
    await request(app).post('/api/auth/register').send({ username: 'taken', password: 'longenough' });
    const res = await request(app).post('/api/auth/register').send({ username: 'taken', password: 'differentpw' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Username already taken' });
  });

  test('login response and session include the user role', async () => {
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['adminlike', passwordHash, 'admin']);

    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username: 'adminlike', password: 'correcthorse' });
    expect(res.body).toEqual({ username: 'adminlike', role: 'admin' });

    const meRes = await agent.get('/api/auth/me');
    expect(meRes.body).toEqual({ username: 'adminlike', role: 'admin' });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/auth.test.js`
Expected: FAIL — `/api/auth/register` returns 404 (route doesn't exist), and the login/me tests fail because `role` isn't in the response yet.

- [ ] **Step 3: Rewrite `backend/src/routes/auth.js`**

```js
const express = require('express');
const bcrypt = require('bcrypt');
const asyncHandler = require('../lib/asyncHandler');
const requireAuth = require('../middleware/requireAuth');

const MIN_PASSWORD_LENGTH = 8;

function createAuthRouter(pool) {
  const router = express.Router();

  router.post('/register', asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const [existingRows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, passwordHash, 'user']
    );

    req.session.userId = result.insertId;
    req.session.username = username;
    req.session.role = 'user';
    res.json({ username, role: 'user' });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ username: user.username, role: user.role });
  }));

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ ok: true });
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ username: req.session.username, role: req.session.role });
  });

  return router;
}

module.exports = createAuthRouter;
```

Note: `username` is not validated for emptiness/format here beyond the DB's `NOT NULL` constraint — an empty-string username would hit `INSERT` and fail at the DB level (500) rather than a friendly 400. This is a known, acceptable gap for this task (matches the existing project's pattern of not over-building validation beyond what's asked); revisit only if it becomes a real problem.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/auth.test.js`
Expected: PASS (10 passed — 6 original + 4 new)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all suites pass (health, auth, loads — loads.test.js is untouched by this task, still passing as before)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/auth.js backend/tests/auth.test.js
git commit -m "feat: add self-service registration, carry role through session"
```

---

## Task 3: Scope all loads routes by ownership

**Files:**
- Modify: `backend/src/routes/loads.js`
- Modify: `backend/tests/loads.test.js`

This is the task with the most ripple effect: every existing test in `loads.test.js` inserted loads directly via SQL without a `user_id`, and asserted they were visible to "the" logged-in user — that assumption no longer holds once loads are owned. This task rewrites the whole file rather than patching individual tests, since the fixture setup itself needs to change (every direct `INSERT INTO loads` needs a real `user_id` now).

- [ ] **Step 1: Replace `backend/tests/loads.test.js` in full**

```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('loads routes', () => {
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
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')",
      ['testuser', passwordHash]
    );
    userId = result.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/loads');
    expect(res.status).toBe(401);
  });

  test('lists only the current user\'s own loads', async () => {
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['L1001', 'Dallas', 'TX', 'Chicago', 'IL', userId]
    );
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)',
      ['L9999', 'Someone Elses', otherUser.insertId]
    );

    const res = await agent.get('/api/loads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].load_number).toBe('L1001');
  });

  test('filters loads by status within the user\'s own loads', async () => {
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, status, user_id) VALUES (?, ?, ?, ?)',
      ['L1001', 'Dallas', 'active', userId]
    );
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, status, user_id) VALUES (?, ?, ?, ?)',
      ['L1002', 'Atlanta', 'booked', userId]
    );
    const res = await agent.get('/api/loads?status=active');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].load_number).toBe('L1001');
  });

  test('an admin sees loads from every user', async () => {
    const passwordHash = await bcrypt.hash('adminpw', 10);
    const [adminUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });

    await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L2002', 'Atlanta', adminUser.insertId]);

    const res = await adminAgent.get('/api/loads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('gets a single load owned by the current user', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.get(`/api/loads/${result.insertId}`);
    expect(res.status).toBe(200);
    expect(res.body.load_number).toBe('L1001');
  });

  test('returns 404 for a load owned by a different user', async () => {
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

    const res = await agent.get(`/api/loads/${result.insertId}`);
    expect(res.status).toBe(404);
  });

  test('an admin can get any user\'s load by id', async () => {
    const passwordHash = await bcrypt.hash('adminpw', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });

    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await adminAgent.get(`/api/loads/${result.insertId}`);
    expect(res.status).toBe(200);
    expect(res.body.load_number).toBe('L1001');
  });

  test('returns 404 for an unknown load id', async () => {
    const res = await agent.get('/api/loads/99999');
    expect(res.status).toBe(404);
  });

  test('PATCH updates target_pay and status on an owned load', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay, user_id) VALUES (?, ?, ?, ?)', ['L1001', 'Dallas', 1500, userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ target_pay: 1700, status: 'booked' });
    expect(res.status).toBe(200);
    expect(Number(res.body.target_pay)).toBe(1700);
    expect(res.body.status).toBe('booked');
  });

  test('PATCH returns 404 for a load owned by a different user', async () => {
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ target_pay: 1700 });
    expect(res.status).toBe(404);
  });

  test('PATCH with no valid fields returns 400', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ origin_city: 'Houston' });
    expect(res.status).toBe(400);
  });

  test('PATCH ignores disallowed fields but still applies allowed ones', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay, user_id) VALUES (?, ?, ?, ?)', ['L1001', 'Dallas', 1500, userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ origin_city: 'Houston', target_pay: 2000 });
    expect(res.status).toBe(200);
    expect(Number(res.body.target_pay)).toBe(2000);
    expect(res.body.origin_city).toBe('Dallas');
  });

  test('uploads a batch of loads, inserting new ones owned by the uploader', async () => {
    const res = await agent.post('/api/loads/upload').send({
      loads: [
        { load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', equipment: 'Reefer', target_pay: 1500 },
        { load_number: 'L1002', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Miami', dest_state: 'FL', equipment: 'Dry Van', target_pay: 900 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(2);

    const list = await agent.get('/api/loads');
    expect(list.body).toHaveLength(2);
  });

  test('two different users can each upload a load with the same load_number', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'SHARED1', origin_city: 'Dallas', target_pay: 1500 }],
    });

    const passwordHash = await bcrypt.hash('otherpw', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/login').send({ username: 'otheruser', password: 'otherpw' });
    const res = await otherAgent.post('/api/loads/upload').send({
      loads: [{ load_number: 'SHARED1', origin_city: 'Houston', target_pay: 2000 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);

    const mine = await agent.get('/api/loads');
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].origin_city).toBe('Dallas');

    const theirs = await otherAgent.get('/api/loads');
    expect(theirs.body).toHaveLength(1);
    expect(theirs.body[0].origin_city).toBe('Houston');
  });

  test('re-uploading an existing load_number for the same user updates it instead of duplicating', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1500 }],
    });
    const res = await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1800 }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 0, updated: 1 });

    const list = await agent.get('/api/loads');
    expect(list.body).toHaveLength(1);
    expect(Number(list.body[0].target_pay)).toBe(1800);
  });

  test('re-uploading a load does not change its status', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1500 }],
    });
    const list1 = await agent.get('/api/loads');
    await agent.patch(`/api/loads/${list1.body[0].id}`).send({ status: 'booked' });

    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1800 }],
    });
    const list2 = await agent.get('/api/loads');
    expect(list2.body[0].status).toBe('booked');
  });

  test('upload with a non-array loads field returns 400', async () => {
    const res = await agent.post('/api/loads/upload').send({ loads: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'loads must be an array' });
  });

  test('LOAD_COLUMNS never includes status or user_id, so uploads can never set them directly', () => {
    const { LOAD_COLUMNS } = require('../src/routes/loads');
    expect(LOAD_COLUMNS).not.toContain('status');
    expect(LOAD_COLUMNS).not.toContain('user_id');
  });

  test('GET /api/loads returns 500 instead of crashing when the database is unavailable', async () => {
    const express = require('express');
    const { createLoadsRouter } = require('../src/routes/loads');
    const brokenPool = { query: () => Promise.reject(new Error('connection lost')) };
    const bareApp = express();
    bareApp.use((req, res, next) => {
      req.session = { userId: 1, role: 'user' };
      next();
    });
    bareApp.use('/api/loads', createLoadsRouter(brokenPool));
    bareApp.use((err, req, res, next) => {
      res.status(500).json({ error: 'Internal server error' });
    });
    const res = await request(bareApp).get('/api/loads');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  test('POST /api/loads/upload returns 500 instead of crashing when the database is unavailable', async () => {
    const express = require('express');
    const { createLoadsRouter } = require('../src/routes/loads');
    const brokenPool = { getConnection: () => Promise.reject(new Error('connection lost')) };
    const bareApp = express();
    bareApp.use(express.json());
    bareApp.use((req, res, next) => {
      req.session = { userId: 1, role: 'user' };
      next();
    });
    bareApp.use('/api/loads', createLoadsRouter(brokenPool));
    bareApp.use((err, req, res, next) => {
      res.status(500).json({ error: 'Internal server error' });
    });
    const res = await request(bareApp).post('/api/loads/upload').send({ loads: [{ load_number: 'L1' }] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/loads.test.js`
Expected: FAIL — many tests fail because `loads.js` doesn't yet know about `user_id`/`role` (e.g. the "lists only the current user's own loads" test will see 2 loads instead of 1, since the current code has no ownership filter).

- [ ] **Step 3: Rewrite `backend/src/routes/loads.js`**

```js
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');

const LOAD_COLUMNS = [
  'load_number', 'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip', 'equipment', 'weight',
  'target_pay', 'early_pu', 'late_pu', 'late_del', 'stops',
  'commodity', 'temperature', 'comment',
];

function createLoadsRouter(pool) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const isAdmin = req.session.role === 'admin';
    const conditions = [];
    const params = [];
    if (!isAdmin) {
      conditions.push('user_id = ?');
      params.push(req.session.userId);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`SELECT * FROM loads ${whereClause} ORDER BY created_at DESC`, params);
    res.json(rows);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    const load = rows[0];
    const isAdmin = req.session.role === 'admin';
    if (!load || (!isAdmin && load.user_id !== req.session.userId)) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(load);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const [existingRows] = await pool.query('SELECT id, user_id FROM loads WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    const isAdmin = req.session.role === 'admin';
    if (!existing || (!isAdmin && existing.user_id !== req.session.userId)) {
      return res.status(404).json({ error: 'Load not found' });
    }

    const allowedFields = ['target_pay', 'status'];
    const updates = [];
    const values = [];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    values.push(req.params.id);
    await pool.query(`UPDATE loads SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  }));

  router.post('/upload', asyncHandler(async (req, res) => {
    const { loads } = req.body;
    if (!Array.isArray(loads)) {
      return res.status(400).json({ error: 'loads must be an array' });
    }

    const userId = req.session.userId;
    let inserted = 0;
    let updated = 0;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const loadNumbers = loads.map((load) => load.load_number).filter((n) => n !== undefined && n !== null);
      const existing = new Set();
      if (loadNumbers.length) {
        const placeholders = loadNumbers.map(() => '?').join(', ');
        const [existingRows] = await connection.query(
          `SELECT load_number FROM loads WHERE user_id = ? AND load_number IN (${placeholders})`,
          [userId, ...loadNumbers]
        );
        existingRows.forEach((row) => existing.add(row.load_number));
      }

      for (const load of loads) {
        const columns = [...LOAD_COLUMNS.filter((col) => load[col] !== undefined), 'user_id'];
        const placeholders = columns.map(() => '?').join(', ');
        const values = [...LOAD_COLUMNS.filter((col) => load[col] !== undefined).map((col) => load[col]), userId];
        const updateClause = columns
          .filter((col) => col !== 'load_number' && col !== 'user_id')
          .map((col) => `${col} = VALUES(${col})`)
          .join(', ');

        await connection.query(
          `INSERT INTO loads (${columns.join(', ')}) VALUES (${placeholders})
           ON DUPLICATE KEY UPDATE ${updateClause}`,
          values
        );
        if (existing.has(load.load_number)) {
          updated += 1;
        } else {
          inserted += 1;
          existing.add(load.load_number);
        }
      }

      await connection.commit();
      res.json({ inserted, updated });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }));

  return router;
}

module.exports = { createLoadsRouter, LOAD_COLUMNS };
```

Note the upload query construction: `columns` includes `user_id` (for the `INSERT` column list), but the `ON DUPLICATE KEY UPDATE` clause deliberately excludes both `load_number` AND `user_id` — `load_number` because it's part of what identifies the row, `user_id` because it must never change on an update (a re-upload should never transfer ownership).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/loads.test.js`
Expected: PASS (all tests green)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all suites pass (health, auth, loads)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js
git commit -m "feat: scope all loads routes by ownership, admins see everything"
```

---

## Task 4: README update and manual verification

**Files:**
- Modify: `backend/README.md`

- [ ] **Step 1: Update the README**

Read the current `backend/README.md` first. Update:
- The API reference table: add `POST /api/auth/register` (no auth required, `{username, password}` → `200 {username, role}` or `400` for a short password / taken username), and note that `login`/`me` responses now include `role`.
- The "Loads" section: note that `GET`/`GET :id`/`PATCH`/`POST /upload` are now scoped to the authenticated user's own loads, except for users with `role: 'admin'`, who see and can edit every user's loads. Note that `load_number` uniqueness is now per-user, not global — two different users can each have a load numbered the same thing.
- Add a short "Accounts and roles" section explaining: anyone can self-register via `/api/auth/register` and gets `role: 'user'`; the seeded account from `ADMIN_USERNAME`/`ADMIN_PASSWORD` is the only `role: 'admin'` account; there is currently no way to promote a user to admin except direct database access (`UPDATE users SET role = 'admin' WHERE username = '...'`) — this is a known, deliberate limitation for now (no admin-management UI yet).

- [ ] **Step 2: Manual verification against the real database**

With the backend running (`npm start`) and MySQL up:
```bash
# Register two different users
curl -c cookies_a.txt -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{"username":"alice","password":"alicepassword"}'
curl -c cookies_b.txt -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{"username":"bob","password":"bobpassword123"}'

# Each uploads a load with the SAME load_number
curl -b cookies_a.txt -X POST http://localhost:4000/api/loads/upload -H "Content-Type: application/json" -d '{"loads":[{"load_number":"SAME1","origin_city":"Dallas"}]}'
curl -b cookies_b.txt -X POST http://localhost:4000/api/loads/upload -H "Content-Type: application/json" -d '{"loads":[{"load_number":"SAME1","origin_city":"Houston"}]}'

# Each should see only their own
curl -b cookies_a.txt http://localhost:4000/api/loads
curl -b cookies_b.txt http://localhost:4000/api/loads

# Admin should see both
curl -c cookies_admin.txt -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"changeme123"}'
curl -b cookies_admin.txt http://localhost:4000/api/loads
```
Confirm: Alice's list shows exactly one load (`origin_city: "Dallas"`); Bob's shows exactly one (`origin_city: "Houston"`); the admin's list shows both. Clean up the two test users/loads afterward if you want a tidy dev database (not required, but nice — `DELETE FROM loads WHERE load_number = 'SAME1'; DELETE FROM users WHERE username IN ('alice','bob');`).

- [ ] **Step 3: Commit**

```bash
git add backend/README.md
git commit -m "docs: document registration, roles, and per-user load scoping"
```

---

## Definition of Done

- `npm test` passes in `backend/` with zero failures.
- `npm run setup-db` is safe to run twice in a row (idempotent migration).
- Manual verification in Task 4 confirms two different users can each own a load with the same `load_number`, neither sees the other's loads, and the admin sees both.
- No frontend work is included — that's a separate follow-up plan once this backend is verified working.
