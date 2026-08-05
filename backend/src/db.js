const mysql = require('mysql2/promise');

function createPool(databaseName) {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
  });

  pool.on('error', (err) => {
    console.error('MySQL pool error:', err);
  });

  return pool;
}

module.exports = { createPool };
