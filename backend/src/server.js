require('dotenv').config();

function assertRequiredEnvVars() {
  const required = ['SESSION_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

assertRequiredEnvVars();

const { createApp } = require('./app');
const { createPool } = require('./db');

const pool = createPool(process.env.DB_NAME);
const app = createApp(pool);
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
