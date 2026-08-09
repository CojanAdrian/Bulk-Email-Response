const { createWsHub } = require('../../src/lib/wsHub');

function fakeSocket() {
  return { readyState: 1, OPEN: 1, send: jest.fn() };
}

describe('wsHub', () => {
  test('emitToUser sends the event to every socket registered for that user', () => {
    const hub = createWsHub();
    const wsA = fakeSocket();
    const wsB = fakeSocket();
    hub.registerConnection(1, wsA);
    hub.registerConnection(1, wsB);

    hub.emitToUser(1, 'load:changed', { loadId: 42 });

    const expected = JSON.stringify({ event: 'load:changed', payload: { loadId: 42 } });
    expect(wsA.send).toHaveBeenCalledWith(expected);
    expect(wsB.send).toHaveBeenCalledWith(expected);
  });

  test('emitToUser does not send to sockets registered for a different user', () => {
    const hub = createWsHub();
    const wsA = fakeSocket();
    const wsB = fakeSocket();
    hub.registerConnection(1, wsA);
    hub.registerConnection(2, wsB);

    hub.emitToUser(1, 'load:changed', {});

    expect(wsA.send).toHaveBeenCalled();
    expect(wsB.send).not.toHaveBeenCalled();
  });

  test('emitToUser is a no-op when the user has no registered connections', () => {
    const hub = createWsHub();
    expect(() => hub.emitToUser(999, 'load:changed', {})).not.toThrow();
  });

  test('emitToUser skips sockets that are not open', () => {
    const hub = createWsHub();
    const closedWs = { readyState: 3, OPEN: 1, send: jest.fn() };
    hub.registerConnection(1, closedWs);

    hub.emitToUser(1, 'load:changed', {});

    expect(closedWs.send).not.toHaveBeenCalled();
  });

  test('unregisterConnection removes the socket so it no longer receives emits', () => {
    const hub = createWsHub();
    const ws = fakeSocket();
    hub.registerConnection(1, ws);
    hub.unregisterConnection(1, ws);

    hub.emitToUser(1, 'load:changed', {});

    expect(ws.send).not.toHaveBeenCalled();
  });

  test('unregisterConnection is a no-op when the user was never registered', () => {
    const hub = createWsHub();
    const ws = fakeSocket();
    expect(() => hub.unregisterConnection(1, ws)).not.toThrow();
  });

  test('a user can have multiple connections and removing one leaves the others intact', () => {
    const hub = createWsHub();
    const wsA = fakeSocket();
    const wsB = fakeSocket();
    hub.registerConnection(1, wsA);
    hub.registerConnection(1, wsB);
    hub.unregisterConnection(1, wsA);

    hub.emitToUser(1, 'load:changed', {});

    expect(wsA.send).not.toHaveBeenCalled();
    expect(wsB.send).toHaveBeenCalled();
  });
});
