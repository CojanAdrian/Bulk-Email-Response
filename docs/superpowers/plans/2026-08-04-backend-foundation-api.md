# Backend Foundation: API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Node/Express/MySQL backend exposing a session-authenticated REST API for loads and users, replacing the in-page-memory data model with persistent storage.

**Architecture:** Express app (`backend/src/app.js`) exporting `createApp(pool)`, decoupled from a listening server so tests can inject a test database pool. Two route groups: `/api/auth` (login/logout/session check) and `/api/loads` (list/get/update/upload), the latter gated by session-based `requireAuth` middleware. A `scripts/setup-db.js` script creates the schema and an initial admin user in both the dev and test databases.

**Tech Stack:** Node.js, Express, MySQL (`mysql2/promise`), `express-session`, `bcrypt`, `cors`, Jest + Supertest for testing.

**Relationship to other plans:** This plan covers the backend API only. It does not include the React frontend (a separate plan, `2026-08-04-backend-foundation-frontend.md`, to be written once this backend is working) or any of sub-projects 2–4 (email integration, auto-reply, live dashboard) from the design spec at `docs/superpowers/specs/2026-08-04-backend-foundation-design.md`.

**Prerequisite:** A running MySQL server reachable from your machine (local install or Docker), and Node.js installed.

---

