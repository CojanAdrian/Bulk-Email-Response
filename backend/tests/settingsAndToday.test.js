require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');
const { DEFAULTS, cleanChange } = require('../src/lib/userSettings');

describe('cleanChange', () => {
  test('keeps known settings and drops everything else', () => {
    expect(cleanChange({ targets: { loadsPerDay: '9', bogus: 1 }, hacker: { x: 1 } })).toEqual({ targets: { loadsPerDay: 9 } });
  });

  test('clamps numbers into range and refuses values of the wrong kind', () => {
    expect(cleanChange({ targets: { loadsPerDay: 0, replyMinutes: 'soon' }, notifications: { sound: 'yes' }, board: { openingTab: 'admin' } })).toEqual({
      targets: { loadsPerDay: 1 },
    });
  });
});

describe('settings, today and password routes', () => {
  let pool;
  let app;
  let agent;
  let userId;

  beforeAll(() => {
    pool = createTestPool();
    app = createApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetTables(pool);
    await pool.query('DELETE FROM user_settings');
    await pool.query('DELETE FROM carrier_lane_history');
    await pool.query('DELETE FROM carriers');
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = result.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  describe('settings', () => {
    test('a new user gets the defaults', async () => {
      const res = await agent.get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULTS);
    });

    test('a change is saved for that user only and leaves other settings alone', async () => {
      const res = await agent.patch('/api/settings').send({ targets: { loadsPerDay: 12 } });
      expect(res.body.targets).toEqual({ ...DEFAULTS.targets, loadsPerDay: 12 });
      expect(res.body.notifications).toEqual(DEFAULTS.notifications);

      const again = await agent.get('/api/settings');
      expect(again.body.targets.loadsPerDay).toBe(12);

      const passwordHash = await bcrypt.hash('correcthorse', 10);
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['other', passwordHash]);
      const other = request.agent(app);
      await other.post('/api/auth/login').send({ username: 'other', password: 'correcthorse' });
      expect((await other.get('/api/settings')).body.targets.loadsPerDay).toBe(DEFAULTS.targets.loadsPerDay);
    });

    test('requires a signed-in user', async () => {
      expect((await request(app).get('/api/settings')).status).toBe(401);
    });
  });

  describe('GET /api/stats/today', () => {
    async function bookedLoad(number, gp, bookedSql = 'NOW()') {
      const [load] = await pool.query(
        `INSERT INTO loads (user_id, load_number, status, booked_at, origin_city, origin_state, dest_city, dest_state) VALUES (?, ?, 'booked', ${bookedSql}, 'Dallas', 'TX', 'Chicago', 'IL')`,
        [userId, number]
      );
      if (gp !== null) {
        const [carrier] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC')", [userId]);
        await pool.query(
          "INSERT INTO carrier_lane_history (carrier_id, user_id, load_id, origin_city, origin_state, dest_city, dest_state, gp) VALUES (?, ?, ?, 'Dallas', 'TX', 'Chicago', 'IL', ?)",
          [carrier.insertId, userId, load.insertId, gp]
        );
      }
    }

    test('counts loads booked today and averages their gross profit', async () => {
      await bookedLoad('A1', 1200);
      await bookedLoad('A2', 1800);
      await bookedLoad('A3', null);
      await bookedLoad('OLD', 500, 'NOW() - INTERVAL 3 DAY');
      const res = await agent.get('/api/stats/today');
      expect(res.status).toBe(200);
      expect(res.body.bookedToday).toBe(3);
      expect(res.body.avgGpToday).toBe(1500);
      expect(res.body.series).toHaveLength(7);
      expect(res.body.series[6]).toEqual({ day: res.body.today, booked: 3, avgGp: 1500 });
      expect(res.body.series[3]).toMatchObject({ booked: 1, avgGp: 500 });
      // Per load across the week: (1200 + 1800 + 500) / 3, not the average of the two days.
      expect(res.body.weekAvgGp).toBe(1167);
    });

    test('gives the median minutes between an inquiry arriving and its reply today', async () => {
      const [account] = await pool.query("INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, 'a@b.com', 'x')", [userId]);
      for (const [index, minutes] of [2, 4, 30].entries()) {
        await pool.query(
          `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, received_at, reply_status, reply_sent_at)
           VALUES (?, ?, ?, NOW() - INTERVAL ? MINUTE, 'sent', NOW())`,
          [userId, account.insertId, `m${index}`, minutes]
        );
      }
      const res = await agent.get('/api/stats/today');
      expect(res.body.repliedToday).toBe(3);
      expect(res.body.medianReplyMinutes).toBe(4);
    });

    test('is empty but complete for a new user', async () => {
      const res = await agent.get('/api/stats/today');
      expect(res.body).toMatchObject({ bookedToday: 0, avgGpToday: null, repliedToday: 0, medianReplyMinutes: null });
    });
  });

  describe('POST /api/auth/change-password', () => {
    test('changes the password when the current one is right', async () => {
      const res = await agent.post('/api/auth/change-password').send({ currentPassword: 'correcthorse', newPassword: 'batterystaple' });
      expect(res.status).toBe(200);
      const fresh = request.agent(app);
      expect((await fresh.post('/api/auth/login').send({ username: 'testuser', password: 'batterystaple' })).status).toBe(200);
    });

    test('refuses a wrong current password', async () => {
      const res = await agent.post('/api/auth/change-password').send({ currentPassword: 'nope', newPassword: 'batterystaple' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/current password/i);
    });

    test('refuses a short new password', async () => {
      const res = await agent.post('/api/auth/change-password').send({ currentPassword: 'correcthorse', newPassword: 'short' });
      expect(res.status).toBe(400);
    });
  });
});
