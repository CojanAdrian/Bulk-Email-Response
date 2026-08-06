import { describe, test, expect, vi, beforeEach } from 'vitest';
import { get, post, patch } from '../../src/api/client';

describe('api client', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('get() sends a GET request with credentials included', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: 'world' }),
    });
    const result = await get('/api/health');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/health'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual({ hello: 'world' });
  });

  test('post() sends a POST request with a JSON body', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    await post('/api/auth/login', { username: 'a', password: 'b' });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ username: 'a', password: 'b' });
  });

  test('patch() sends a PATCH request with a JSON body', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });
    await patch('/api/loads/1', { target_pay: 1700 });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ target_pay: 1700 });
  });

  test('throws an error with the server-provided message when the response is not ok', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    await expect(get('/api/loads')).rejects.toThrow('Unauthorized');
  });

  test('the thrown error carries the response status code', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Load not found' }),
    });
    await expect(get('/api/loads/999')).rejects.toMatchObject({ status: 404 });
  });

  test('falls back to a generic message when the error response body is not JSON', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    await expect(get('/api/loads')).rejects.toThrow('Request failed');
  });

  test('produces a clear error when the network request itself fails', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(get('/api/health')).rejects.toThrow('Network error');
  });

  test('produces a clear timeout error when the request is aborted', async () => {
    const abortError = new DOMException('The operation was aborted', 'TimeoutError');
    global.fetch.mockRejectedValue(abortError);
    await expect(get('/api/health')).rejects.toThrow('Request timed out');
  });
});
