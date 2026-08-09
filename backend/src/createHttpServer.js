const http = require('http');
const { WebSocketServer } = require('ws');
const { createApp } = require('./app');
const { authenticateUpgrade } = require('./lib/wsAuth');

function createHttpServer(pool, wsHub, sessionSecret) {
  const app = createApp(pool, wsHub);
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    const userId = await authenticateUpgrade(req, sessionSecret);
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

  return server;
}

module.exports = { createHttpServer };
