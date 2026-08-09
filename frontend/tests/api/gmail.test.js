import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getGmailStatus, getGmailConnectUrl, disconnectGmail, setAutoSendEnabled } from '../../src/api/gmail';
import { API_URL } from '../../src/api/client';

describe('gmail api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('getGmailStatus gets /api/gmail/status', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ connected: false }) });
    await getGmailStatus();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/gmail/status');
  });

  test('getGmailConnectUrl returns the full connect URL (for a direct browser navigation, not a fetch)', () => {
    expect(getGmailConnectUrl()).toBe(`${API_URL}/api/gmail/connect`);
  });

  test('disconnectGmail posts /api/gmail/disconnect', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    await disconnectGmail();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/gmail/disconnect');
    expect(options.method).toBe('POST');
  });

  test('setAutoSendEnabled patches /api/gmail/auto-send with the requested value', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ connected: true, autoSendEnabled: true }) });
    await setAutoSendEnabled(true);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/gmail/auto-send');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ enabled: true });
  });
});
