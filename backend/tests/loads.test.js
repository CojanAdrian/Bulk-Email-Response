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

  test('GET /api/loads returns 500 instead of crashing when the database is unavailable', async () => {
    const express = require('express');
    const { createLoadsRouter } = require('../src/routes/loads');
    const brokenPool = { query: () => Promise.reject(new Error('connection lost')) };
    const bareApp = express();
    bareApp.use('/api/loads', createLoadsRouter(brokenPool));
    bareApp.use((err, req, res, next) => {
      res.status(500).json({ error: 'Internal server error' });
    });
    const res = await request(bareApp).get('/api/loads');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  test('PATCH /api/loads/:id returns 500 instead of crashing when the database is unavailable', async () => {
    const express = require('express');
    const { createLoadsRouter } = require('../src/routes/loads');
    const brokenPool = { query: () => Promise.reject(new Error('connection lost')) };
    const bareApp = express();
    bareApp.use(express.json());
    bareApp.use('/api/loads', createLoadsRouter(brokenPool));
    bareApp.use((err, req, res, next) => {
      res.status(500).json({ error: 'Internal server error' });
    });
    const res = await request(bareApp).patch('/api/loads/1').send({ target_pay: 1700 });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  test('PATCH returns 404 for an unknown load id', async () => {
    const res = await agent.patch('/api/loads/99999').send({ target_pay: 1700 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Load not found' });
  });

  test('PATCH ignores disallowed fields but still applies allowed ones', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay) VALUES (?, ?, ?)', ['L1001', 'Dallas', 1500]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ origin_city: 'Houston', target_pay: 2000 });
    expect(res.status).toBe(200);
    expect(Number(res.body.target_pay)).toBe(2000);
    expect(res.body.origin_city).toBe('Dallas');
  });

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
});