## Task 1: Backend project scaffolding

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`

- [ ] **Step 1: Create the backend directory and package.json**

```json
{
  "name": "bulkposting-backend",
  "version": "1.0.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "setup-db": "node scripts/setup-db.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "mysql2": "^3.11.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=bulkposting_dev
DB_NAME_TEST=bulkposting_test
SESSION_SECRET=change-me-in-production
FRONTEND_ORIGIN=http://localhost:5173
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme123
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 4: Copy the example env file and install dependencies**

Run (from `backend/`):
```bash
cp .env.example .env
npm install
```
Expected: `node_modules/` is created, `package-lock.json` is generated, no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example backend/.gitignore
git commit -m "chore: scaffold backend project"
```

---

## Task 2: Database schema, connection pool, and setup script

**Files:**
- Create: `backend/sql/schema.sql`
- Create: `backend/src/db.js`
- Create: `backend/scripts/setup-db.js`

- [ ] **Step 1: Write the schema**

`backend/sql/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  load_number VARCHAR(50) NOT NULL UNIQUE,
  origin_city VARCHAR(100),
  origin_state VARCHAR(2),
  origin_zip VARCHAR(10),
  dest_city VARCHAR(100),
  dest_state VARCHAR(2),
  dest_zip VARCHAR(10),
  equipment VARCHAR(50),
  weight VARCHAR(50),
  target_pay DECIMAL(10,2),
  early_pu DATETIME NULL,
  late_pu DATETIME NULL,
  late_del DATETIME NULL,
  stops INT NULL,
  commodity VARCHAR(100),
  temperature VARCHAR(50),
  comment TEXT,
  status ENUM('active','booked','expired') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Write the connection pool module**

`backend/src/db.js`:
```js
const mysql = require('mysql2/promise');

function createPool(databaseName) {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

module.exports = { createPool };
```

- [ ] **Step 3: Write the setup script**

`backend/scripts/setup-db.js`:
```js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

async function setupDatabase(databaseName) {
  const rootConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  await rootConn.end();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    multipleStatements: true,
  });
  await conn.query(schema);
  await conn.end();
}

async function ensureAdminUser() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [existing] = await conn.query('SELECT id FROM users WHERE username = ?', [process.env.ADMIN_USERNAME]);
  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await conn.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [process.env.ADMIN_USERNAME, passwordHash]);
    console.log(`Created admin user "${process.env.ADMIN_USERNAME}"`);
  } else {
    console.log(`Admin user "${process.env.ADMIN_USERNAME}" already exists, skipping`);
  }
  await conn.end();
}

async function main() {
  await setupDatabase(process.env.DB_NAME);
  await setupDatabase(process.env.DB_NAME_TEST);
  await ensureAdminUser();
  console.log('Database setup complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run the setup script against your local MySQL server**

Run (from `backend/`):
```bash
npm run setup-db
```
Expected output ends with:
```
Created admin user "admin"
Database setup complete.
```
If this fails with a connection error, check `DB_HOST`/`DB_USER`/`DB_PASSWORD` in `.env` against your local MySQL server.

- [ ] **Step 5: Commit**

```bash
git add backend/sql/schema.sql backend/src/db.js backend/scripts/setup-db.js
git commit -m "feat: add database schema, connection pool, and setup script"
```

---

## Task 3: Express app skeleton with a health check

**Files:**
- Create: `backend/src/app.js`
- Create: `backend/src/server.js`
- Test: `backend/tests/health.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/health.test.js`:
```js
require('dotenv').config();
const request = require('supertest');
const { createApp } = require('../src/app');

describe('GET /api/health', () => {
  test('returns ok:true', async () => {
    const app = createApp(null);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `npx jest tests/health.test.js`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Write the app skeleton**

`backend/src/app.js`:
```js
const express = require('express');
const session = require('express-session');
const cors = require('cors');

function createApp(pool) {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  return app;
}

module.exports = { createApp };
```

`backend/src/server.js`:
```js
require('dotenv').config();
const { createApp } = require('./app');
const { createPool } = require('./db');

const pool = createPool(process.env.DB_NAME);
const app = createApp(pool);
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/health.test.js`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.js backend/src/server.js backend/tests/health.test.js
git commit -m "feat: add express app skeleton with health check"
```

---

## Task 4: Auth routes (login, logout, me) and requireAuth middleware

**Files:**
- Create: `backend/src/routes/auth.js`
- Create: `backend/src/middleware/requireAuth.js`
- Create: `backend/tests/setupTestDb.js`
- Create: `backend/tests/auth.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Write the test database helper**

`backend/tests/setupTestDb.js`:
```js
const { createPool } = require('../src/db');

function createTestPool() {
  return createPool(process.env.DB_NAME_TEST);
}

async function resetTables(pool) {
  await pool.query('DELETE FROM loads');
  await pool.query('DELETE FROM users');
}

module.exports = { createTestPool, resetTables };
```

- [ ] **Step 2: Write the failing auth tests**

`backend/tests/auth.test.js`:
```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('auth routes', () => {
  let pool;
  let app;

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
    await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['testuser', passwordHash]);
  });

  test('logs in with correct credentials and sets a session cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'testuser' });
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('rejects login with wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  test('GET /api/auth/me returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me returns the user after login', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'testuser' });
  });

  test('logout destroys the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest tests/auth.test.js`
Expected: FAIL — `/api/auth/login` returns 404 (route doesn't exist yet)

- [ ] **Step 4: Write the requireAuth middleware**

`backend/src/middleware/requireAuth.js`:
```js
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = requireAuth;
```

- [ ] **Step 5: Write the auth router**

`backend/src/routes/auth.js`:
```js
const express = require('express');
const bcrypt = require('bcrypt');

function createAuthRouter(pool) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
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
    res.json({ username: user.username });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ ok: true });
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ username: req.session.username });
  });

  return router;
}

module.exports = createAuthRouter;
```

- [ ] **Step 6: Mount the auth router in app.js**

In `backend/src/app.js`, add near the top:
```js
const createAuthRouter = require('./routes/auth');
```
And after the `app.get('/api/health', ...)` block, add:
```js
  app.use('/api/auth', createAuthRouter(pool));
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx jest tests/auth.test.js`
Expected: PASS (5 passed)

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/auth.js backend/src/middleware/requireAuth.js backend/tests/setupTestDb.js backend/tests/auth.test.js backend/src/app.js
git commit -m "feat: add session-based auth routes (login, logout, me)"
```

---

## Task 5: Loads read endpoints (list and get by id)

**Files:**
- Create: `backend/src/routes/loads.js`
- Create: `backend/tests/loads.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Write the failing tests**

`backend/tests/loads.test.js`:
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
    await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['testuser', passwordHash]);
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/loads');
    expect(res.status).toBe(401);
  });

  test('lists loads inserted directly in the database', async () => {
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state) VALUES (?, ?, ?, ?, ?)',
      ['L1001', 'Dallas', 'TX', 'Chicago', 'IL']
    );
    const res = await agent.get('/api/loads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].load_number).toBe('L1001');
  });

  test('filters loads by status', async () => {
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, status) VALUES (?, ?, ?)',
      ['L1001', 'Dallas', 'active']
    );
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, status) VALUES (?, ?, ?)',
      ['L1002', 'Atlanta', 'booked']
    );
    const res = await agent.get('/api/loads?status=active');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].load_number).toBe('L1001');
  });

  test('gets a single load by id', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city) VALUES (?, ?)', ['L1001', 'Dallas']);
    const res = await agent.get(`/api/loads/${result.insertId}`);
    expect(res.status).toBe(200);
    expect(res.body.load_number).toBe('L1001');
  });

  test('returns 404 for an unknown load id', async () => {
    const res = await agent.get('/api/loads/99999');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/loads.test.js`
Expected: FAIL — `/api/loads` returns 404 (route doesn't exist yet)

- [ ] **Step 3: Write the loads router with list and get**

`backend/src/routes/loads.js`:
```js
const express = require('express');

const LOAD_COLUMNS = [
  'load_number', 'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip', 'equipment', 'weight',
  'target_pay', 'early_pu', 'late_pu', 'late_del', 'stops',
  'commodity', 'temperature', 'comment',
];

function createLoadsRouter(pool) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { status } = req.query;
    const query = status
      ? 'SELECT * FROM loads WHERE status = ? ORDER BY created_at DESC'
      : 'SELECT * FROM loads ORDER BY created_at DESC';
    const params = status ? [status] : [];
    const [rows] = await pool.query(query, params);
    res.json(rows);
  });

  router.get('/:id', async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(rows[0]);
  });

  return router;
}

