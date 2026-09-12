require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

// Real coordinates: Fort Worth is ~30mi from Dallas (strong match radius);
// Chicago is ~800mi away (no match).
const DALLAS = { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 };
const FORT_WORTH = { city: 'Fort Worth', state: 'TX', lat: 32.7555, lng: -97.3308 };
const CHICAGO = { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 };

describe('carrier-matches routes', () => {
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
    // Pre-seed the geocode cache for every city/state used in this file, so
    // matching itself is exercised without depending on a live
    // GOOGLE_MAPS_API_KEY being configured -- consistent with how
    // geocodeCityState is exercised elsewhere in the test suite.
    await pool.query('INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)', [
      'dallas|tx', DALLAS.lat, DALLAS.lng,
      'fort worth|tx', FORT_WORTH.lat, FORT_WORTH.lng,
      'chicago|il', CHICAGO.lat, CHICAGO.lng,
      'tx|tx', 31.0, -100.0,
    ]);
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = result.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  async function makeCarrierWithHistory() {
    const [carrierResult] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'ABC Trucking')", [userId]);
    await pool.query(
      `INSERT INTO carrier_lane_history (carrier_id, user_id, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, dest_lat, dest_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [carrierResult.insertId, userId, FORT_WORTH.city, FORT_WORTH.state, FORT_WORTH.lat, FORT_WORTH.lng, CHICAGO.city, CHICAGO.state, CHICAGO.lat, CHICAGO.lng]
    );
    return carrierResult.insertId;
  }

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/carrier-matches');
    expect(res.status).toBe(401);
  });

  describe('POST / (manual lane)', () => {
    test('returns lane matches for a manually-entered lane', async () => {
      await makeCarrierWithHistory();
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.status).toBe(200);
      expect(res.body.laneMatches).toHaveLength(1);
      expect(res.body.laneMatches[0].carrierName).toBe('ABC Trucking');
      expect(res.body.laneMatches[0].tier).toBe('perfect');
    });

    test('lane matches include the carrier\'s contact/equipment details for the detail view', async () => {
      const carrierId = await makeCarrierWithHistory();
      await pool.query(
        "UPDATE carriers SET mc_number = '123456', dispatcher_phone = '555-1234', dispatcher_email = 'dispatch@abc.com', equipment_types = ? WHERE id = ?",
        [JSON.stringify(['V']), carrierId]
      );
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.body.laneMatches[0].mc_number).toBe('123456');
      expect(res.body.laneMatches[0].dispatcher_phone).toBe('555-1234');
      expect(res.body.laneMatches[0].dispatcher_email).toBe('dispatch@abc.com');
      expect(res.body.laneMatches[0].equipment_types).toEqual(['V']);
    });

    test('lane matches include origin/destination coordinates for the globe', async () => {
      await makeCarrierWithHistory();
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.body.laneMatches[0].originLat).toBeCloseTo(FORT_WORTH.lat, 2);
      expect(res.body.laneMatches[0].originLng).toBeCloseTo(FORT_WORTH.lng, 2);
      expect(res.body.laneMatches[0].destLat).toBeCloseTo(CHICAGO.lat, 2);
    });

    test('returns 400 when origin/destination city or state is missing', async () => {
      const res = await agent.post('/api/carrier-matches').send({ originCity: 'Dallas' });
      expect(res.status).toBe(400);
    });

    test('includes the resolved query lane coordinates, for the globe to draw/zoom to even with no matches', async () => {
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.body.queryOrigin).toEqual(expect.objectContaining({ lat: expect.closeTo(DALLAS.lat, 2), lng: expect.closeTo(DALLAS.lng, 2) }));
      expect(res.body.queryDest).toEqual(expect.objectContaining({ lat: expect.closeTo(CHICAGO.lat, 2), lng: expect.closeTo(CHICAGO.lng, 2) }));
    });

    test('only matches the current user\'s own carriers', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherCarrier] = await pool.query("INSERT INTO carriers (user_id, company_name) VALUES (?, 'Someone Elses')", [otherUser.insertId]);
      await pool.query(
        `INSERT INTO carrier_lane_history (carrier_id, user_id, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [otherCarrier.insertId, otherUser.insertId, FORT_WORTH.city, FORT_WORTH.state, FORT_WORTH.lat, FORT_WORTH.lng, CHICAGO.city, CHICAGO.state]
      );

      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.status).toBe(200);
      expect(res.body.laneMatches).toHaveLength(0);
    });

    test('returns regional matches for a carrier with no lane history but a tagged operating state', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name, operating_states) VALUES (?, 'Regional Co', ?)", [userId, JSON.stringify(['TX'])]);
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.status).toBe(200);
      expect(res.body.regionalMatches).toHaveLength(1);
      expect(res.body.regionalMatches[0].carrierName).toBe('Regional Co');
    });

    test('regional matches include a geocoded centroid per tagged state', async () => {
      await pool.query("INSERT INTO carriers (user_id, company_name, operating_states) VALUES (?, 'Regional Co', ?)", [userId, JSON.stringify(['TX'])]);
      const res = await agent.post('/api/carrier-matches').send({
        originCity: DALLAS.city, originState: DALLAS.state, destCity: CHICAGO.city, destState: CHICAGO.state,
      });
      expect(res.body.regionalMatches[0].stateCentroids).toHaveLength(1);
      expect(res.body.regionalMatches[0].stateCentroids[0].state).toBe('TX');
      expect(typeof res.body.regionalMatches[0].stateCentroids[0].lat).toBe('number');
    });
  });

  describe('GET /?loadId=', () => {
    test('returns matches for an existing load\'s lane', async () => {
      await makeCarrierWithHistory();
      const [loadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, user_id, status) VALUES ('L1001', ?, ?, ?, ?, ?, ?, ?, 'active')",
        [DALLAS.city, DALLAS.state, DALLAS.lat, DALLAS.lng, CHICAGO.city, CHICAGO.state, userId]
      );

      const res = await agent.get(`/api/carrier-matches?loadId=${loadResult.insertId}`);
      expect(res.status).toBe(200);
      expect(res.body.laneMatches).toHaveLength(1);
      expect(res.body.queryOrigin).toEqual(expect.objectContaining({ lat: expect.closeTo(DALLAS.lat, 2), lng: expect.closeTo(DALLAS.lng, 2) }));
    });

    test('returns 404 for a load belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [loadResult] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L1001', 'Dallas', 'TX', 'Chicago', 'IL', ?, 'active')",
        [otherUser.insertId]
      );
      const res = await agent.get(`/api/carrier-matches?loadId=${loadResult.insertId}`);
      expect(res.status).toBe(404);
    });

    test('returns 400 when loadId is missing', async () => {
      const res = await agent.get('/api/carrier-matches');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /bulk', () => {
    test('returns a tier/count map keyed by load id', async () => {
      await makeCarrierWithHistory();
      const [matchedLoad] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, user_id, status) VALUES ('L1001', ?, ?, ?, ?, ?, ?, ?, 'active')",
        [DALLAS.city, DALLAS.state, DALLAS.lat, DALLAS.lng, CHICAGO.city, CHICAGO.state, userId]
      );
      const [unmatchedLoad] = await pool.query(
        "INSERT INTO loads (load_number, origin_city, origin_state, origin_lat, origin_lng, dest_city, dest_state, user_id, status) VALUES ('L1002', 'Miami', 'FL', 25.7617, -80.1918, 'Seattle', 'WA', ?, 'active')",
        [userId]
      );

      const res = await agent.post('/api/carrier-matches/bulk').send({ loadIds: [matchedLoad.insertId, unmatchedLoad.insertId] });
      expect(res.status).toBe(200);
      expect(res.body[matchedLoad.insertId]).toEqual({ tier: 'perfect', count: 1 });
      expect(res.body[unmatchedLoad.insertId]).toBeUndefined();
    });

    test('returns 400 when loadIds is missing or empty', async () => {
      const res1 = await agent.post('/api/carrier-matches/bulk').send({});
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/carrier-matches/bulk').send({ loadIds: [] });
      expect(res2.status).toBe(400);
    });
  });
});
