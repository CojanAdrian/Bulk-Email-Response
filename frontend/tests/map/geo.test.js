import { describe, test, expect } from 'vitest';
import { project, laneGeometry, pointOnLane, roadMiles, MAP_WIDTH, MAP_HEIGHT } from '../../src/map/geo';

const CHICAGO = [-87.63, 41.88];
const DALLAS = [-96.8, 32.78];
const DENVER = [-104.99, 39.74];
const MID_ATLANTIC_OCEAN = [-40, 35];

describe('project', () => {
  test('puts a US city inside the map frame', () => {
    const [x, y] = project(CHICAGO);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(MAP_WIDTH);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(MAP_HEIGHT);
  });

  test('returns null for a point outside the United States', () => {
    expect(project(MID_ATLANTIC_OCEAN)).toBeNull();
  });

  test.each([[null], [undefined], [[1]], [['a', 'b']], [[NaN, 2]]])('returns null for %j', (value) => {
    expect(project(value)).toBeNull();
  });
});

describe('laneGeometry', () => {
  test('bows upward for a west-to-east lane', () => {
    const { A, B, C } = laneGeometry(DENVER, CHICAGO);
    expect(C[1]).toBeLessThan(Math.min(A[1], B[1]));
  });

  test('bows upward for an east-to-west lane too', () => {
    const { A, B, C } = laneGeometry(CHICAGO, DENVER);
    expect(C[1]).toBeLessThan(Math.min(A[1], B[1]));
  });

  test('is null when either end is off the map', () => {
    expect(laneGeometry(CHICAGO, MID_ATLANTIC_OCEAN)).toBeNull();
  });

  test('pointOnLane starts at the origin and ends at the destination', () => {
    const geometry = laneGeometry(CHICAGO, DALLAS);
    expect(pointOnLane(geometry, 0)).toEqual(geometry.A);
    expect(pointOnLane(geometry, 1)).toEqual(geometry.B);
  });
});

describe('roadMiles', () => {
  test('Chicago to Dallas is roughly the real driving distance', () => {
    const miles = roadMiles(CHICAGO, DALLAS);
    expect(miles).toBeGreaterThan(900);
    expect(miles).toBeLessThan(1000);
    expect(miles % 10).toBe(0);
  });

  test('is null without both ends', () => {
    expect(roadMiles(CHICAGO, null)).toBeNull();
  });
});
