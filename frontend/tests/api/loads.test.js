import { describe, test, expect, vi, beforeEach } from 'vitest';
import { listLoads, getLoad, updateLoad, deleteLoad, uploadLoads } from '../../src/api/loads';

describe('loads api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('listLoads gets /api/loads with no filter when called with no argument', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listLoads();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads');
    expect(url).not.toContain('?status=');
  });

  test('listLoads gets /api/loads?status=... when given a filter', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listLoads('active');
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads?status=active');
  });

  test('getLoad gets /api/loads/:id', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await getLoad(1);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/1');
  });

  test('updateLoad patches /api/loads/:id with the given data', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await updateLoad(1, { target_pay: 1700 });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/1');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ target_pay: 1700 });
  });

  test('deleteLoad sends a DELETE to /api/loads/:id', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    await deleteLoad(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/1');
    expect(options.method).toBe('DELETE');
  });

  test('uploadLoads posts /api/loads/upload with a loads array', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ inserted: 1, updated: 0 }) });
    await uploadLoads([{ load_number: 'L1' }]);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/loads/upload');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ loads: [{ load_number: 'L1' }] });
  });
});
