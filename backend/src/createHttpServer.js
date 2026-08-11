const http = require('http');
const { WebSocketServer } = require('ws');
const { createApp } = require('./app');
const { authenticateUpgrade } = require('./lib/wsAuth');
const { createMySQLSessionStore } = require('./lib/sessionStore');

function createHttpServer(pool, wsHub, sessionSecret) {
  // One store instance shared between the HTTP session middleware and the
  // WebSocket upgrade handler below, so a session created by a login request
  // is visible to a WS connection authenticating with that same cookie.
  const store = createMySQLSessionStore(pool);
  const app = createApp(pool, wsHub, store);
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    const userId = await authenticateUpgrade(req, sessionSecret, store);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wsHub.registerConnection(userId, ws);
      ws.on('close', () => wsHub.unregisterConnection(userId, ws));
      wss.emit('connection', ws, req);
    });
  });

  // Exposed so callers (tests, graceful-shutdown code) can stop the store's
  // internal expired-session cleanup interval -- MySQLStore keeps that
  // running for the life of the process by design (it's a long-lived
  // server), which is exactly why a short-lived test run needs to close it
  // explicitly instead of just closing the HTTP server.
  server.sessionStore = store;

  return server;
}

module.exports = { createHttpServer };
