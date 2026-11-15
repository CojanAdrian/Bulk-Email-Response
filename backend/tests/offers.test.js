require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

jest.mock('../src/lib/googleOAuth');
jest.mock('../src/lib/gmailClient');
const googleOAuth = require('../src/lib/googleOAuth');
const gmailClient = require('../src/lib/gmailClient');

describe('emailing a load to carriers found on DAT', () => {
  let pool;
  let app;
  let agent;
  let userId;
  let loadId;

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
    const [user] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = user.insertId;
    await pool.query('INSERT INTO email_accounts (user_id, gmail_address, refresh_token, signature) VALUES (?, ?, ?, ?)', [userId, 'kenny@brokerage.test', 'refresh', 'Kenny']);
    const [load] = await pool.query("INSERT INTO loads (user_id, load_number, origin_city, origin_state, dest_city, dest_state, status) VALUES (?, 'L1', 'Chicago', 'IL', 'Dallas', 'TX', 'active')", [userId]);
    loadId = load.insertId;
    googleOAuth.getAccessToken.mockResolvedValue('token');
    gmailClient.getGmailSignature.mockResolvedValue('');
    let n = 0;
    gmailClient.sendReply.mockImplementation(async () => {
      n += 1;
      return { id: `m${n}`, threadId: `t${n}` };
    });
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  const send = (recipients, extra = {}) =>
    agent.post('/api/offers').send({ load_id: loadId, subject: 'Load available: Chicago, IL → Dallas, TX', body: 'PU: CHICAGO, IL', recipients, ...extra });

  test('sends each carrier their own signed email and remembers it', async () => {
    const res = await send([
      { email: 'Dispatch@Redline.com', name: 'REDLINE HAUL', mc: '884213' },
      { email: 'ops@northstar.com', name: 'NORTHSTAR', mc: '671905' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(2);
    expect(gmailClient.sendReply).toHaveBeenCalledTimes(2);
    expect(gmailClient.sendReply.mock.calls[0][1]).toMatchObject({ to: 'dispatch@redline.com', subject: 'Load available: Chicago, IL → Dallas, TX', body: 'PU: CHICAGO, IL\n\nKenny' });
    const [rows] = await pool.query('SELECT email, carrier_mc, gmail_thread_id FROM carrier_offers WHERE load_id = ? ORDER BY id', [loadId]);
    expect(rows).toEqual([
      { email: 'dispatch@redline.com', carrier_mc: '884213', gmail_thread_id: 't1' },
      { email: 'ops@northstar.com', carrier_mc: '671905', gmail_thread_id: 't2' },
    ]);
    const list = await agent.get(`/api/offers?load_id=${loadId}`);
    expect(list.body.map((row) => row.email).sort()).toEqual(['dispatch@redline.com', 'ops@northstar.com']);
  });

  test('never emails the same carrier twice about one load, and skips bad addresses', async () => {
    await send([{ email: 'dispatch@redline.com' }]);
    gmailClient.sendReply.mockClear();
    const res = await send([{ email: 'dispatch@redline.com' }, { email: 'not-an-email' }]);
    expect(res.body.sent).toBe(0);
    expect(res.body.results).toEqual([
      expect.objectContaining({ email: 'dispatch@redline.com', skipped: true }),
      expect.objectContaining({ email: 'not-an-email', ok: false }),
    ]);
    expect(gmailClient.sendReply).not.toHaveBeenCalled();
  });

  test('one failed send does not stop the rest', async () => {
    gmailClient.sendReply.mockRejectedValueOnce(new Error('Gmail said no')).mockResolvedValueOnce({ id: 'm2', threadId: 't2' });
    const res = await send([{ email: 'a@x.com' }, { email: 'b@x.com' }]);
    expect(res.body.results).toEqual([
      { email: 'a@x.com', ok: false, error: 'Gmail said no' },
      { email: 'b@x.com', ok: true },
    ]);
  });

  test('another user\'s load is not found', async () => {
    const [other] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('other', 'x', 'user')");
    const [load] = await pool.query("INSERT INTO loads (user_id, load_number, status) VALUES (?, 'L9', 'active')", [other.insertId]);
    const res = await agent.post('/api/offers').send({ load_id: load.insertId, subject: 's', body: 'b', recipients: [{ email: 'a@x.com' }] });
    expect(res.status).toBe(404);
  });

  test('needs a subject, a body and at least one carrier', async () => {
    expect((await send([], {})).status).toBe(400);
    expect((await send([{ email: 'a@x.com' }], { subject: ' ' })).status).toBe(400);
  });
});
