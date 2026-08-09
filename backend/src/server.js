require('dotenv').config();

function assertRequiredEnvVars() {
  const required = ['SESSION_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'FRONTEND_ORIGIN'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

assertRequiredEnvVars();

const { createApp } = require('./app');
const { createPool } = require('./db');
const { pollAllAccounts } = require('./lib/emailPoller');

const pool = createPool(process.env.DB_NAME);
const app = createApp(pool);
const port = process.env.PORT || 4000;

const POLL_INTERVAL_MS = 2 * 60 * 1000;
setInterval(() => {
  pollAllAccounts(pool).catch((err) => console.error('Email poll cycle failed:', err));
}, POLL_INTERVAL_MS);

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
