require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

jest.mock('../src/lib/googleOAuth');
const googleOAuth = require('../src/lib/googleOAuth');

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
    jest.clearAllMocks();
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

  test('rejects a password login attempt for a Google-only account (null password_hash) with a clean 401, not a crash', async () => {
    await pool.query(
      "INSERT INTO users (username, password_hash, google_id, role) VALUES (?, NULL, ?, 'user')",
      ['googleuser@gmail.com', 'google-sub-1']
    );
    const res = await request(app).post('/api/auth/login').send({ username: 'googleuser@gmail.com', password: 'anything' });
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

  test('two concurrent registrations for the same username never both succeed, and the loser gets a clean 400 (not a 500)', async () => {
    const [resA, resB] = await Promise.all([
      request(app).post('/api/auth/register').send({ username: 'racer', password: 'longenough' }),
      request(app).post('/api/auth/register').send({ username: 'racer', password: 'longenough' }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);
    const loser = resA.status === 400 ? resA : resB;
    expect(loser.body).toEqual({ error: 'Username already taken' });

    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', ['racer']);
    expect(rows).toHaveLength(1);
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

  describe('Google sign-in', () => {
    test('GET /api/auth/google redirects to the URL from getSignInAuthUrl', async () => {
      googleOAuth.getSignInAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/mock-signin-url');
      const res = await request(app).get('/api/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://accounts.google.com/o/oauth2/mock-signin-url');
    });

    test('a brand-new Google identity creates a user, connects Gmail with the same tokens, and starts a session', async () => {
      googleOAuth.exchangeSignInCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
      googleOAuth.getGoogleIdentity.mockResolvedValue({
        googleId: 'google-sub-1', email: 'newcolleague@gmail.com', emailVerified: true, name: 'New Colleague',
      });

      const agent = request.agent(app);
      const res = await agent.get('/api/auth/google/callback?code=auth-code-123');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/');

      const [userRows] = await pool.query('SELECT * FROM users WHERE google_id = ?', ['google-sub-1']);
      expect(userRows).toHaveLength(1);
      expect(userRows[0].username).toBe('newcolleague@gmail.com');
      expect(userRows[0].role).toBe('user');
      expect(userRows[0].password_hash).toBeNull();

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE user_id = ?', [userRows[0].id]);
      expect(accountRows).toHaveLength(1);
      expect(accountRows[0].gmail_address).toBe('newcolleague@gmail.com');
      expect(accountRows[0].refresh_token).toBe('refresh-1');

      const meRes = await agent.get('/api/auth/me');
      expect(meRes.body).toEqual({ username: 'newcolleague@gmail.com', role: 'user' });
    });

    test('a returning Google identity logs into the same account without creating a duplicate', async () => {
      googleOAuth.exchangeSignInCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
      googleOAuth.getGoogleIdentity.mockResolvedValue({
        googleId: 'google-sub-2', email: 'returning@gmail.com', emailVerified: true, name: 'Returning',
      });
      await request(app).get('/api/auth/google/callback?code=first-code');

      googleOAuth.exchangeSignInCodeForTokens.mockResolvedValue({ access_token: 'access-2', refresh_token: 'refresh-2' });
      const agent = request.agent(app);
      await agent.get('/api/auth/google/callback?code=second-code');

      const [userRows] = await pool.query('SELECT * FROM users WHERE google_id = ?', ['google-sub-2']);
      expect(userRows).toHaveLength(1);

      const meRes = await agent.get('/api/auth/me');
      expect(meRes.body).toEqual({ username: 'returning@gmail.com', role: 'user' });
    });

    test('redirects with an error and creates no user when the email is not verified', async () => {
      googleOAuth.exchangeSignInCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
      googleOAuth.getGoogleIdentity.mockResolvedValue({
        googleId: 'google-sub-3', email: 'unverified@gmail.com', emailVerified: false, name: 'Unverified',
      });

      const res = await request(app).get('/api/auth/google/callback?code=auth-code-123');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('authError=');

      const [userRows] = await pool.query('SELECT * FROM users WHERE google_id = ?', ['google-sub-3']);
      expect(userRows).toHaveLength(0);
    });

    test('redirects with an error when no code is present', async () => {
      const res = await request(app).get('/api/auth/google/callback');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('authError=');
      expect(googleOAuth.exchangeSignInCodeForTokens).not.toHaveBeenCalled();
    });

    test('redirects with an error (not a 500) when the resolved username is already taken by a different account', async () => {
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['collision@gmail.com', 'somehash']);
      googleOAuth.exchangeSignInCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
      googleOAuth.getGoogleIdentity.mockResolvedValue({
        googleId: 'google-sub-4', email: 'collision@gmail.com', emailVerified: true, name: 'Collision',
      });

      const res = await request(app).get('/api/auth/google/callback?code=auth-code-123');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('authError=');

      const [userRows] = await pool.query('SELECT * FROM users WHERE username = ?', ['collision@gmail.com']);
      expect(userRows).toHaveLength(1);
      expect(userRows[0].google_id).toBeNull();
    });
  });
});
