require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('carriers routes', () => {
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
    await pool.query('DELETE FROM carrier_lane_history');
    await pool.query('DELETE FROM carriers');
    await pool.query('DELETE FROM geocode_cache');
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = result.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/carriers');
    expect(res.status).toBe(401);
  });

  describe('GET /', () => {
    test('lists only the current user\'s own carriers, alphabetically', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Zebra Logistics')", [userId]);
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses Carrier')", [otherUser.insertId]);

      const res = await agent.get('/api/carriers');
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.company_name)).toEqual(['ABC Trucking', 'Zebra Logistics']);
    });

    test('filters by ?q= across company name, MC number, and dispatcher name', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name, mc_number, dispatcher_name) VALUES (?, 'ABC Trucking', '123456', 'John Doe')", [userId]);
      await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Zebra Logistics')", [userId]);

      const res = await agent.get('/api/carriers?q=123456');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].company_name).toBe('ABC Trucking');
    });
  });

  describe('POST / (find-or-create)', () => {
    test('creates a new carrier when no match exists', async () => {
      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', mc_number: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.company_name).toBe('ABC Trucking');
      expect(res.body.mc_number).toBe('123456');
    });

    test('returns 400 when company_name is missing or blank', async () => {
      const res1 = await agent.post('/api/carriers').send({});
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/carriers').send({ company_name: '   ' });
      expect(res2.status).toBe(400);
    });

    test('finds an existing carrier by MC number instead of creating a duplicate', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [userId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking Inc', mc_number: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(existing.insertId);

      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carriers WHERE user_id = ?', [userId]);
      expect(rows[0].count).toBe(1);
    });

    test('falls back to a case-insensitive company name match when no MC number is given', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'abc trucking' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(existing.insertId);
    });

    test('a matched carrier is updated with any new fields provided', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [userId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', mc_number: '123456', dispatcher_name: 'Jane Doe' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(existing.insertId);
      expect(res.body.dispatcher_name).toBe('Jane Doe');
    });

    test('stores dispatcher_email', async () => {
      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', dispatcher_email: 'dispatch@abctrucking.com' });
      expect(res.status).toBe(200);
      expect(res.body.dispatcher_email).toBe('dispatch@abctrucking.com');
    });

    test('stores equipment_types and operating_states as JSON arrays', async () => {
      const res = await agent.post('/api/carriers').send({
        company_name: 'ABC Trucking', equipment_types: ['V', 'R'], operating_states: ['TX', 'OK'],
      });
      expect(res.status).toBe(200);
      expect(res.body.equipment_types).toEqual(['V', 'R']);
      expect(res.body.operating_states).toEqual(['TX', 'OK']);
    });

    test('does not match a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [otherUser.insertId]);

      const res = await agent.post('/api/carriers').send({ company_name: 'ABC Trucking', mc_number: '123456' });
      expect(res.status).toBe(200);

      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carriers WHERE user_id = ?', [userId]);
      expect(rows[0].count).toBe(1);
    });
  });

  describe('GET /lookup', () => {
    test('returns the carrier matching the given MC number', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [userId]);
      const res = await agent.get('/api/carriers/lookup?mc=123456');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(existing.insertId);
    });

    test('returns null when no carrier has that MC number', async () => {
      const res = await agent.get('/api/carriers/lookup?mc=999999');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    test('returns 400 when mc is missing', async () => {
      const res = await agent.get('/api/carriers/lookup');
      expect(res.status).toBe(400);
    });

    test('does not match another user\'s carrier', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'Someone Elses', '123456')", [otherUser.insertId]);

      const res = await agent.get('/api/carriers/lookup?mc=123456');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('GET /:id', () => {
    test('returns the full carrier record', async () => {
      const [existing] = await pool.query("INSERT INTO carriers (user_id, company_name, mc_number) VALUES (?, 'ABC Trucking', '123456')", [userId]);
      const res = await agent.get(`/api/carriers/${existing.insertId}`);
      expect(res.status).toBe(200);
      expect(res.body.company_name).toBe('ABC Trucking');
      expect(res.body.mc_number).toBe('123456');
    });

    test('returns 404 for a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);

      const res = await agent.get(`/api/carriers/${result.insertId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /:id', () => {
    test('updates the given fields', async () => {
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      const res = await agent.patch(`/api/carriers/${result.insertId}`).send({ dispatcher_phone: '555-1234' });
      expect(res.status).toBe(200);
      expect(res.body.dispatcher_phone).toBe('555-1234');
    });

    test('returns 404 for a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);

      const res = await agent.patch(`/api/carriers/${result.insertId}`).send({ dispatcher_phone: '555-1234' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    test('deletes the carrier', async () => {
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      const res = await agent.delete(`/api/carriers/${result.insertId}`);
      expect(res.status).toBe(200);
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carriers WHERE id = ?', [result.insertId]);
      expect(rows[0].count).toBe(0);
    });

    test('returns 404 for a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);

      const res = await agent.delete(`/api/carriers/${result.insertId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('lane history', () => {
    let carrierId;

    beforeEach(async () => {
      const [result] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
      carrierId = result.insertId;
    });

    test('POST /:id/history creates a lane entry, normalizing city/state casing', async () => {
      const res = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'dallas', origin_state: 'tx', dest_city: 'chicago', dest_state: 'il', rate: 1500,
      });
      expect(res.status).toBe(201);
      expect(res.body.origin_city).toBe('Dallas');
      expect(res.body.origin_state).toBe('TX');
      expect(res.body.dest_city).toBe('Chicago');
      expect(Number(res.body.rate)).toBe(1500);
    });

    test('POST /:id/history stores gp (gross profit) alongside rate', async () => {
      const res = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: 1500, gp: 300,
      });
      expect(res.status).toBe(201);
      expect(Number(res.body.gp)).toBe(300);
    });

    test('PATCH /history/:historyId can update gp', async () => {
      const createRes = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', rate: 1500, gp: 300,
      });
      const res = await agent.patch(`/api/carriers/history/${createRes.body.id}`).send({ gp: 450 });
      expect(res.status).toBe(200);
      expect(Number(res.body.gp)).toBe(450);
    });

    test('POST /:id/history returns 400 when origin/destination city or state is missing', async () => {
      const res = await agent.post(`/api/carriers/${carrierId}/history`).send({ origin_city: 'Dallas' });
      expect(res.status).toBe(400);
    });

    test('POST /:id/history returns 404 for a carrier belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherCarrier] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);

      const res = await agent.post(`/api/carriers/${otherCarrier.insertId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      expect(res.status).toBe(404);
    });

    test('GET /:id/history lists entries for that carrier only', async () => {
      await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      const res = await agent.get(`/api/carriers/${carrierId}/history`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('PATCH /history/:historyId updates the given fields', async () => {
      const createRes = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      const res = await agent.patch(`/api/carriers/history/${createRes.body.id}`).send({ rate: 2000 });
      expect(res.status).toBe(200);
      expect(Number(res.body.rate)).toBe(2000);
    });

    test('DELETE /history/:historyId removes the entry', async () => {
      const createRes = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      });
      const res = await agent.delete(`/api/carriers/history/${createRes.body.id}`);
      expect(res.status).toBe(200);
      const [rows] = await pool.query('SELECT COUNT(*) AS count FROM carrier_lane_history WHERE id = ?', [createRes.body.id]);
      expect(rows[0].count).toBe(0);
    });

    test('load_id is stored when provided (the booking-flow hook)', async () => {
      const [loadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L1001', 'Dallas', 'TX', 'Chicago', 'IL', ?, 'booked')",
        [userId]
      );
      const res = await agent.post(`/api/carriers/${carrierId}/history`).send({
        origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', load_id: loadResult.insertId,
      });
      expect(res.status).toBe(201);
      expect(res.body.load_id).toBe(loadResult.insertId);
    });
  });
});
