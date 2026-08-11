require('dotenv').config();

function assertRequiredEnvVars() {
  const required = ['SESSION_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'FRONTEND_ORIGIN'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

assertRequiredEnvVars();

const { createHttpServer } = require('./createHttpServer');
const { createPool } = require('./db');
const { createWsHub } = require('./lib/wsHub');
const { pollAllAccounts } = require('./lib/emailPoller');

const pool = createPool(process.env.DB_NAME);
const wsHub = createWsHub();
const server = createHttpServer(pool, wsHub, process.env.SESSION_SECRET);
// APPLICATION_PORT is Hyperlift's own convention (it defaults that variable
// to 8080 and routes to whatever it's set to); PORT is the more common
// convention elsewhere. Support both so the same image works unmodified on
// either.
const port = process.env.PORT || process.env.APPLICATION_PORT || 4000;

// Configurable so this can be tuned without a code change; defaults to 30s
// (down from an original 2 minutes) -- a single connected account's poll is
// two cheap Gmail API calls (list + get-per-new-message), nowhere near
// Gmail's per-user quota even at this cadence.
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 30 * 1000;
setInterval(() => {
  pollAllAccounts(pool, wsHub).catch((err) => console.error('Email poll cycle failed:', err));
}, POLL_INTERVAL_MS);

server.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
