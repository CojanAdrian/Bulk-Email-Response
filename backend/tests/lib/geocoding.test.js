require('dotenv').config();
const { geocodeCityState } = require('../../src/lib/geocoding');
const { createTestPool } = require('../setupTestDb');

describe('geocodeCityState', () => {
  let pool;
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = global.fetch;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM geocode_cache');
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
    global.fetch = jest.fn();
  });

  test('calls the Google Maps API and caches the result on a cache miss', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ results: [{ geometry: { location: { lat: 32.7767, lng: -96.797 } } }] }),
    });

    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    expect(result).toEqual({ lat: 32.7767, lng: -96.797 });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [cached] = await pool.query('SELECT * FROM geocode_cache WHERE city_state_key = ?', ['dallas|tx']);
    expect(cached).toHaveLength(1);
  });

  test('skips the API call on a cache hit', async () => {
    await pool.query('INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?)', ['dallas|tx', 32.7767, -96.797]);

    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    expect(result).toEqual({ lat: 32.7767, lng: -96.797 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('cache lookup is case-insensitive', async () => {
    await pool.query('INSERT INTO geocode_cache (city_state_key, lat, lng) VALUES (?, ?, ?)', ['dallas|tx', 32.7767, -96.797]);

    const result = await geocodeCityState(pool, 'DALLAS', 'tx');
    expect(result).toEqual({ lat: 32.7767, lng: -96.797 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null without throwing when the API returns no results', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ results: [] }) });

    const result = await geocodeCityState(pool, 'Nonexistentville', 'ZZ');
    expect(result).toBeNull();
  });

  test('returns null without throwing when the API call itself fails', async () => {
    global.fetch.mockRejectedValue(new Error('network error'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    consoleErrorSpy.mockRestore();
    expect(result).toBeNull();
  });

  test('returns null and does not call the API when GOOGLE_MAPS_API_KEY is not set', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await geocodeCityState(pool, 'Dallas', 'TX');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null for a blank city and state without querying the API', async () => {
    const result = await geocodeCityState(pool, '', '');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
