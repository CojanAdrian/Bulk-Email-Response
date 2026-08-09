function createWsHub() {
  const connectionsByUser = new Map(); // userId -> Set<WebSocket>

  function registerConnection(userId, ws) {
    if (!connectionsByUser.has(userId)) connectionsByUser.set(userId, new Set());
    connectionsByUser.get(userId).add(ws);
  }

  function unregisterConnection(userId, ws) {
    const set = connectionsByUser.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) connectionsByUser.delete(userId);
  }

  function emitToUser(userId, event, payload) {
    const set = connectionsByUser.get(userId);
    if (!set) return;
    const message = JSON.stringify({ event, payload });
    set.forEach((ws) => {
      if (ws.readyState === ws.OPEN) ws.send(message);
    });
  }

  return { registerConnection, unregisterConnection, emitToUser };
}

module.exports = { createWsHub };
