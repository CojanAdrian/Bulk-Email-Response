require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const WebSocket = require('ws');
const { createHttpServer } = require('../src/createHttpServer');
const { createWsHub } = require('../src/lib/wsHub');
const { createTestPool, resetTables } = require('./setupTestDb');

function waitForEvent(emitter, event) {
  return new Promise((resolve) => emitter.once(event, resolve));
}

describe('createHttpServer WebSocket upgrade', () => {
  let pool;
  let wsHub;
  let server;
  let port;

  beforeAll(async () => {
    pool = createTestPool();
    wsHub = createWsHub();
    server = createHttpServer(pool, wsHub, process.env.SESSION_SECRET);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
  });

  afterAll(async () => {
    await server.sessionStore.close();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  beforeEach(async () => {
    await resetTables(pool);
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
  });

  async function loginAndGetCookie() {
    const res = await request(server).post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    const setCookie = res.headers['set-cookie'][0];
    return setCookie.split(';')[0];
  }

  async function getUserId() {
    const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', ['testuser']);
    return rows[0].id;
  }

  test('accepts a WebSocket connection with a valid session cookie', async () => {
    const cookie = await loginAndGetCookie();
    const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: { Cookie: cookie } });
    await waitForEvent(ws, 'open');
    ws.close();
  });

  test('rejects a WebSocket connection with no session cookie', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.on('error', () => {}); // the server's 401 response surfaces as a client error, not just a close
    await waitForEvent(ws, 'close');
  });

  test('rejects a WebSocket connection with an invalid session cookie', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: { Cookie: 'connect.sid=s:garbage.invalidsignature' } });
    ws.on('error', () => {});
    await waitForEvent(ws, 'close');
  });

  test('a message emitted via wsHub.emitToUser for that session reaches the connected client', async () => {
    const cookie = await loginAndGetCookie();
    const userId = await getUserId();
    const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: { Cookie: cookie } });
    await waitForEvent(ws, 'open');

    const messagePromise = waitForEvent(ws, 'message');
    wsHub.emitToUser(userId, 'load:changed', { loadId: 7 });
    const raw = await messagePromise;

    expect(JSON.parse(raw.toString())).toEqual({ event: 'load:changed', payload: { loadId: 7 } });
    ws.close();
  });
});

describe('session persistence across a backend restart', () => {
  let pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetTables(pool);
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
  });

  test('a session created on one server instance is still valid on a new instance backed by the same database', async () => {
    // Simulates a backend restart: two separate createHttpServer() calls
    // (each builds its own MySQLStore) sharing the same underlying MySQL
    // sessions table via the same pool's database.
    const wsHub1 = createWsHub();
    const server1 = createHttpServer(pool, wsHub1, process.env.SESSION_SECRET);
    await new Promise((resolve) => server1.listen(0, resolve));

    const loginRes = await request(server1).post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

    await server1.sessionStore.close();
    await new Promise((resolve) => server1.close(resolve));

    const wsHub2 = createWsHub();
    const server2 = createHttpServer(pool, wsHub2, process.env.SESSION_SECRET);
    await new Promise((resolve) => server2.listen(0, resolve));

    const res = await request(server2).get('/api/loads').set('Cookie', cookie);
    expect(res.status).toBe(200);

    await server2.sessionStore.close();
    await new Promise((resolve) => server2.close(resolve));
  });
});
