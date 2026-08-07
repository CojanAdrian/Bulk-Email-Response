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

async function migrateSchema(databaseName) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
  });

  const [roleCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
    [databaseName]
  );
  if (roleCol[0].count === 0) {
    await conn.query(`ALTER TABLE users ADD COLUMN role ENUM('admin','user') NOT NULL DEFAULT 'user'`);
  }

  const [userIdCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'user_id'`,
    [databaseName]
  );
  if (userIdCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN user_id INT NULL`);
  }

  const [indexRows] = await conn.query(`SHOW INDEX FROM loads WHERE Key_name != 'PRIMARY'`);
  const indexMap = {};
  indexRows.forEach((row) => {
    if (!indexMap[row.Key_name]) indexMap[row.Key_name] = { unique: row.Non_unique === 0, columns: [] };
    indexMap[row.Key_name].columns[row.Seq_in_index - 1] = row.Column_name;
  });

  for (const [name, info] of Object.entries(indexMap)) {
    if (info.unique && info.columns.length === 1 && info.columns[0] === 'load_number') {
      await conn.query(`ALTER TABLE loads DROP INDEX \`${name}\``);
      delete indexMap[name];
    }
  }

  const hasComposite = Object.values(indexMap).some(
    (info) => info.unique && info.columns.join(',') === 'user_id,load_number'
  );
  if (!hasComposite) {
    await conn.query(`ALTER TABLE loads ADD UNIQUE KEY uniq_user_load_number (user_id, load_number)`);
  }

  await conn.query(
    `UPDATE loads l JOIN users u ON u.username = ? SET l.user_id = u.id WHERE l.user_id IS NULL`,
    [process.env.ADMIN_USERNAME]
  );
  await conn.query(`UPDATE users SET role = 'admin' WHERE username = ?`, [process.env.ADMIN_USERNAME]);

  await conn.end();
}

function assertRequiredEnvVars() {
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'DB_NAME_TEST', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

async function main() {
  assertRequiredEnvVars();
  await setupDatabase(process.env.DB_NAME);
  await setupDatabase(process.env.DB_NAME_TEST);
  await ensureAdminUser();
  await migrateSchema(process.env.DB_NAME);
  await migrateSchema(process.env.DB_NAME_TEST);
  console.log('Database setup complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
