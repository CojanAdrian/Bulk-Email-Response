require('dotenv').config();
const { createMemoryStore, createMySQLSessionStore } = require('../../src/lib/sessionStore');
const { createTestPool } = require('../setupTestDb');

describe('createMemoryStore', () => {
  test('round-trips a session through set/get', (done) => {
    const store = createMemoryStore();
    store.set('session-1', { userId: 1 }, (err) => {
      expect(err).toBeFalsy();
      store.get('session-1', (err2, session) => {
        expect(err2).toBeFalsy();
        expect(session).toEqual({ userId: 1 });
        done();
      });
    });
  });
});

describe('createMySQLSessionStore', () => {
  let pool;
  let store;

  beforeAll(() => {
    pool = createTestPool();
    store = createMySQLSessionStore(pool);
  });

  afterAll(async () => {
    await store.close();
    await pool.end();
  });

  test('round-trips a session through set/get, backed by a real MySQL table', async () => {
    await store.set('session-mysql-1', { userId: 42 });
    const session = await store.get('session-mysql-1');
    expect(session).toEqual({ userId: 42 });
  });

  test('a second store instance backed by the same pool sees a session set by the first', async () => {
    await store.set('session-mysql-2', { userId: 7 });
    const secondStore = createMySQLSessionStore(pool);
    const session = await secondStore.get('session-mysql-2');
    expect(session).toEqual({ userId: 7 });
    await secondStore.close();
  });
});