module.exports = { createLoadsRouter, LOAD_COLUMNS };
```

- [ ] **Step 4: Mount the loads router behind requireAuth**

In `backend/src/app.js`, add near the top:
```js
const { createLoadsRouter } = require('./routes/loads');
const requireAuth = require('./middleware/requireAuth');
```
And after the auth router mount line, add:
```js
  app.use('/api/loads', requireAuth, createLoadsRouter(pool));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/loads.test.js`
Expected: PASS (5 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js backend/src/app.js
git commit -m "feat: add loads list and get-by-id endpoints"
```

---

## Task 6: Loads update endpoint (PATCH)

**Files:**
- Modify: `backend/src/routes/loads.js`
- Modify: `backend/tests/loads.test.js`

- [ ] **Step 1: Add the failing tests**

Append to the `describe('loads routes', ...)` block in `backend/tests/loads.test.js`:
```js
  test('PATCH updates target_pay and status', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay) VALUES (?, ?, ?)', ['L1001', 'Dallas', 1500]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ target_pay: 1700, status: 'booked' });
    expect(res.status).toBe(200);
    expect(Number(res.body.target_pay)).toBe(1700);
    expect(res.body.status).toBe('booked');
  });

  test('PATCH with no valid fields returns 400', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city) VALUES (?, ?)', ['L1001', 'Dallas']);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ origin_city: 'Houston' });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/loads.test.js`
Expected: FAIL — PATCH returns 404 (no PATCH route defined)

- [ ] **Step 3: Add the PATCH route**

In `backend/src/routes/loads.js`, add before `return router;`:
```js
  router.patch('/:id', async (req, res) => {
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
    if (!rows[0]) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(rows[0]);
  });
```
Note: this deliberately only allows updating `target_pay` and `status` — per the design spec, `status` changes only through explicit manual action (this endpoint), never inferred from a CSV upload.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/loads.test.js`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js
git commit -m "feat: add loads PATCH endpoint for rate and status updates"
```

---

## Task 7: Loads upload/upsert endpoint

**Files:**
- Modify: `backend/src/routes/loads.js`
- Modify: `backend/tests/loads.test.js`

