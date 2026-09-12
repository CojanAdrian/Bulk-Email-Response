const { haversineMiles, findMatchesForLane } = require('../../src/lib/carrierMatching');

// Dallas, TX and Fort Worth, TX are ~30mi apart; Dallas and Houston, TX are
// ~225mi apart; Dallas and Chicago, IL are ~800mi apart. Real coordinates,
// used as fixed reference points throughout.
const DALLAS = { lat: 32.7767, lng: -96.797, state: 'TX' };
const FORT_WORTH = { lat: 32.7555, lng: -97.3308, state: 'TX' };
const HOUSTON = { lat: 29.7604, lng: -95.3698, state: 'TX' };
const CHICAGO = { lat: 41.8781, lng: -87.6298, state: 'IL' };
const MIAMI = { lat: 25.7617, lng: -80.1918, state: 'FL' };

describe('haversineMiles', () => {
  test('returns 0 for identical coordinates', () => {
    expect(haversineMiles(DALLAS.lat, DALLAS.lng, DALLAS.lat, DALLAS.lng)).toBe(0);
  });

  test('returns a small distance for two nearby cities', () => {
    const miles = haversineMiles(DALLAS.lat, DALLAS.lng, FORT_WORTH.lat, FORT_WORTH.lng);
    expect(miles).toBeGreaterThan(20);
    expect(miles).toBeLessThan(40);
  });

  test('returns a large distance for two far-apart cities', () => {
    const miles = haversineMiles(DALLAS.lat, DALLAS.lng, CHICAGO.lat, CHICAGO.lng);
    expect(miles).toBeGreaterThan(750);
    expect(miles).toBeLessThan(850);
  });
});

describe('findMatchesForLane', () => {
  function historyRow(overrides) {
    return {
      id: 1, carrier_id: 1, carrier_company_name: 'ABC Trucking', carrier_equipment_types: null,
      origin_lat: DALLAS.lat, origin_lng: DALLAS.lng, dest_lat: CHICAGO.lat, dest_lng: CHICAGO.lng,
      ...overrides,
    };
  }

  test('classifies a lane within 150mi of the query origin as a strong match', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].tier).toBe('strong');
  });

  test('classifies a lane 150-300mi from the query origin as a weak match', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: HOUSTON, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].tier).toBe('weak');
  });

  test('excludes a lane more than 300mi from the query origin', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: CHICAGO, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(0);
  });

  test('upgrades a strong match to perfect when the destination is also within 150mi', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: CHICAGO, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches[0].tier).toBe('perfect');
  });

  test('does not upgrade to perfect when the destination is far even if the origin is close', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({})], regionalCarriers: [],
    });
    expect(laneMatches[0].tier).toBe('strong');
  });

  test('flags an equipment mismatch without excluding the match', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: 'R',
      historyRows: [historyRow({ carrier_equipment_types: ['V'] })], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].equipmentMismatch).toBe(true);
  });

  test('does not flag a mismatch when the carrier has no equipment_types on file at all', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: 'R',
      historyRows: [historyRow({ carrier_equipment_types: null })], regionalCarriers: [],
    });
    expect(laneMatches[0].equipmentMismatch).toBe(false);
  });

  test('does not flag a mismatch when the carrier\'s equipment includes the queried type', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: 'R',
      historyRows: [historyRow({ carrier_equipment_types: ['V', 'R'] })], regionalCarriers: [],
    });
    expect(laneMatches[0].equipmentMismatch).toBe(false);
  });

  test('groups multiple history rows for the same carrier, keeping only the best-tier entry', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: CHICAGO, equipment: null,
      historyRows: [
        historyRow({ id: 1, origin_lat: HOUSTON.lat, origin_lng: HOUSTON.lng, dest_lat: MIAMI.lat, dest_lng: MIAMI.lng }), // weak
        historyRow({ id: 2, origin_lat: FORT_WORTH.lat, origin_lng: FORT_WORTH.lng, dest_lat: CHICAGO.lat, dest_lng: CHICAGO.lng }), // perfect
      ],
      regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(1);
    expect(laneMatches[0].tier).toBe('perfect');
    expect(laneMatches[0].laneCount).toBe(2);
  });

  test('sorts matches perfect > strong > weak, then by distance within a tier', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [
        historyRow({ id: 1, carrier_id: 1, carrier_company_name: 'Weak Co', origin_lat: HOUSTON.lat, origin_lng: HOUSTON.lng }),
        historyRow({ id: 2, carrier_id: 2, carrier_company_name: 'Strong Co', origin_lat: FORT_WORTH.lat, origin_lng: FORT_WORTH.lng }),
        historyRow({ id: 3, carrier_id: 3, carrier_company_name: 'Perfect Co', origin_lat: DALLAS.lat, origin_lng: DALLAS.lng, dest_lat: MIAMI.lat, dest_lng: MIAMI.lng }),
      ],
      regionalCarriers: [],
    });
    expect(laneMatches.map((m) => m.carrierName)).toEqual(['Perfect Co', 'Strong Co', 'Weak Co']);
  });

  test('a carrier with no lane history rows but a tagged origin state is a regional match', () => {
    const { regionalMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [], regionalCarriers: [{ id: 9, company_name: 'Regional Co', operating_states: ['TX', 'OK'] }],
    });
    expect(regionalMatches).toHaveLength(1);
    expect(regionalMatches[0].tier).toBe('regional');
  });

  test('upgrades to regional_perfect when both origin and destination states are tagged', () => {
    const { regionalMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [], regionalCarriers: [{ id: 9, company_name: 'Regional Co', operating_states: ['TX', 'FL'] }],
    });
    expect(regionalMatches[0].tier).toBe('regional_perfect');
  });

  test('excludes a regional carrier whose tagged states include neither the origin nor destination state', () => {
    const { regionalMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [], regionalCarriers: [{ id: 9, company_name: 'Regional Co', operating_states: ['CA', 'OR'] }],
    });
    expect(regionalMatches).toHaveLength(0);
  });

  test('a carrier with real lane history is never also returned as a regional match, even if tagged', () => {
    const { laneMatches, regionalMatches } = findMatchesForLane({
      queryOrigin: FORT_WORTH, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({ carrier_id: 9 })],
      regionalCarriers: [{ id: 9, company_name: 'ABC Trucking', operating_states: ['TX'] }],
    });
    expect(laneMatches).toHaveLength(1);
    expect(regionalMatches).toHaveLength(0);
  });

  test('handles a history row with no cached coordinates (never geocoded) without crashing', () => {
    const { laneMatches } = findMatchesForLane({
      queryOrigin: DALLAS, queryDest: MIAMI, equipment: null,
      historyRows: [historyRow({ origin_lat: null, origin_lng: null })], regionalCarriers: [],
    });
    expect(laneMatches).toHaveLength(0);
  });
});
