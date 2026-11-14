require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('GET /api/places/cities', () => {
  let pool;
  let agent;
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
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('suggests cities with their state', async () => {
    const res = await agent.get('/api/places/cities?q=holiday%20city%2C%20oh');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ city: 'Holiday City', state: 'OH' }]);
  });

  test('needs at least two letters', async () => {
    expect((await agent.get('/api/places/cities?q=c')).body).toEqual([]);
  });

  test('requires a signed-in user', async () => {
    expect((await request(app).get('/api/places/cities?q=chi')).status).toBe(401);
  });
});