- [ ] **Step 1: Add the failing tests**

Append to the `describe('loads routes', ...)` block in `backend/tests/loads.test.js`:
```js
  test('uploads a batch of loads, inserting new ones', async () => {
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

  test('re-uploading an existing load_number updates it instead of duplicating', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1500 }],
    });
    const res = await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1800 }],
    });
    expect(res.status).toBe(200);

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/loads.test.js`
Expected: FAIL — `/api/loads/upload` returns 404

- [ ] **Step 3: Add the upload route**

In `backend/src/routes/loads.js`, add before `return router;`:
```js
  router.post('/upload', async (req, res) => {
    const { loads } = req.body;
    if (!Array.isArray(loads)) {
      return res.status(400).json({ error: 'loads must be an array' });
    }

    let inserted = 0;
    let updated = 0;

    for (const load of loads) {
      const columns = LOAD_COLUMNS.filter((col) => load[col] !== undefined);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((col) => load[col]);
      const updateClause = columns
        .filter((col) => col !== 'load_number')
        .map((col) => `${col} = VALUES(${col})`)
        .join(', ');

      const [result] = await pool.query(
        `INSERT INTO loads (${columns.join(', ')}) VALUES (${placeholders})
         ON DUPLICATE KEY UPDATE ${updateClause}`,
        values
      );
      if (result.affectedRows === 1) {
        inserted += 1;
      } else {
        updated += 1;
      }
    }

    res.json({ inserted, updated });
  });
```
Note: `LOAD_COLUMNS` deliberately excludes `status`, so an upload can never change a load's status — matching the PATCH endpoint's exclusivity over that field.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/loads.test.js`
Expected: PASS (10 passed)

- [ ] **Step 5: Run the full test suite**

Run (from `backend/`): `npm test`
Expected: all test files pass (health, auth, loads)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/loads.js backend/tests/loads.test.js
git commit -m "feat: add loads upload endpoint with upsert-by-load_number"
```

---

## Task 8: README with run instructions

**Files:**
- Create: `backend/README.md`

- [ ] **Step 1: Write the README**

`backend/README.md`:
```markdown
# BulkPosting Backend

Node/Express/MySQL API for persistent load data, replacing the old in-page-memory model.

## Setup

1. Copy `.env.example` to `.env` and fill in your local MySQL credentials.
2. Install dependencies: `npm install`
3. Create the schema and admin user: `npm run setup-db`
4. Start the server: `npm start`

The API listens on `PORT` (default `4000`).

## Running tests

`npm test` runs the Jest/Supertest suite against `DB_NAME_TEST`. Run `npm run setup-db` first so that database exists.

## Manual smoke test

With the server running:

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}'

curl -b cookies.txt -X POST http://localhost:4000/api/loads/upload \
  -H "Content-Type: application/json" \
  -d '{"loads":[{"load_number":"L1001","origin_city":"Dallas","origin_state":"TX","dest_city":"Chicago","dest_state":"IL","target_pay":1500}]}'

curl -b cookies.txt http://localhost:4000/api/loads
```

## API

- `POST /api/auth/login` `{username, password}` → `{username}`, sets session cookie
- `POST /api/auth/logout` → destroys session
- `GET /api/auth/me` → current user or 401
- `GET /api/loads?status=active` → list loads, optionally filtered by status
- `GET /api/loads/:id` → single load
- `PATCH /api/loads/:id` `{target_pay?, status?}` → updated load
- `POST /api/loads/upload` `{loads: [...]}` → upserts by `load_number`, returns `{inserted, updated}`
```

- [ ] **Step 2: Commit**

```bash
git add backend/README.md
git commit -m "docs: add backend README with setup and API reference"
```

---

## Definition of Done

- `npm test` passes in `backend/` (health, auth, loads: 16 tests total).
- `npm run setup-db` successfully creates both databases and an admin user against a local MySQL server.
- The manual smoke test in the README works end-to-end against a running server.
- No frontend work is included in this plan — that follows as a separate plan once this backend is verified working.
