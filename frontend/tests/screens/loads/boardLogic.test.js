import { describe, test, expect } from 'vitest';
import { countByStatus, hasNoRate, lanesFor, schedule, visibleLoads } from '../../../src/screens/loads/boardLogic';

const LOADS = [
  { id: 1, load_number: 'A100', status: 'active', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', target_pay: '1500.00', early_pu: '2026-07-02T08:00:00', equipment: 'V', customer: 'ALDI, Inc' },
  { id: 2, load_number: 'A200', status: 'active', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Columbus', dest_state: 'OH', target_pay: null, early_pu: '2026-07-01T08:00:00', equipment: 'R' },
  { id: 3, load_number: 'B300', status: 'booked', origin_city: 'Laredo', origin_state: 'TX', dest_city: 'Memphis', dest_state: 'TN', target_pay: '2900.00', equipment: 'V' },
  { id: 4, load_number: 'A400', status: 'active', origin_city: 'Fresno', origin_state: 'CA', dest_city: 'Denver', dest_state: 'CO', target_pay: '3650.00', equipment: 'R' },
];
const ids = (rows) => rows.map((load) => load.id);

describe('countByStatus', () => {
  test('counts each status and ignores unknown ones', () => {
    expect(countByStatus([...LOADS, { id: 9, status: 'expired' }])).toEqual({ active: 3, booked: 1, covered: 0 });
  });
});

describe('visibleLoads', () => {
  test('shows only the chosen status, in the order given', () => {
    expect(ids(visibleLoads({ loads: LOADS, status: 'active' }))).toEqual([1, 2, 4]);
    expect(ids(visibleLoads({ loads: LOADS, status: 'booked' }))).toEqual([3]);
  });

  test.each([
    ['a200', [2]],
    ['tx', [1]],
    ['columbus', [2]],
    ['aldi', [1]],
    ['  DENVER ', [4]],
    ['nothing', []],
  ])('search %j finds %j', (query, expected) => {
    expect(ids(visibleLoads({ loads: LOADS, status: 'active', query }))).toEqual(expected);
  });

  test('the proven filter keeps loads someone has already run', () => {
    expect(ids(visibleLoads({ loads: LOADS, status: 'active', quick: 'proven', proven: { 4: [{ carrierId: 7 }], 1: [] } }))).toEqual([4]);
  });

  test('the needs-rate filter keeps loads with no rate', () => {
    expect(ids(visibleLoads({ loads: LOADS, status: 'active', quick: 'needs_rate' }))).toEqual([2]);
  });

  test('sorts by rate from high to low', () => {
    expect(ids(visibleLoads({ loads: LOADS, status: 'active', sort: 'target_pay' }))).toEqual([4, 1, 2]);
  });

  test('sorts by pickup time with unscheduled loads last', () => {
    expect(ids(visibleLoads({ loads: LOADS, status: 'active', sort: 'pu' }))).toEqual([2, 1, 4]);
  });

  test('sorts by origin state, then city', () => {
    expect(ids(visibleLoads({ loads: LOADS, status: 'active', sort: 'origin' }))).toEqual([4, 2, 1]);
  });
});

describe('hasNoRate', () => {
  test.each([[null, true], [undefined, true], ['', true], ['0.00', false], [1500, false]])('%j -> %s', (target_pay, expected) => {
    expect(hasNoRate({ target_pay })).toBe(expected);
  });
});

describe('schedule', () => {
  test('one time is an appointment', () => {
    expect(schedule('2026-11-16T10:00:00', null)).toEqual({ day: 'Nov 16', hours: '10am', kind: 'APPT' });
  });

  test('the same time twice is an appointment', () => {
    expect(schedule('2026-11-16T14:30:00', '2026-11-16T14:30:00')).toEqual({ day: 'Nov 16', hours: '2:30pm', kind: 'APPT' });
  });

  test('a window on one day is first come, first served', () => {
    expect(schedule('2026-11-16T08:00:00', '2026-11-16T14:00:00')).toEqual({ day: 'Nov 16', hours: '8am–2pm', kind: 'FCFS' });
  });

  test('a window across days names the end day', () => {
    expect(schedule('2026-11-16T08:00:00', '2026-11-17T12:00:00')).toEqual({ day: 'Nov 16', hours: '8am–Nov 17 12pm', kind: 'FCFS' });
  });

  test('is null with no times, or unreadable ones', () => {
    expect(schedule(null, undefined)).toBeNull();
    expect(schedule('not a date', '')).toBeNull();
  });
});

describe('lanesFor', () => {
  test('makes a lane for each load with coordinates at both ends, gold when proven', () => {
    const loads = [
      { id: 1, origin_city: 'Dallas', dest_city: 'Chicago', origin_lat: '32.78', origin_lng: '-96.8', dest_lat: 41.88, dest_lng: -87.63 },
      { id: 2, origin_city: 'Nowhere', dest_city: 'Chicago', origin_lat: null, origin_lng: null, dest_lat: 41.88, dest_lng: -87.63 },
    ];
    expect(lanesFor(loads, { 1: [{ carrierId: 7 }] })).toEqual([
      { id: 1, from: [-96.8, 32.78], to: [-87.63, 41.88], fromLabel: 'Dallas', toLabel: 'Chicago', gold: true },
    ]);
  });
});
