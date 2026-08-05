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
