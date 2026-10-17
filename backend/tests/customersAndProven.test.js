require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('proven lanes and customers routes', () => {
  let pool;
  let app;
  let agent;
  let userId;
  let otherUserId;

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
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = result.insertId;
    const [other] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['otheruser', passwordHash]);
    otherUserId = other.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  async function makeLoad(fields) {
    const row = { origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', user_id: userId, ...fields };
    const cols = Object.keys(row);
    const [res] = await pool.query(`INSERT INTO loads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(row));
    return res.insertId;
  }

  async function makeCarrier(name, equipment = null, owner = userId) {
    const [res] = await pool.query('INSERT INTO carriers (user_id, company_name, equipment_types) VALUES (?, ?, ?)', [
      owner, name, equipment ? JSON.stringify(equipment) : null,
    ]);
    return res.insertId;
  }

  async function makeRun(carrierId, fields = {}) {
    const row = {
      carrier_id: carrierId, user_id: userId, origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Chicago', dest_state: 'IL',
      rate: 1900, gp: 250, ran_at: '2026-08-02', ...fields,
    };
    const cols = Object.keys(row);
    await pool.query(`INSERT INTO carrier_lane_history (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(row));
  }

  describe('POST /api/carrier-matches/proven', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/carrier-matches/proven').send({ loadIds: [1] });
      expect(res.status).toBe(401);
    });

    test('400 when loadIds is empty', async () => {
      const res = await agent.post('/api/carrier-matches/proven').send({ loadIds: [] });
      expect(res.status).toBe(400);
    });

    test('returns carriers that ran the exact lane, with runs and last rate', async () => {
      const loadId = await makeLoad({ load_number: 'P1' });
      const carrierId = await makeCarrier('Swift Haul', ['V']);
      await makeRun(carrierId, { ran_at: '2026-07-01', rate: 1800 });
      await makeRun(carrierId, { origin_city: 'atlanta', dest_city: 'CHICAGO', ran_at: '2026-08-02', rate: 1900 });
      const res = await agent.post('/api/carrier-matches/proven').send({ loadIds: [loadId] });
      expect(res.status).toBe(200);
      expect(res.body[loadId]).toEqual([{ carrierId, carrierName: 'Swift Haul', runs: 2, lastRanAt: '2026-08-02', lastRate: 1900 }]);
    });

    test('omits a carrier whose equipment does not overlap', async () => {
      const loadId = await makeLoad({ load_number: 'P2', equipment: 'F' });
      const carrierId = await makeCarrier('Van Only', ['V']);
      await makeRun(carrierId);
      const res = await agent.post('/api/carrier-matches/proven').send({ loadIds: [loadId] });
      expect(res.body).toEqual({});
    });

    test('never counts history belonging to another user', async () => {
      const loadId = await makeLoad({ load_number: 'P3' });
      const carrierId = await makeCarrier('Theirs', null, otherUserId);
      await makeRun(carrierId, { user_id: otherUserId });
      const res = await agent.post('/api/carrier-matches/proven').send({ loadIds: [loadId] });
      expect(res.body).toEqual({});
    });
  });

  describe('GET /api/customers', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(401);
    });

    test('groups customer names case-insensitively and counts loads and carriers', async () => {
      const loadId = await makeLoad({ load_number: 'A1', customer: 'ALDI, Inc' });
      await makeLoad({ load_number: 'A2', customer: 'aldi, inc' });
      await makeLoad({ load_number: 'K1', customer: 'Kroger' });
      const carrierId = await makeCarrier('Swift Haul');
      await makeRun(carrierId, { load_id: loadId });
      const otherCarrier = await makeCarrier('Blue Line');
      await makeRun(otherCarrier, { customer: 'Aldi, Inc' });

      const res = await agent.get('/api/customers');
      expect(res.status).toBe(200);
      const aldiEntries = res.body.filter((c) => c.name.toLowerCase() === 'aldi, inc');
      expect(aldiEntries).toHaveLength(1);
      expect(aldiEntries[0]).toMatchObject({ loadCount: 2, carrierCount: 2 });
      expect(res.body.find((c) => c.name === 'Kroger')).toMatchObject({ loadCount: 1, carrierCount: 0 });
    });
  });

  describe('GET /api/customers/carriers', () => {
    test('400 without a name', async () => {
      const res = await agent.get('/api/customers/carriers');
      expect(res.status).toBe(400);
    });

    test('lists carriers who hauled for the customer on any lane, most runs first', async () => {
      const loadA = await makeLoad({ load_number: 'A1', customer: 'ALDI, Inc' });
      const loadB = await makeLoad({ load_number: 'A2', customer: 'ALDI, Inc', origin_city: 'Dallas', origin_state: 'TX' });
      const swift = await makeCarrier('Swift Haul');
      await makeRun(swift, { load_id: loadA, rate: 1800, gp: 200 });
      await makeRun(swift, { load_id: loadB, origin_city: 'Dallas', origin_state: 'TX', rate: 2200, gp: 300 });
      const blue = await makeCarrier('Blue Line');
      await makeRun(blue, { customer: 'aldi, inc' });
      const notAldi = await makeCarrier('Elsewhere');
      await makeRun(notAldi, { customer: 'Kroger' });

      const res = await agent.get('/api/customers/carriers').query({ name: 'Aldi, Inc' });
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.carrierName)).toEqual(['Swift Haul', 'Blue Line']);
      expect(res.body[0]).toMatchObject({ runs: 2, avgRate: 2000, avgGp: 250 });
      expect(res.body[0].lanes).toHaveLength(2);
    });

    test('range=30 excludes an old run, and equipment filters by overlap', async () => {
      const recent = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
      const swift = await makeCarrier('Swift Haul', ['V']);
      await makeRun(swift, { customer: 'Target', ran_at: '2020-01-01' });
      const reefer = await makeCarrier('Cold Co', ['R']);
      await makeRun(reefer, { customer: 'Target', ran_at: recent });

      const ranged = await agent.get('/api/customers/carriers').query({ name: 'Target', range: '30' });
      expect(ranged.body.map((c) => c.carrierName)).toEqual(['Cold Co']);

      const vanOnly = await agent.get('/api/customers/carriers').query({ name: 'Target', equipment: 'V' });
      expect(vanOnly.body.map((c) => c.carrierName)).toEqual(['Swift Haul']);
    });
  });
});
