const { lookupCity, withCoords, normalizeCity } = require('../../src/lib/cityCoords');

describe('normalizeCity', () => {
  test.each([
    ['ST LOUIS', 'saint louis'],
    ['St. Louis', 'saint louis'],
    ['Ft Worth', 'fort worth'],
    ['Mt. Vernon', 'mount vernon'],
    ["O'FALLON", 'o fallon'],
    ['  Chicago  ', 'chicago'],
    ['East St Louis', 'east st louis'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeCity(input)).toBe(expected);
  });
});

describe('lookupCity', () => {
  test('finds a major city near its real position', () => {
    const chicago = lookupCity('Chicago', 'IL');
    expect(chicago.lat).toBeCloseTo(41.85, 0);
    expect(chicago.lng).toBeCloseTo(-87.65, 0);
  });

  test.each([
    ['ST LOUIS', 'MO'],
    ['Ft Worth', 'tx'],
    ["O'Fallon", 'MO'],
    ['MT VERNON', 'IL'],
    ['NEWPORT', 'AR'],
  ])('understands %s, %s', (city, state) => {
    expect(lookupCity(city, state)).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
  });

  test('does not confuse same-named cities in different states', () => {
    const il = lookupCity('Springfield', 'IL');
    const mo = lookupCity('Springfield', 'MO');
    expect(Math.abs(il.lng - mo.lng)).toBeGreaterThan(2);
  });

  test.each([
    ['Nowhereville', 'TX'],
    ['Chicago', ''],
    ['', 'IL'],
    [null, null],
  ])('returns null for %j, %j', (city, state) => {
    expect(lookupCity(city, state)).toBeNull();
  });
});

describe('withCoords', () => {
  test('adds coordinates for both ends of a load', () => {
    const load = withCoords({ id: 1, origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX', origin_lat: null, origin_lng: null, dest_lat: null, dest_lng: null });
    expect(load.origin_lat).toBeCloseTo(41.85, 0);
    expect(load.dest_lat).toBeCloseTo(32.8, 0);
    expect(load.dest_lng).toBeCloseTo(-96.8, 0);
  });

  test('keeps coordinates that are already stored', () => {
    const load = withCoords({ origin_city: 'Chicago', origin_state: 'IL', origin_lat: '1.5', origin_lng: '2.5', dest_city: 'Dallas', dest_state: 'TX' });
    expect(load.origin_lat).toBe('1.5');
    expect(load.origin_lng).toBe('2.5');
    expect(load.dest_lat).toEqual(expect.any(Number));
  });

  test('works when handed straight to Array.map', () => {
    const [load] = [{ origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX' }].map(withCoords);
    expect(load.origin_lat).toBeCloseTo(41.85, 0);
  });

  test("fills an inquiry's matched load when given its prefix", () => {
    const row = withCoords({ matched_load_origin_city: 'Chicago', matched_load_origin_state: 'IL', matched_load_dest_city: 'Dallas', matched_load_dest_state: 'TX' }, 'matched_load_');
    expect(row.matched_load_dest_lng).toBeCloseTo(-96.8, 0);
  });

  test('leaves a load with unknown cities untouched', () => {
    const load = { origin_city: 'Nowhereville', origin_state: 'TX', dest_city: null, dest_state: null };
    expect(withCoords(load)).toBe(load);
  });
});
