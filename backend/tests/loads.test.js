require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

describe('loads routes', () => {
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
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')",
      ['testuser', passwordHash]
    );
    userId = result.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/loads');
    expect(res.status).toBe(401);
  });

  test('lists only the current user\'s own loads', async () => {
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['L1001', 'Dallas', 'TX', 'Chicago', 'IL', userId]
    );
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)',
      ['L9999', 'Someone Elses', otherUser.insertId]
    );

    const res = await agent.get('/api/loads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].load_number).toBe('L1001');
  });

  test('filters loads by status within the user\'s own loads', async () => {
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, status, user_id) VALUES (?, ?, ?, ?)',
      ['L1001', 'Dallas', 'active', userId]
    );
    await pool.query(
      'INSERT INTO loads (load_number, origin_city, status, user_id) VALUES (?, ?, ?, ?)',
      ['L1002', 'Atlanta', 'booked', userId]
    );
    const res = await agent.get('/api/loads?status=active');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].load_number).toBe('L1001');
  });

  test('an admin sees loads from every user', async () => {
    const passwordHash = await bcrypt.hash('adminpw', 10);
    const [adminUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });

    await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L2002', 'Atlanta', adminUser.insertId]);

    const res = await adminAgent.get('/api/loads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('gets a single load owned by the current user', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.get(`/api/loads/${result.insertId}`);
    expect(res.status).toBe(200);
    expect(res.body.load_number).toBe('L1001');
  });

  test('returns 404 for a load owned by a different user', async () => {
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

    const res = await agent.get(`/api/loads/${result.insertId}`);
    expect(res.status).toBe(404);
  });

  test('an admin can get any user\'s load by id', async () => {
    const passwordHash = await bcrypt.hash('adminpw', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });

    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await adminAgent.get(`/api/loads/${result.insertId}`);
    expect(res.status).toBe(200);
    expect(res.body.load_number).toBe('L1001');
  });

  test('returns 404 for an unknown load id', async () => {
    const res = await agent.get('/api/loads/99999');
    expect(res.status).toBe(404);
  });

  test('PATCH updates target_pay and status on an owned load', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay, user_id) VALUES (?, ?, ?, ?)', ['L1001', 'Dallas', 1500, userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ target_pay: 1700, status: 'booked' });
    expect(res.status).toBe(200);
    expect(Number(res.body.target_pay)).toBe(1700);
    expect(res.body.status).toBe('booked');
  });

  test('PATCH returns 404 for a load owned by a different user', async () => {
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ target_pay: 1700 });
    expect(res.status).toBe(404);
  });

  test('an admin can PATCH any user\'s load', async () => {
    const passwordHash = await bcrypt.hash('adminpw', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });

    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay, user_id) VALUES (?, ?, ?, ?)', ['L1001', 'Dallas', 1500, userId]);
    const res = await adminAgent.patch(`/api/loads/${result.insertId}`).send({ target_pay: 1700, status: 'booked' });
    expect(res.status).toBe(200);
    expect(Number(res.body.target_pay)).toBe(1700);
    expect(res.body.status).toBe('booked');
  });

  test('PATCH with no valid fields returns 400', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    // load_number isn't editable via PATCH -- see the "ignores disallowed fields" test below.
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ load_number: 'CHANGED' });
    expect(res.status).toBe(400);
  });

  test('PATCH ignores disallowed fields but still applies allowed ones', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay, user_id) VALUES (?, ?, ?, ?)', ['L1001', 'Dallas', 1500, userId]);
    // load_number is deliberately not editable via PATCH (it's the upload/matching key).
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ load_number: 'CHANGED', target_pay: 2000 });
    expect(res.status).toBe(200);
    expect(Number(res.body.target_pay)).toBe(2000);
    expect(res.body.load_number).toBe('L1001');
  });

  test('PATCH can edit the full set of load fields, not just rate and status', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({
      origin_city: 'Fort Worth', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      equipment: 'Reefer', weight: '42000', stops: 1, commodity: 'Produce', temperature: '34F',
      comment: 'Call on arrival',
    });
    expect(res.status).toBe(200);
    expect(res.body.origin_city).toBe('Fort Worth');
    expect(res.body.dest_city).toBe('Chicago');
    expect(res.body.equipment).toBe('Reefer');
    expect(res.body.commodity).toBe('Produce');
    expect(res.body.comment).toBe('Call on arrival');
  });

  test('PATCH accepts "covered" as a status value', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ status: 'covered' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('covered');
  });

  test('PATCH can set a custom_reply_body', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({
      custom_reply_body: 'PU: DALLAS, TX\n2nd PU: FORT WORTH, TX\nDEL: CHICAGO, IL\nRate: $1,500',
    });
    expect(res.status).toBe(200);
    expect(res.body.custom_reply_body).toBe('PU: DALLAS, TX\n2nd PU: FORT WORTH, TX\nDEL: CHICAGO, IL\nRate: $1,500');
  });

  test('PATCH can clear a custom_reply_body by setting it to null', async () => {
    const [result] = await pool.query(
      'INSERT INTO loads (load_number, origin_city, user_id, custom_reply_body) VALUES (?, ?, ?, ?)',
      ['L1001', 'Dallas', userId, 'Some custom text']
    );
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ custom_reply_body: null });
    expect(res.status).toBe(200);
    expect(res.body.custom_reply_body).toBeNull();
  });

  test('PATCH can set include_rate to false and extra_stops as a JSON array', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({
      include_rate: false,
      extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '2026-08-12 13:00:00' }],
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.include_rate)).toBe(0);
    expect(res.body.extra_stops).toEqual([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '2026-08-12 13:00:00' }]);
  });

  test('PATCH can clear extra_stops by setting it to an empty array', async () => {
    const [result] = await pool.query(
      'INSERT INTO loads (load_number, origin_city, user_id, extra_stops) VALUES (?, ?, ?, ?)',
      ['L1001', 'Dallas', userId, JSON.stringify([{ type: 'pickup', city: 'X', state: 'TX', datetime: null }])]
    );
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ extra_stops: [] });
    expect(res.status).toBe(200);
    expect(res.body.extra_stops).toEqual([]);
  });

  test('a newly inserted load defaults to include_rate = 1', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.get(`/api/loads/${result.insertId}`);
    expect(Number(res.body.include_rate)).toBe(1);
  });

  test('PATCH can set early_del', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.patch(`/api/loads/${result.insertId}`).send({ early_del: '2026-08-14 09:00:00' });
    expect(res.status).toBe(200);
    expect(new Date(res.body.early_del).toISOString()).toBe(new Date('2026-08-14 09:00:00').toISOString());
  });

  test('bulk-status rejects "expired" now that it is no longer a valid status', async () => {
    const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
    const res = await agent.post('/api/loads/bulk-status').send({ ids: [result.insertId], status: 'expired' });
    expect(res.status).toBe(400);
  });

  describe('GET /:id/preview-reply', () => {
    test('rejects unauthenticated requests', async () => {
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const res = await request(app).get(`/api/loads/${result.insertId}/preview-reply`);
      expect(res.status).toBe(401);
    });

    test('returns the auto-composed reply for an owned load', async () => {
      const [result] = await pool.query(
        'INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, target_pay, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['L1001', 'Dallas', 'TX', 'Chicago', 'IL', 1500, userId]
      );
      const res = await agent.get(`/api/loads/${result.insertId}/preview-reply`);
      expect(res.status).toBe(200);
      expect(res.body.body).toContain('PU: DALLAS, TX');
      expect(res.body.body).toContain('DEL: CHICAGO, IL');
      expect(res.body.body).toContain('Rate: $1,500');
    });

    test('returns 404 for a load owned by a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

      const res = await agent.get(`/api/loads/${result.insertId}/preview-reply`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    test('rejects unauthenticated requests', async () => {
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const res = await request(app).delete(`/api/loads/${result.insertId}`);
      expect(res.status).toBe(401);
    });

    test('deletes an owned load', async () => {
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const res = await agent.delete(`/api/loads/${result.insertId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const [rows] = await pool.query('SELECT id FROM loads WHERE id = ?', [result.insertId]);
      expect(rows).toHaveLength(0);
    });

    test('returns 404 for a load owned by a different user, and does not delete it', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

      const res = await agent.delete(`/api/loads/${result.insertId}`);
      expect(res.status).toBe(404);

      const [rows] = await pool.query('SELECT id FROM loads WHERE id = ?', [result.insertId]);
      expect(rows).toHaveLength(1);
    });

    test('returns 404 for an unknown load id', async () => {
      const res = await agent.delete('/api/loads/99999');
      expect(res.status).toBe(404);
    });

    test('an admin can delete any user\'s load', async () => {
      const passwordHash = await bcrypt.hash('adminpw', 10);
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
      const adminAgent = request.agent(app);
      await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });

      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const res = await adminAgent.delete(`/api/loads/${result.insertId}`);
      expect(res.status).toBe(200);

      const [rows] = await pool.query('SELECT id FROM loads WHERE id = ?', [result.insertId]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('POST /bulk-delete', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/loads/bulk-delete').send({ ids: [1] });
      expect(res.status).toBe(401);
    });

    test('deletes multiple owned loads in one request', async () => {
      const [l1] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [l2] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1002', 'Atlanta', userId]);

      const res = await agent.post('/api/loads/bulk-delete').send({ ids: [l1.insertId, l2.insertId] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 2 });

      const list = await agent.get('/api/loads');
      expect(list.body).toHaveLength(0);
    });

    test('does not delete a load owned by a different user, even if its id is included', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [mine] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [theirs] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

      const res = await agent.post('/api/loads/bulk-delete').send({ ids: [mine.insertId, theirs.insertId] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 1 });

      const [rows] = await pool.query('SELECT id FROM loads WHERE id = ?', [theirs.insertId]);
      expect(rows).toHaveLength(1);
    });

    test('an admin can bulk-delete loads across different users', async () => {
      const passwordHash = await bcrypt.hash('adminpw', 10);
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
      const adminAgent = request.agent(app);
      await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });
      const [mine] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);

      const res = await adminAgent.post('/api/loads/bulk-delete').send({ ids: [mine.insertId] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 1 });
    });

    test('returns 400 when ids is missing or empty', async () => {
      const res1 = await agent.post('/api/loads/bulk-delete').send({});
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/loads/bulk-delete').send({ ids: [] });
      expect(res2.status).toBe(400);
    });
  });

  describe('POST /bulk-status', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/loads/bulk-status').send({ ids: [1], status: 'booked' });
      expect(res.status).toBe(401);
    });

    test('updates the status of multiple owned loads in one request', async () => {
      const [l1] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [l2] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1002', 'Atlanta', userId]);

      const res = await agent.post('/api/loads/bulk-status').send({ ids: [l1.insertId, l2.insertId], status: 'covered' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });

      const list = await agent.get('/api/loads');
      expect(list.body.every((l) => l.status === 'covered')).toBe(true);
    });

    test('does not update a load owned by a different user, even if its id is included', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [mine] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [theirs] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

      const res = await agent.post('/api/loads/bulk-status').send({ ids: [mine.insertId, theirs.insertId], status: 'booked' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });

      const [rows] = await pool.query('SELECT status FROM loads WHERE id = ?', [theirs.insertId]);
      expect(rows[0].status).toBe('active');
    });

    test('returns 400 for an invalid status value', async () => {
      const [l1] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const res = await agent.post('/api/loads/bulk-status').send({ ids: [l1.insertId], status: 'bogus' });
      expect(res.status).toBe(400);
    });

    test('returns 400 when ids is missing or empty', async () => {
      const res1 = await agent.post('/api/loads/bulk-status').send({ status: 'booked' });
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/loads/bulk-status').send({ ids: [], status: 'booked' });
      expect(res2.status).toBe(400);
    });
  });

  describe('POST /bulk-include-rate', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/loads/bulk-include-rate').send({ ids: [1], includeRate: false });
      expect(res.status).toBe(401);
    });

    test('updates include_rate for multiple owned loads in one request', async () => {
      const [l1] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [l2] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1002', 'Atlanta', userId]);

      const res = await agent.post('/api/loads/bulk-include-rate').send({ ids: [l1.insertId, l2.insertId], includeRate: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });

      const list = await agent.get('/api/loads');
      expect(list.body.every((l) => Number(l.include_rate) === 0)).toBe(true);
    });

    test('does not update a load owned by a different user, even if its id is included', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [mine] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      const [theirs] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L9999', 'Someone Elses', otherUser.insertId]);

      const res = await agent.post('/api/loads/bulk-include-rate').send({ ids: [mine.insertId, theirs.insertId], includeRate: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });

      const [rows] = await pool.query('SELECT include_rate FROM loads WHERE id = ?', [theirs.insertId]);
      expect(Number(rows[0].include_rate)).toBe(1);
    });

    test('an admin can bulk-set include_rate across different users', async () => {
      const passwordHash = await bcrypt.hash('adminpw', 10);
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
      const adminAgent = request.agent(app);
      await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });
      const [mine] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);

      const res = await adminAgent.post('/api/loads/bulk-include-rate').send({ ids: [mine.insertId], includeRate: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });
    });

    test('returns 400 when ids is missing or empty', async () => {
      const res1 = await agent.post('/api/loads/bulk-include-rate').send({ includeRate: true });
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/loads/bulk-include-rate').send({ ids: [], includeRate: true });
      expect(res2.status).toBe(400);
    });
  });

  test('an admin\'s own upload is tagged with the admin\'s own user_id, not shared/ownerless', async () => {
    const passwordHash = await bcrypt.hash('adminpw', 10);
    const [adminUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('admintest', ?, 'admin')", [passwordHash]);
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admintest', password: 'adminpw' });

    await adminAgent.post('/api/loads/upload').send({
      loads: [{ load_number: 'ADMINLOAD', origin_city: 'Dallas', target_pay: 1500 }],
    });

    const [rows] = await pool.query('SELECT user_id FROM loads WHERE load_number = ?', ['ADMINLOAD']);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(adminUser.insertId);

    // A regular user must not see the admin's load in their own list.
    const mine = await agent.get('/api/loads');
    expect(mine.body).toHaveLength(0);
  });

  test('uploading a load with only load_number set succeeds instead of producing invalid SQL', async () => {
    const res = await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'BARE1' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 1, updated: 0 });

    const reupload = await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'BARE1' }],
    });
    expect(reupload.status).toBe(200);
    expect(reupload.body).toEqual({ inserted: 0, updated: 1 });

    const list = await agent.get('/api/loads');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].load_number).toBe('BARE1');
  });

  test('uploads a batch of loads, inserting new ones owned by the uploader', async () => {
    const res = await agent.post('/api/loads/upload').send({
      loads: [
        { load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', equipment: 'Reefer', target_pay: 1500 },
        { load_number: 'L1002', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Miami', dest_state: 'FL', equipment: 'Dry Van', target_pay: 900 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(2);

    const list = await agent.get('/api/loads');
    expect(list.body).toHaveLength(2);
  });

  test('two different users can each upload a load with the same load_number', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'SHARED1', origin_city: 'Dallas', target_pay: 1500 }],
    });

    const passwordHash = await bcrypt.hash('otherpw', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/login').send({ username: 'otheruser', password: 'otherpw' });
    const res = await otherAgent.post('/api/loads/upload').send({
      loads: [{ load_number: 'SHARED1', origin_city: 'Houston', target_pay: 2000 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);

    const mine = await agent.get('/api/loads');
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].origin_city).toBe('Dallas');

    const theirs = await otherAgent.get('/api/loads');
    expect(theirs.body).toHaveLength(1);
    expect(theirs.body[0].origin_city).toBe('Houston');
  });

  test('re-uploading an existing load_number for the same user updates it instead of duplicating', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1500 }],
    });
    const res = await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1800 }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 0, updated: 1 });

    const list = await agent.get('/api/loads');
    expect(list.body).toHaveLength(1);
    expect(Number(list.body[0].target_pay)).toBe(1800);
  });

  test('re-uploading a load does not change its status', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1500 }],
    });
    const list1 = await agent.get('/api/loads');
    await agent.patch(`/api/loads/${list1.body[0].id}`).send({ status: 'booked' });

    await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1800 }],
    });
    const list2 = await agent.get('/api/loads');
    expect(list2.body[0].status).toBe('booked');
  });

  test('a re-upload never changes the status of a load that is missing from the new file', async () => {
    await agent.post('/api/loads/upload').send({
      loads: [
        { load_number: 'STALE1', origin_city: 'Dallas', target_pay: 1500 },
        { load_number: 'FRESH1', origin_city: 'Atlanta', target_pay: 900 },
      ],
    });

    const res = await agent.post('/api/loads/upload').send({
      loads: [{ load_number: 'FRESH1', origin_city: 'Atlanta', target_pay: 950 }],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 0, updated: 1 });

    const list = await agent.get('/api/loads');
    const stale = list.body.find((l) => l.load_number === 'STALE1');
    const fresh = list.body.find((l) => l.load_number === 'FRESH1');
    expect(stale.status).toBe('active');
    expect(fresh.status).toBe('active');
  });

  test('upload with a non-array loads field returns 400', async () => {
    const res = await agent.post('/api/loads/upload').send({ loads: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'loads must be an array' });
  });

  test('LOAD_COLUMNS never includes status or user_id, so uploads can never set them directly', () => {
    const { LOAD_COLUMNS } = require('../src/routes/loads');
    expect(LOAD_COLUMNS).not.toContain('status');
    expect(LOAD_COLUMNS).not.toContain('user_id');
  });

  test('GET /api/loads returns 500 instead of crashing when the database is unavailable', async () => {
    const express = require('express');
    const { createLoadsRouter } = require('../src/routes/loads');
    const brokenPool = { query: () => Promise.reject(new Error('connection lost')) };
    const bareApp = express();
    bareApp.use((req, res, next) => {
      req.session = { userId: 1, role: 'user' };
      next();
    });
    bareApp.use('/api/loads', createLoadsRouter(brokenPool));
    bareApp.use((err, req, res, next) => {
      res.status(500).json({ error: 'Internal server error' });
    });
    const res = await request(bareApp).get('/api/loads');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  describe('wsHub emits', () => {
    let hubApp;
    let hubAgent;
    let wsHub;

    beforeEach(async () => {
      wsHub = { emitToUser: jest.fn() };
      hubApp = createApp(pool, wsHub);
      hubAgent = request.agent(hubApp);
      await hubAgent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    });

    test('PATCH emits load:changed to the owning user with the load id', async () => {
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, target_pay, user_id) VALUES (?, ?, ?, ?)', ['L1001', 'Dallas', 1500, userId]);
      await hubAgent.patch(`/api/loads/${result.insertId}`).send({ target_pay: 1700 });

      expect(wsHub.emitToUser).toHaveBeenCalledWith(userId, 'load:changed', { loadId: result.insertId });
    });

    test('upload emits load:changed to the uploading user', async () => {
      await hubAgent.post('/api/loads/upload').send({
        loads: [{ load_number: 'L1001', origin_city: 'Dallas', target_pay: 1500 }],
      });

      expect(wsHub.emitToUser).toHaveBeenCalledWith(userId, 'load:changed', {});
    });

    test('DELETE emits load:changed to the owning user with the load id', async () => {
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      await hubAgent.delete(`/api/loads/${result.insertId}`);

      expect(wsHub.emitToUser).toHaveBeenCalledWith(userId, 'load:changed', { loadId: result.insertId, deleted: true });
    });

    test('bulk-delete emits load:changed to the caller', async () => {
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      await hubAgent.post('/api/loads/bulk-delete').send({ ids: [result.insertId] });

      expect(wsHub.emitToUser).toHaveBeenCalledWith(userId, 'load:changed', {});
    });

    test('bulk-status emits load:changed to the caller', async () => {
      const [result] = await pool.query('INSERT INTO loads (load_number, origin_city, user_id) VALUES (?, ?, ?)', ['L1001', 'Dallas', userId]);
      await hubAgent.post('/api/loads/bulk-status').send({ ids: [result.insertId], status: 'booked' });

      expect(wsHub.emitToUser).toHaveBeenCalledWith(userId, 'load:changed', {});
    });
  });

  test('POST /api/loads/upload returns 500 instead of crashing when the database is unavailable', async () => {
    const express = require('express');
    const { createLoadsRouter } = require('../src/routes/loads');
    const brokenPool = { getConnection: () => Promise.reject(new Error('connection lost')) };
    const bareApp = express();
    bareApp.use(express.json());
    bareApp.use((req, res, next) => {
      req.session = { userId: 1, role: 'user' };
      next();
    });
    bareApp.use('/api/loads', createLoadsRouter(brokenPool));
    bareApp.use((err, req, res, next) => {
      res.status(500).json({ error: 'Internal server error' });
    });
    const res = await request(bareApp).post('/api/loads/upload').send({ loads: [{ load_number: 'L1' }] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  describe('POST /', () => {
    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/loads').send({ load_number: 'L1001' });
      expect(res.status).toBe(401);
    });

    test('creates a load with only load_number set, defaulting everything else', async () => {
      const res = await agent.post('/api/loads').send({ load_number: 'L1001' });
      expect(res.status).toBe(201);
      expect(res.body.load_number).toBe('L1001');
      expect(res.body.status).toBe('active');
      expect(Number(res.body.include_rate)).toBe(1);
      expect(res.body.target_pay).toBeNull();
      expect(res.body.comment).toBeNull();
    });

    test('creates a load with the full set of fields, including extra_stops and include_rate', async () => {
      const res = await agent.post('/api/loads').send({
        load_number: 'L2002', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
        equipment: 'V', weight: '42000', target_pay: 1500, comment: 'Call ahead', include_rate: false,
        extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }],
      });
      expect(res.status).toBe(201);
      expect(res.body.origin_city).toBe('Dallas');
      expect(Number(res.body.target_pay)).toBe(1500);
      expect(Number(res.body.include_rate)).toBe(0);
      expect(res.body.extra_stops).toEqual([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }]);
    });

    test('returns 400 when load_number is missing or blank', async () => {
      const res1 = await agent.post('/api/loads').send({});
      expect(res1.status).toBe(400);
      const res2 = await agent.post('/api/loads').send({ load_number: '   ' });
      expect(res2.status).toBe(400);
    });

    test('returns 409 when load_number already exists for this user', async () => {
      await agent.post('/api/loads').send({ load_number: 'DUPE1' });
      const res = await agent.post('/api/loads').send({ load_number: 'DUPE1' });
      expect(res.status).toBe(409);
    });

    test('two different users can each create a load with the same load_number', async () => {
      await agent.post('/api/loads').send({ load_number: 'SHARED1' });

      const passwordHash = await bcrypt.hash('otherpw', 10);
      await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const otherAgent = request.agent(app);
      await otherAgent.post('/api/auth/login').send({ username: 'otheruser', password: 'otherpw' });

      const res = await otherAgent.post('/api/loads').send({ load_number: 'SHARED1' });
      expect(res.status).toBe(201);
    });

    test('emits load:changed to the creating user', async () => {
      const wsHub = { emitToUser: jest.fn() };
      const hubApp = createApp(pool, wsHub);
      const hubAgent = request.agent(hubApp);
      await hubAgent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });

      const res = await hubAgent.post('/api/loads').send({ load_number: 'L1001' });
      expect(wsHub.emitToUser).toHaveBeenCalledWith(userId, 'load:changed', { loadId: res.body.id });
    });
  });
});
