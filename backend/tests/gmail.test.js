require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

jest.mock('../src/lib/googleOAuth');
const googleOAuth = require('../src/lib/googleOAuth');

describe('gmail routes', () => {
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
    jest.clearAllMocks();
    await resetTables(pool);
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/gmail/status');
    expect(res.status).toBe(401);
  });

  test('status reports not connected when no email_accounts row exists', async () => {
    const res = await agent.get('/api/gmail/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: false });
  });

  test('connect redirects to the URL from getAuthUrl', async () => {
    googleOAuth.getAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/mock-url');
    const res = await agent.get('/api/gmail/connect');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://accounts.google.com/o/oauth2/mock-url');
  });

  test('oauth callback stores the connection and redirects to the frontend', async () => {
    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');

    const res = await agent.get('/api/gmail/oauth/callback?code=auth-code-123');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('gmail=connected');

    const statusRes = await agent.get('/api/gmail/status');
    expect(statusRes.body.connected).toBe(true);
    expect(statusRes.body.gmailAddress).toBe('kenny@igtfreight.com');
  });

  test('oauth callback with no code returns 400', async () => {
    const res = await agent.get('/api/gmail/oauth/callback');
    expect(res.status).toBe(400);
  });

  test('re-connecting updates the stored account rather than creating a second row', async () => {
    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');
    await agent.get('/api/gmail/oauth/callback?code=first-code');

    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-2', refresh_token: 'refresh-2' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');
    await agent.get('/api/gmail/oauth/callback?code=second-code');

    const [rows] = await pool.query(
      'SELECT * FROM email_accounts WHERE user_id = (SELECT id FROM users WHERE username = ?)',
      ['testuser']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].refresh_token).toBe('refresh-2');
  });

  test('disconnect removes the stored account', async () => {
    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');
    await agent.get('/api/gmail/oauth/callback?code=auth-code-123');

    const res = await agent.post('/api/gmail/disconnect');
    expect(res.status).toBe(200);

    const statusRes = await agent.get('/api/gmail/status');
    expect(statusRes.body.connected).toBe(false);
  });
});
