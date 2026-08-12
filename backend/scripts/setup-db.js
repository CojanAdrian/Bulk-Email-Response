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

  const [googleIdCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'google_id'`,
    [databaseName]
  );
  if (googleIdCol[0].count === 0) {
    await conn.query(`ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL UNIQUE`);
  }

  // Google accounts have no password (password_hash must be nullable) and
  // sign-up defaults username to the full Gmail address, which the original
  // VARCHAR(50) is too short to reliably hold.
  const [usersColInfo] = await conn.query(
    `SELECT COLUMN_NAME, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('password_hash', 'username')`,
    [databaseName]
  );
  const passwordHashCol = usersColInfo.find((c) => c.COLUMN_NAME === 'password_hash');
  if (passwordHashCol && passwordHashCol.IS_NULLABLE === 'NO') {
    await conn.query(`ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL`);
  }
  const usernameCol = usersColInfo.find((c) => c.COLUMN_NAME === 'username');
  if (usernameCol && usernameCol.CHARACTER_MAXIMUM_LENGTH < 255) {
    await conn.query(`ALTER TABLE users MODIFY COLUMN username VARCHAR(255) NOT NULL`);
  }

  const [autoSendCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_accounts' AND COLUMN_NAME = 'auto_send_enabled'`,
    [databaseName]
  );
  if (autoSendCol[0].count === 0) {
    await conn.query(`ALTER TABLE email_accounts ADD COLUMN auto_send_enabled TINYINT(1) NOT NULL DEFAULT 0`);
  }

  const [userIdCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'user_id'`,
    [databaseName]
  );
  if (userIdCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN user_id INT NULL`);
  }

  const [rawEquipmentCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'raw_equipment'`,
    [databaseName]
  );
  if (rawEquipmentCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN raw_equipment VARCHAR(20) NULL`);
  }

  const [statusCol] = await conn.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'status'`,
    [databaseName]
  );
  if (statusCol[0] && !statusCol[0].COLUMN_TYPE.includes("'covered'")) {
    await conn.query(`ALTER TABLE loads MODIFY COLUMN status ENUM('active','booked','covered','expired') NOT NULL DEFAULT 'active'`);
  }

  const [customReplyCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'custom_reply_body'`,
    [databaseName]
  );
  if (customReplyCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN custom_reply_body TEXT NULL`);
  }

  const [includeRateCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'include_rate'`,
    [databaseName]
  );
  if (includeRateCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN include_rate TINYINT(1) NOT NULL DEFAULT 1`);
  }

  const [extraStopsCol] = await conn.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loads' AND COLUMN_NAME = 'extra_stops'`,
    [databaseName]
  );
  if (extraStopsCol[0].count === 0) {
    await conn.query(`ALTER TABLE loads ADD COLUMN extra_stops JSON NULL`);
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

  const [orphanedRows] = await conn.query('SELECT COUNT(*) AS count FROM loads WHERE user_id IS NULL');
  if (orphanedRows[0].count > 0) {
    console.warn(
      `Warning: ${orphanedRows[0].count} load(s) in "${databaseName}" have no owner (user_id IS NULL) ` +
        `after migration — they will be invisible to non-admin users. This usually means ADMIN_USERNAME ` +
        `doesn't match any existing user; check your .env.`
    );
  }

  const replyColumns = [
    ['reply_status', `ALTER TABLE email_inquiries ADD COLUMN reply_status ENUM('none','pending_review','auto_sent','sent','rejected') NOT NULL DEFAULT 'none'`],
    ['reply_body', `ALTER TABLE email_inquiries ADD COLUMN reply_body TEXT NULL`],
    ['reply_sent_at', `ALTER TABLE email_inquiries ADD COLUMN reply_sent_at DATETIME NULL`],
    ['gmail_thread_id', `ALTER TABLE email_inquiries ADD COLUMN gmail_thread_id VARCHAR(255) NULL`],
    ['gmail_in_reply_to', `ALTER TABLE email_inquiries ADD COLUMN gmail_in_reply_to VARCHAR(255) NULL`],
    ['ref_mismatch', `ALTER TABLE email_inquiries ADD COLUMN ref_mismatch TINYINT(1) NOT NULL DEFAULT 0`],
  ];
  for (const [columnName, alterSql] of replyColumns) {
    const [col] = await conn.query(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_inquiries' AND COLUMN_NAME = ?`,
      [databaseName, columnName]
    );
    if (col[0].count === 0) {
      await conn.query(alterSql);
    }
  }

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
