const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

// Used where no real database is available (or matters) -- most of the
// route-level test suites, which don't test session persistence itself.
function createMemoryStore() {
  return new session.MemoryStore();
}

// Backs sessions with a MySQL table (auto-created on first use) via the
// app's own connection pool, so a login survives a backend restart --
// unlike MemoryStore, which forgets every session the moment the process
// restarts. express-mysql-session expects a callback-style mysql2 pool;
// our app pool is created with mysql2/promise, whose pool object wraps the
// underlying callback pool at `.pool` -- pass that through instead of the
// promise-wrapped pool, or the store hangs waiting on a callback that
// never fires.
function createMySQLSessionStore(pool) {
  return new MySQLStore({}, pool.pool || pool);
}

module.exports = { createMemoryStore, createMySQLSessionStore };
