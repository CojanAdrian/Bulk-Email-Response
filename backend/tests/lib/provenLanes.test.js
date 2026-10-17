const { findProvenCarriers, laneKey } = require('../../src/lib/provenLanes');

const load = (id, extra = {}) => ({ id, origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', ...extra });
const hist = (extra = {}) => ({
  carrier_id: 1, carrier_name: 'Swift Haul', carrier_equipment_types: null, load_equipment: null,
  origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Chicago', dest_state: 'IL',
  rate: '1900.00', ran_at: '2026-08-02', created_at: '2026-08-02T10:00:00Z', ...extra,
});

describe('laneKey', () => {
  test('is case, whitespace and punctuation insensitive', () => {
    expect(laneKey(' st. louis ', 'mo', 'Chicago', 'IL')).toBe(laneKey('ST LOUIS', 'MO', 'chicago', 'il'));
  });
  test('is null when any part is missing', () => {
    expect(laneKey('Dallas', 'TX', '', 'IL')).toBeNull();
  });
});

describe('findProvenCarriers', () => {
  test('groups runs per carrier with last date and last rate, most runs first', () => {
    const result = findProvenCarriers([load(10)], [
      hist({ ran_at: '2026-07-01', rate: '1800.00' }),
      hist({ ran_at: '2026-08-02', rate: '1900.00' }),
      hist({ carrier_id: 2, carrier_name: 'Blue Line', ran_at: '2026-06-01', rate: null }),
    ]);
    expect(result[10]).toEqual([
      { carrierId: 1, carrierName: 'Swift Haul', runs: 2, lastRanAt: '2026-08-02', lastRate: 1900 },
      { carrierId: 2, carrierName: 'Blue Line', runs: 1, lastRanAt: '2026-06-01', lastRate: null },
    ]);
  });
  test('ignores a different lane', () => {
    expect(findProvenCarriers([load(10)], [hist({ dest_city: 'Denver', dest_state: 'CO' })])).toEqual({});
  });
  test('uses the linked load equipment first, then the carrier equipment', () => {
    expect(findProvenCarriers([load(10, { equipment: 'V' })], [hist({ load_equipment: 'F', carrier_equipment_types: ['V'] })])).toEqual({});
    expect(findProvenCarriers([load(10, { equipment: 'V' })], [hist({ carrier_equipment_types: ['VR'] })])[10]).toHaveLength(1);
    expect(findProvenCarriers([load(10, { equipment: 'R' })], [hist({ load_equipment: 'VR' })])[10]).toHaveLength(1);
    expect(findProvenCarriers([load(10, { equipment: 'VR' })], [hist({ load_equipment: 'R' })])[10]).toHaveLength(1);
  });
  test('a load missing a lane end is never proven', () => {
    expect(findProvenCarriers([load(10, { dest_city: null })], [hist()])).toEqual({});
  });
  test('falls back to created_at when ran_at is null', () => {
    const result = findProvenCarriers([load(10)], [hist({ ran_at: null, created_at: '2026-05-05T00:00:00Z' })]);
    expect(result[10][0].lastRanAt).toBe('2026-05-05');
  });
  test('accepts Date objects from mysql2', () => {
    const result = findProvenCarriers([load(10)], [hist({ ran_at: new Date('2026-09-01T00:00:00Z') })]);
    expect(result[10][0].lastRanAt).toBe('2026-09-01');
  });
});
