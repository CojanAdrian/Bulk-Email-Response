import { describe, test, expect, vi, beforeEach } from 'vitest';
import { login, logout, me } from '../../src/api/auth';

describe('auth api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('login posts username and password to /api/auth/login', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ username: 'admin' }) });
    const result = await login('admin', 'secret');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/login');
    expect(JSON.parse(options.body)).toEqual({ username: 'admin', password: 'secret' });
    expect(result).toEqual({ username: 'admin' });
  });

  test('logout posts to /api/auth/logout', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    await logout();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/logout');
    expect(options.method).toBe('POST');
  });

  test('me gets /api/auth/me', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ username: 'admin' }) });
    const result = await me();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/me');
    expect(result).toEqual({ username: 'admin' });
  });

  test('me rejects when not logged in', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Unauthorized' }) });
    await expect(me()).rejects.toMatchObject({ status: 401 });
  });
});
