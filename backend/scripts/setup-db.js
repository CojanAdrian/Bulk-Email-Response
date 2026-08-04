require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

async function setupDatabase(databaseName) {
  const rootConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  await rootConn.end();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    multipleStatements: true,
  });
  await conn.query(schema);
  await conn.end();
}

async function ensureAdminUser() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [existing] = await conn.query('SELECT id FROM users WHERE username = ?', [process.env.ADMIN_USERNAME]);
  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await conn.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [process.env.ADMIN_USERNAME, passwordHash]);
    console.log(`Created admin user "${process.env.ADMIN_USERNAME}"`);
  } else {
    console.log(`Admin user "${process.env.ADMIN_USERNAME}" already exists, skipping`);
  }
  await conn.end();
}

async function main() {
  await setupDatabase(process.env.DB_NAME);
  await setupDatabase(process.env.DB_NAME_TEST);
  await ensureAdminUser();
  console.log('Database setup complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
