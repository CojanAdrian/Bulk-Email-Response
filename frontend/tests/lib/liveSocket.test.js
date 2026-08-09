import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({});
  }

  _open() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen({});
  }

  _message(data) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }

  _closeFromServer() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({});
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

async function freshLiveSocket() {
  vi.resetModules();
  MockWebSocket.instances = [];
  global.WebSocket = MockWebSocket;
  return import('../../src/lib/liveSocket');
}

describe('liveSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('connect() opens a WebSocket derived from the API URL with a /ws path', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toMatch(/^ws:\/\/.+\/ws$/);
  });

  test('status is "connecting" immediately, then "open" once the socket opens', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    expect(liveSocket.getStatus()).toBe('connecting');
    MockWebSocket.instances[0]._open();
    expect(liveSocket.getStatus()).toBe('open');
  });

  test('subscribeStatus is notified on every status change', async () => {
    const liveSocket = await freshLiveSocket();
    const seen = [];
    liveSocket.subscribeStatus((s) => seen.push(s));
    liveSocket.connect();
    MockWebSocket.instances[0]._open();
    expect(seen).toEqual(['connecting', 'open']);
  });

  test('subscribe(event, handler) is called with the payload of a matching message', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    MockWebSocket.instances[0]._open();
    const handler = vi.fn();
    liveSocket.subscribe('inquiry:new', handler);

    MockWebSocket.instances[0]._message({ event: 'inquiry:new', payload: { id: 5 } });

    expect(handler).toHaveBeenCalledWith({ id: 5 });
  });

  test('subscribe ignores messages for other event names', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    MockWebSocket.instances[0]._open();
    const handler = vi.fn();
    liveSocket.subscribe('inquiry:new', handler);

    MockWebSocket.instances[0]._message({ event: 'load:changed', payload: {} });

    expect(handler).not.toHaveBeenCalled();
  });

  test('the unsubscribe function returned by subscribe stops further calls', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    MockWebSocket.instances[0]._open();
    const handler = vi.fn();
    const unsubscribe = liveSocket.subscribe('inquiry:new', handler);
    unsubscribe();

    MockWebSocket.instances[0]._message({ event: 'inquiry:new', payload: { id: 5 } });

    expect(handler).not.toHaveBeenCalled();
  });

  test('reconnects with exponential backoff after an unexpected close: 1s, 2s, 4s, 8s, then capped at 30s', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    MockWebSocket.instances[0]._closeFromServer();
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]._closeFromServer();
    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    MockWebSocket.instances[2]._closeFromServer();
    vi.advanceTimersByTime(4000);
    expect(MockWebSocket.instances).toHaveLength(4);

    MockWebSocket.instances[3]._closeFromServer();
    vi.advanceTimersByTime(8000);
    expect(MockWebSocket.instances).toHaveLength(5);

    MockWebSocket.instances[4]._closeFromServer();
    vi.advanceTimersByTime(29999);
    expect(MockWebSocket.instances).toHaveLength(5);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(6);
  });

  test('resets the backoff to 1s after a connection stays open for more than 5s', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    MockWebSocket.instances[0]._closeFromServer(); // burn attempt 0 (1s delay)
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]._open();
    vi.advanceTimersByTime(5001); // stays open past the stability threshold
    MockWebSocket.instances[1]._closeFromServer();

    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  test('disconnect() closes the socket and does not schedule a reconnect', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    MockWebSocket.instances[0]._open();
    liveSocket.disconnect();

    expect(liveSocket.getStatus()).toBe('closed');
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test('calling connect() while already connecting does not open a second socket', async () => {
    const liveSocket = await freshLiveSocket();
    liveSocket.connect();
    liveSocket.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
