const { createPool } = require('../src/db');

function createTestPool() {
  return createPool(process.env.DB_NAME_TEST);
}

async function resetTables(pool) {
  await pool.query('DELETE FROM email_inquiries');
  await pool.query('DELETE FROM email_accounts');
  await pool.query('DELETE FROM loads');
  await pool.query('DELETE FROM users');
}

module.exports = { createTestPool, resetTables };
