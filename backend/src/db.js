const mysql = require('mysql2/promise');

function createPool(databaseName) {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

module.exports = { createPool };
