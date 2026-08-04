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
