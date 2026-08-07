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
    expect(res.body).toEqual({ username: 'testuser', role: 'user' });
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
    expect(res.body).toEqual({ username: 'testuser', role: 'user' });
  });

  test('logout destroys the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('login returns 500 instead of crashing when the database is unavailable', async () => {
    const brokenPool = { query: () => Promise.reject(new Error('connection lost')) };
    const brokenApp = createApp(brokenPool);
    const res = await request(brokenApp).post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

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
});
