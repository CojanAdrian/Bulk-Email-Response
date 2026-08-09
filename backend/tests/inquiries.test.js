require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('inquiries routes', () => {
  let pool;
  let app;
  let agent;
  let userId;
  let accountId;

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
    const [userResult] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = userResult.insertId;
    const [accountResult] = await pool.query(
      'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
      [userId, 'testuser@example.com', 'refresh-token']
    );
    accountId = accountResult.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/inquiries');
    expect(res.status).toBe(401);
  });

  test('lists only the current user\'s own inquiries, newest first', async () => {
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Older inquiry', '2026-08-01 08:00:00', 'none', 'needs_review')`,
      [userId, accountId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm2', 'carrier2@example.com', 'Newer inquiry', '2026-08-02 08:00:00', 'load_number', 'matched')`,
      [userId, accountId]
    );

    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const [otherAccount] = await pool.query(
      'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
      [otherUser.insertId, 'other@example.com', 'other-refresh']
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm3', 'someone@example.com', 'Someone elses inquiry', '2026-08-03 08:00:00', 'none', 'needs_review')`,
      [otherUser.insertId, otherAccount.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].subject).toBe('Newer inquiry');
    expect(res.body[1].subject).toBe('Older inquiry');
  });
});
